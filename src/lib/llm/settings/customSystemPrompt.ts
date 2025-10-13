import { BrowserOSProvider, BrowserOSProvidersConfig } from './browserOSTypes'
import { LLMSettingsReader } from './LLMSettingsReader'

let cachedProvider: BrowserOSProvider | null = null

const cloneProvider = (provider: BrowserOSProvider | null): BrowserOSProvider | null => {
  if (!provider) return null
  return { ...provider }
}

const extractDefaultProvider = (config: BrowserOSProvidersConfig | null): BrowserOSProvider | null => {
  if (!config) return null
  const provider = config.providers.find(p => p.id === config.defaultProviderId) || config.providers[0] || null
  return provider ? { ...provider } : null
}

const readDefaultProvider = async (): Promise<BrowserOSProvider | null> => {
  try {
    const config = await LLMSettingsReader.readAllProviders()
    return extractDefaultProvider(config)
  } catch (error) {
    console.warn('[customSystemPrompt] Failed to read providers config:', error)
    return null
  }
}

export const clearCustomSystemPromptCache = (): void => {
  cachedProvider = null
}

export const setCachedDefaultProvider = (provider: BrowserOSProvider | null): void => {
  cachedProvider = cloneProvider(provider)
}

export const getCachedDefaultProvider = async (): Promise<BrowserOSProvider | null> => {
  if (cachedProvider) {
    return cachedProvider
  }
  const provider = await readDefaultProvider()
  cachedProvider = cloneProvider(provider)
  return cachedProvider
}

export const applyCustomSystemPrompt = async (basePrompt: string): Promise<string> => {
  try {
    const provider = await getCachedDefaultProvider()
    if (!provider || provider.type !== 'browseros') {
      return basePrompt
    }
    const customPrompt = (provider.systemPrompt ?? '').trim()
    if (!customPrompt) {
      return basePrompt
    }
    return `${customPrompt}\n\n${basePrompt}`
  } catch (error) {
    console.warn('[customSystemPrompt] Failed to apply custom prompt:', error)
    return basePrompt
  }
}
