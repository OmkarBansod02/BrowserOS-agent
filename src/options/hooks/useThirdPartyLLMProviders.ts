import { useCallback, useEffect, useState } from 'react'
import { MessageType } from '@/lib/types/messaging'
import {
  DEFAULT_THIRD_PARTY_CONFIG,
  DEFAULT_THIRD_PARTY_PROVIDERS, 
  ThirdPartyLLMConfig,
  ThirdPartyLLMProvider
} from '../types/third-party-llm'

type ProviderInput = Pick<ThirdPartyLLMProvider, 'name' | 'url'>

interface UseThirdPartyLLMProvidersResult {
  providers: ThirdPartyLLMProvider[]
  selectedProviderId: string | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  isBrowserOS: boolean
  addProvider: (provider: ProviderInput) => Promise<void>
  updateProvider: (id: string, provider: ProviderInput) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  setSelectedProvider: (id: string) => Promise<void>
  refresh: () => Promise<void>
}


const PROVIDERS_PREF_KEY = 'browseros.custom_providers'

function createHashId(name: string, url: string, index: number): string {
  const normalized = `${name.trim().toLowerCase()}|${url.trim().toLowerCase()}`
  if (normalized) {
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0
    }
    return `providers-hub-${hash.toString(16)}-${index}`
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `providers-hub-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function ensureProtocol(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

function normalizeUrlForComparison(url: string): string {
  try {
    const normalized = ensureProtocol(url)
    const parsed = new URL(normalized)
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${pathname}`
  } catch {
    return url.trim().toLowerCase()
  }
}

function mapToProviderList(entries: Array<{ name?: unknown; url?: unknown }>): ThirdPartyLLMProvider[] {
  return entries
    .map((entry, index) => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : ''
      const url = typeof entry.url === 'string' ? entry.url.trim() : ''
      if (!name || !url) return null

      const builtIn = DEFAULT_THIRD_PARTY_PROVIDERS.some(defaultProvider => {
        const sameName = defaultProvider.name.trim().toLowerCase() === name.toLowerCase()
        const sameUrl = normalizeUrlForComparison(defaultProvider.url) === normalizeUrlForComparison(url)
        return sameName && sameUrl
      })

      return {
        id: createHashId(name, url, index),
        name,
        url,
        isBuiltIn: builtIn
      } as ThirdPartyLLMProvider
    })
    .filter((provider): provider is ThirdPartyLLMProvider => Boolean(provider))
}

function coerceToProviders(raw: unknown): ThirdPartyLLMProvider[] {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return coerceToProviders(parsed)
    } catch {
      return []
    }
  }

  if (!Array.isArray(raw)) {
    return []
  }

  return mapToProviderList(raw as Array<{ name?: unknown; url?: unknown }>)
}

function coerceToConfig(raw: unknown): ThirdPartyLLMConfig | null {
  if (raw == null) return null
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  const providers = coerceToProviders((value as any).providers)
  if (!providers.length) {
    return null
  }

  const rawSelected = (value as any).selected_provider
  let selected = 0
  if (typeof rawSelected === 'number' && Number.isFinite(rawSelected)) {
    selected = rawSelected
  } else if (typeof rawSelected === 'string') {
    const parsed = parseInt(rawSelected, 10)
    if (!Number.isNaN(parsed)) {
      selected = parsed
    }
  }

  return {
    providers: providers.map(provider => ({ name: provider.name, url: provider.url })),
    selected_provider: selected
  }
}

function sanitizeConfig(config: ThirdPartyLLMConfig | null): {
  providers: ThirdPartyLLMProvider[]
  selectedProviderId: string | null
} {
  const baseConfig = config ?? DEFAULT_THIRD_PARTY_CONFIG

  const providers = mapToProviderList(baseConfig.providers)
  const fallbackProviders = providers.length ? providers : mapToProviderList(DEFAULT_THIRD_PARTY_CONFIG.providers)
  const safeProviders = fallbackProviders.length ? fallbackProviders : [
    {
      id: createHashId('BrowserOS', 'https://browseros.ai/', 0),
      name: 'BrowserOS',
      url: 'https://browseros.ai/',
      isBuiltIn: true
    }
  ]

  const selectedIndex = Math.min(
    Math.max(0, baseConfig.selected_provider ?? 0),
    safeProviders.length - 1
  )

  return {
    providers: safeProviders,
    selectedProviderId: safeProviders[selectedIndex]?.id ?? safeProviders[0]?.id ?? null
  }
}

