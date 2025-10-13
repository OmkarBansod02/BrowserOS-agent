import { useState, useEffect, useCallback, useRef } from 'react'
import { LLMProvider } from '../types/llm-settings'
import { MessageType } from '@/lib/types/messaging'
import { PortMessaging, PortPrefix } from '@/lib/runtime/PortMessaging'
import { BrowserOSProvidersConfig } from '@/lib/llm/settings/browserOSTypes'

const DEFAULT_BROWSEROS_PROVIDER: LLMProvider = {
  id: 'browseros',
  name: 'BrowserOS',
  type: 'browseros',
  isBuiltIn: true,
  isDefault: true,
  systemPrompt: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

export function useBrowserOSPrefs() {
  const [providers, setProviders] = useState<LLMProvider[]>([DEFAULT_BROWSEROS_PROVIDER])
  const [defaultProvider, setDefaultProviderState] = useState<string>('browseros')
  const [isLoading, setIsLoading] = useState(true)
  const messagingRef = useRef<PortMessaging | null>(null)

  // Setup persistent port connection
  useEffect(() => {
    const messaging = PortMessaging.getInstance()
    messagingRef.current = messaging

    const handleWorkflowStatus = (payload: any) => {
      if (payload?.status === 'error') {
        console.error('[useBrowserOSPrefs] Error from background:', payload.error)
      }

      if (payload?.data?.providersConfig) {
        const config = payload.data.providersConfig as BrowserOSProvidersConfig
        const migratedProviders = config.providers.map(p => ({
          ...p,
          isDefault: p.isDefault !== undefined ? p.isDefault : (p.id === 'browseros'),
          systemPrompt: typeof p.systemPrompt === 'string' ? p.systemPrompt : ''
        }))
        setProviders(migratedProviders)
        setDefaultProviderState(config.defaultProviderId || 'browseros')
        setIsLoading(false)
      }
    }

    messaging.addMessageListener<any>(MessageType.WORKFLOW_STATUS, handleWorkflowStatus)

    let connected = messaging.isConnected()
    if (!connected) {
      connected = messaging.connect(PortPrefix.OPTIONS, true)
      if (!connected) {
        console.error('[useBrowserOSPrefs] Failed to connect to background port')
        setIsLoading(false)
      }
    }

    // Add delay to ensure port is ready before sending message
    const initialTimeout = setTimeout(() => {
      if (messaging.isConnected()) {
        messaging.sendMessage(
          MessageType.GET_LLM_PROVIDERS,
          {},
          `get-providers-${Date.now()}`
        )
      }
    }, 100)

    // Also request again after a bit more time in case first one fails
    const retryTimeout = setTimeout(() => {
      if (messaging.isConnected()) {
        messaging.sendMessage(
          MessageType.GET_LLM_PROVIDERS,
          {},
          `get-providers-retry-${Date.now()}`
        )
      }
    }, 500)

    return () => {
      clearTimeout(initialTimeout)
      clearTimeout(retryTimeout)
      messaging.removeMessageListener(MessageType.WORKFLOW_STATUS, handleWorkflowStatus)
      if (messaging.isConnected()) {
        messaging.disconnect()
      }
      messagingRef.current = null
    }
  }, [])

  const saveProvidersConfig = useCallback(async (updatedProviders: LLMProvider[], newDefaultId?: string) => {
    const messaging = messagingRef.current
    if (!messaging) {
      console.error('[useBrowserOSPrefs] Messaging not initialized')
      return false
    }

    const normalizedProviders = updatedProviders.map(provider => ({
      ...provider,
      systemPrompt: typeof provider.systemPrompt === 'string' ? provider.systemPrompt : ''
    }))

    const config: BrowserOSProvidersConfig = {
      defaultProviderId: newDefaultId || defaultProvider,
      providers: normalizedProviders
    }

    // Send via persistent port - broadcast will update state automatically
    const sent = messaging.sendMessage(
      MessageType.SAVE_LLM_PROVIDERS,
      config,
      `save-providers-${Date.now()}`
    )

    if (!sent) {
      console.error('[useBrowserOSPrefs] Failed to send providers config')
      return false
    }

    return true
  }, [defaultProvider])

  const setDefaultProvider = useCallback(async (providerId: string) => {
    setDefaultProviderState(providerId)
    const normalizedProviders = providers.map(provider => ({
      ...provider,
      isDefault: provider.id === providerId,
      systemPrompt: typeof provider.systemPrompt === 'string' ? provider.systemPrompt : ''
    }))
    setProviders(normalizedProviders)
    await saveProvidersConfig(normalizedProviders, providerId)
  }, [providers, saveProvidersConfig])

  const addProvider = useCallback(async (provider: LLMProvider) => {
    const newProvider = {
      ...provider,
      id: provider.id || crypto.randomUUID(),
      isDefault: false,  // Ensure isDefault is always set
      isBuiltIn: provider.isBuiltIn || false,
      systemPrompt: typeof provider.systemPrompt === 'string' ? provider.systemPrompt : '',
      createdAt: provider.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const updatedProviders = [...providers, newProvider]
    const normalizedProviders = updatedProviders.map(p => ({
      ...p,
      systemPrompt: typeof p.systemPrompt === 'string' ? p.systemPrompt : ''
    }))
    setProviders(normalizedProviders)
    await saveProvidersConfig(normalizedProviders)
    return newProvider
  }, [providers, saveProvidersConfig])

  const updateProvider = useCallback(async (provider: LLMProvider) => {
    const updatedProvider = {
      ...provider,
      isDefault: provider.id === defaultProvider,
      systemPrompt: typeof provider.systemPrompt === 'string' ? provider.systemPrompt : '',
      updatedAt: new Date().toISOString()
    }
    const updatedProviders = providers.map(p =>
      p.id === provider.id
        ? updatedProvider
        : { ...p, isDefault: p.id === defaultProvider }
    )
    const normalizedProviders = updatedProviders.map(p => ({
      ...p,
      systemPrompt: typeof p.systemPrompt === 'string' ? p.systemPrompt : ''
    }))
    setProviders(normalizedProviders)
    await saveProvidersConfig(normalizedProviders)
    return updatedProvider
  }, [providers, defaultProvider, saveProvidersConfig])

  const deleteProvider = useCallback(async (providerId: string) => {
    const remainingProviders = providers.filter(p => p.id !== providerId)

    let nextDefaultId = defaultProvider
    if (providerId === defaultProvider) {
      const browserOSProvider = remainingProviders.find(p => p.id === 'browseros')
      nextDefaultId = browserOSProvider?.id || remainingProviders[0]?.id || 'browseros'
      setDefaultProviderState(nextDefaultId)
    }

    const normalizedProviders = remainingProviders.map(p => ({
      ...p,
      isDefault: p.id === nextDefaultId,
      systemPrompt: typeof p.systemPrompt === 'string' ? p.systemPrompt : ''
    }))

    setProviders(normalizedProviders)
    await saveProvidersConfig(normalizedProviders, nextDefaultId)
  }, [providers, defaultProvider, saveProvidersConfig])

  return {
    providers,
    defaultProvider,
    isLoading,
    setDefaultProvider,
    addProvider,
    updateProvider,
    deleteProvider
  }
}