// Simple request/response helper that creates a new port for each request
async function sendRequest<T>(
  messageType: MessageType,
  payload: unknown,
  responseType: MessageType
): Promise<T> {
  return new Promise((resolve, reject) => {
    const messageId = `${messageType}-${Date.now()}-${Math.random()}`
    const port = chrome.runtime.connect({ name: 'providers-hub-request' })

    const timeoutId = setTimeout(() => {
      port.disconnect()
      reject(new Error(`Request ${messageType} timed out after 10000ms`))
    }, 10000)

    const messageHandler = (msg: any) => {
      if (msg.id === messageId && msg.type === responseType) {
        clearTimeout(timeoutId)
        port.disconnect()
        resolve(msg.payload as T)
      } else if (msg.id === messageId && msg.type === MessageType.ERROR) {
        clearTimeout(timeoutId)
        port.disconnect()
        reject(new Error(msg.payload?.error || 'Request failed'))
      }
    }

    port.onMessage.addListener(messageHandler)
    port.onDisconnect.addListener(() => {
      clearTimeout(timeoutId)
      // Port disconnected, but don't reject if we already resolved
    })

    port.postMessage({
      type: messageType,
      payload,
      id: messageId
    })
  })
}

function getInitialProviders(): ThirdPartyLLMProvider[] {
  return mapToProviderList(DEFAULT_THIRD_PARTY_CONFIG.providers)
}

export function useThirdPartyLLMProviders(): UseThirdPartyLLMProvidersResult {
  const [providers, setProviders] = useState<ThirdPartyLLMProvider[]>(() => getInitialProviders())
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => getInitialProviders()[0]?.id ?? null
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBrowserOS, setIsBrowserOS] = useState(false)

  const loadProviders = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await sendRequest<{ name: string; value: unknown }>(
        MessageType.SETTINGS_GET_PREF,
        { name: PROVIDERS_PREF_KEY },
        MessageType.SETTINGS_GET_PREF_RESPONSE
      )

      if (response?.value != null) {
        // Browser stores simple array [{name, url}]
        const loadedProviders = coerceToProviders(response.value)

        setIsBrowserOS(true)
        setProviders(loadedProviders)

        // Load selected provider from localStorage (extension-only state)
        const savedSelectedId = localStorage.getItem('providers-hub-selected')
        setSelectedProviderId(savedSelectedId || (loadedProviders[0]?.id ?? null))

        setIsLoading(false)
        return
      }

      // No existing data - initialize with defaults
      const defaultProvidersArray = DEFAULT_THIRD_PARTY_PROVIDERS.map(p => ({
        name: p.name,
        url: p.url
      }))

      const setResponse = await sendRequest<{ name: string; success: boolean }>(
        MessageType.SETTINGS_SET_PREF,
        { name: PROVIDERS_PREF_KEY, value: defaultProvidersArray },
        MessageType.SETTINGS_SET_PREF_RESPONSE
      )

      if (setResponse?.success) {
        setIsBrowserOS(true)
        const defaultProviders = mapToProviderList(defaultProvidersArray)
        setProviders(defaultProviders)
        setSelectedProviderId(defaultProviders[0]?.id ?? null)
      } else {
        throw new Error('Failed to initialize')
      }
    } catch (err) {
      // Fallback to demo mode
      setIsBrowserOS(false)
      const defaults = mapToProviderList(DEFAULT_THIRD_PARTY_PROVIDERS)
      setProviders(defaults)
      setSelectedProviderId(defaults[0]?.id ?? null)
      setError('This feature requires BrowserOS browser. Showing demo providers.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load providers on mount
  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const persistConfig = useCallback(
    async (updatedProviders: ThirdPartyLLMProvider[], selectedId: string | null) => {
      if (!isBrowserOS) {
        throw new Error('This feature requires BrowserOS browser')
      }

      // Browser expects simple array [{name, url}]
      const simpleProvidersArray = updatedProviders.map(provider => ({
        name: provider.name.trim(),
        url: provider.url.trim()
      }))

      // Save selected provider to localStorage (extension-only)
      if (selectedId) {
        localStorage.setItem('providers-hub-selected', selectedId)
      }

      try {
        const response = await sendRequest<{ name: string; success: boolean }>(
          MessageType.SETTINGS_SET_PREF,
          { name: PROVIDERS_PREF_KEY, value: simpleProvidersArray },
          MessageType.SETTINGS_SET_PREF_RESPONSE
        )

        if (!response?.success) {
          throw new Error('Failed to save providers to BrowserOS preferences')
        }
      } catch (err) {
        throw err
      }
    },
    [isBrowserOS]
  )

  const addProvider = useCallback(async (provider: ProviderInput) => {
    if (!isBrowserOS) {
      throw new Error('This feature requires BrowserOS browser')
    }

    const name = provider.name.trim()
    const url = ensureProtocol(provider.url)

    if (!name) {
      throw new Error('Provider name is required')
    }

    if (!url) {
      throw new Error('Provider URL is required')
    }

    let parsedUrl: URL | null = null
    try {
      parsedUrl = new URL(url)
    } catch {
      throw new Error('Please enter a valid URL (example: https://example.com)')
    }

    const newProvider: ThirdPartyLLMProvider = {
      id: createHashId(name, parsedUrl.toString(), providers.length + 1),
      name,
      url: parsedUrl.toString(),
      isBuiltIn: false
    }

    const previousProviders = providers
    const previousSelectedId = selectedProviderId
    const updatedProviders = [...providers, newProvider]
    const updatedSelectedId = previousProviders.length === 0 ? newProvider.id : previousSelectedId

    setIsSaving(true)
    setProviders(updatedProviders)
    if (!previousSelectedId) {
      setSelectedProviderId(updatedSelectedId)
    }

    try {
      await persistConfig(updatedProviders, updatedSelectedId ?? newProvider.id)
      if (!previousSelectedId) {
        setSelectedProviderId(updatedSelectedId ?? newProvider.id)
      }
    } catch (error) {
      setProviders(previousProviders)
      setSelectedProviderId(previousSelectedId ?? null)
      setIsSaving(false)
      throw error
    }

    setIsSaving(false)
  }, [persistConfig, providers, selectedProviderId, isBrowserOS])

  const updateProvider = useCallback(async (id: string, provider: ProviderInput) => {
    if (!isBrowserOS) {
      throw new Error('This feature requires BrowserOS browser')
    }

    const name = provider.name.trim()
    const url = ensureProtocol(provider.url)

    if (!name) {
      throw new Error('Provider name is required')
    }

    if (!url) {
      throw new Error('Provider URL is required')
    }

    try {
      // Validate URL
      new URL(url)
    } catch {
      throw new Error('Please enter a valid URL (example: https://example.com)')
    }

    const previousProviders = providers
    const updatedProviders = providers.map(existing => {
      if (existing.id !== id) return existing
      return {
        ...existing,
        name,
        url
      }
    })

    setIsSaving(true)
    setProviders(updatedProviders)

    try {
      await persistConfig(updatedProviders, selectedProviderId)
    } catch (error) {
      setProviders(previousProviders)
      setIsSaving(false)
      throw error
    }

    setIsSaving(false)
  }, [persistConfig, providers, selectedProviderId, isBrowserOS])

  const deleteProvider = useCallback(async (id: string) => {
    if (!isBrowserOS) {
      throw new Error('This feature requires BrowserOS browser')
    }

    if (providers.length <= 1) {
      throw new Error('At least one provider must remain configured')
    }

    const provider = providers.find(item => item.id === id)
    if (!provider) return

    const previousProviders = providers
    const previousSelectedId = selectedProviderId

    const updatedProviders = providers.filter(item => item.id !== id)

    let nextSelectedId = previousSelectedId
    if (previousSelectedId === id) {
      nextSelectedId = updatedProviders[0]?.id ?? null
    }

    setIsSaving(true)
    setProviders(updatedProviders)
    setSelectedProviderId(nextSelectedId ?? null)

    try {
      await persistConfig(updatedProviders, nextSelectedId)
    } catch (error) {
      setProviders(previousProviders)
      setSelectedProviderId(previousSelectedId ?? null)
      setIsSaving(false)
      throw error
    }

    setIsSaving(false)
  }, [persistConfig, providers, selectedProviderId, isBrowserOS])

  const setSelectedProvider = useCallback(async (id: string) => {
    if (!isBrowserOS) {
      throw new Error('This feature requires BrowserOS browser')
    }

    if (id === selectedProviderId) return

    if (!providers.some(provider => provider.id === id)) {
      throw new Error('Provider not found')
    }

    const previousSelectedId = selectedProviderId
    setIsSaving(true)
    setSelectedProviderId(id)

    try {
      await persistConfig(providers, id)
    } catch (error) {
      setSelectedProviderId(previousSelectedId ?? null)
      setIsSaving(false)
      throw error
    }

    setIsSaving(false)
  }, [persistConfig, providers, selectedProviderId, isBrowserOS])

  const refresh = useCallback(async () => {
    await loadProviders()
  }, [loadProviders])

  return {
    providers,
    selectedProviderId,
    isLoading,
    isSaving,
    error,
    isBrowserOS,
    addProvider,
    updateProvider,
    deleteProvider,
    setSelectedProvider,
    refresh
  }
}