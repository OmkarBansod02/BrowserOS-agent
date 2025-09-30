import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { LLMProvider, ProviderType } from '../types/llm-settings'

interface AddProviderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (provider: Partial<LLMProvider>) => Promise<void>
  editProvider?: LLMProvider | null
}

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google_gemini', label: 'Google Gemini' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai_compatible', label: 'OpenAI Compatible' }
]

const MODEL_OPTIONS: Record<ProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-2.1'],
  google_gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro', 'gemini-pro-vision'],
  ollama: ['llama2', 'mistral', 'codellama', 'phi', 'neural-chat', 'qwen3:4b'],
  openrouter: ['auto', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
  openai_compatible: ['custom'],
  browseros: ['auto'],
  custom: ['custom']
}

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google_gemini: 'https://generativelanguage.googleapis.com',
  ollama: 'http://localhost:11434',
  openrouter: 'https://openrouter.ai/api/v1',
  openai_compatible: '',
  browseros: '',
  custom: ''
}

export function AddProviderModal({ isOpen, onClose, onSave, editProvider }: AddProviderModalProps) {
  const [providerType, setProviderType] = useState<ProviderType>('openai')
  const [providerName, setProviderName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [supportsImages, setSupportsImages] = useState(false)
  const [contextWindow, setContextWindow] = useState('128000')
  const [temperature, setTemperature] = useState('0.7')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (editProvider) {
        setProviderType(editProvider.type)
        setProviderName(editProvider.name)
        setBaseUrl(editProvider.baseUrl || DEFAULT_BASE_URLS[editProvider.type])
        setModelId(editProvider.modelId || MODEL_OPTIONS[editProvider.type][0])
        setApiKey(editProvider.apiKey || '')
        setSupportsImages(editProvider.capabilities?.supportsImages || false)
        setContextWindow(String(editProvider.modelConfig?.contextWindow || 128000))
        setTemperature(String(editProvider.modelConfig?.temperature || 0.7))
      } else {
        setProviderType('openai')
        setProviderName('')
        setBaseUrl(DEFAULT_BASE_URLS.openai)
        setModelId(MODEL_OPTIONS.openai[0])
        setApiKey('')
        setSupportsImages(false)
        setContextWindow('128000')
        setTemperature('0.7')
      }
    }
  }, [isOpen, editProvider])

  useEffect(() => {
    if (!editProvider) {
      setBaseUrl(DEFAULT_BASE_URLS[providerType])
      setModelId(MODEL_OPTIONS[providerType][0])
    }
  }, [providerType, editProvider])

  const handleSave = async () => {
    if (!providerName.trim()) {
      alert('Please enter a provider name')
      return
    }

    setIsSaving(true)
    try {
      const provider: Partial<LLMProvider> = {
        id: editProvider?.id || undefined,
        name: providerName,
        type: providerType,
        baseUrl: baseUrl || DEFAULT_BASE_URLS[providerType],
        modelId: modelId || MODEL_OPTIONS[providerType][0],
        apiKey: apiKey || undefined,
        capabilities: {
          supportsImages
        },
        modelConfig: {
          contextWindow: parseInt(contextWindow, 10) || 128000,
          temperature: parseFloat(temperature) || 0.7
        },
        isBuiltIn: false,
        isDefault: false,  // Required field, but we don't use it for display
        createdAt: editProvider?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await onSave(provider)
      onClose()
    } catch (error) {
      console.error('Error saving provider:', error)
      alert('Failed to save provider. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="chrome-settings-modal-overlay" onClick={onClose}>
      <div className="chrome-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chrome-settings-modal-header">
          <h2 className="chrome-settings-modal-title">
            {editProvider ? 'Edit Provider' : 'Configure New Provider'}
          </h2>
          <button
            onClick={onClose}
            className="chrome-settings-modal-close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="chrome-settings-modal-content">
          {/* Provider Type and Name */}
          <div className="chrome-settings-form-row">
            <div className="chrome-settings-form-field">
              <label htmlFor="provider-type">
                Provider Type <span className="required">*</span>
              </label>
              <select
                id="provider-type"
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as ProviderType)}
                className="chrome-settings-select"
                disabled={!!editProvider}
              >
                {PROVIDER_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="chrome-settings-form-field">
              <label htmlFor="provider-name">
                Provider Name <span className="required">*</span>
              </label>
              <input
                id="provider-name"
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g., Work OpenAI"
                className="chrome-settings-input"
              />
            </div>
          </div>

          {/* Base URL and Model ID */}
          <div className="chrome-settings-form-row">
            <div className="chrome-settings-form-field">
              <label htmlFor="base-url">Base URL</label>
              <input
                id="base-url"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={DEFAULT_BASE_URLS[providerType]}
                className="chrome-settings-input"
              />
              <span className="chrome-settings-field-help">
                Override the default API endpoint
              </span>
            </div>

            <div className="chrome-settings-form-field">
              <label htmlFor="model-id">
                Model ID <span className="required">*</span>
              </label>
              <select
                id="model-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="chrome-settings-select"
              >
                {MODEL_OPTIONS[providerType].map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* API Key */}
          <div className="chrome-settings-form-field">
            <label htmlFor="api-key">API Key</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key (optional for some providers)"
              className="chrome-settings-input"
            />
            <span className="chrome-settings-field-help">
              Your API key is encrypted and stored locally
            </span>
          </div>

          {/* Model Configuration Section */}
          <div className="chrome-settings-form-section">
            <h3 className="chrome-settings-form-section-title">Model Configuration</h3>

            <div className="chrome-settings-form-field">
              <label className="chrome-settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={supportsImages}
                  onChange={(e) => setSupportsImages(e.target.checked)}
                  className="chrome-settings-checkbox"
                />
                <span>Supports Images</span>
              </label>
            </div>

            <div className="chrome-settings-form-row">
              <div className="chrome-settings-form-field">
                <label htmlFor="context-window">Context Window Size</label>
                <input
                  id="context-window"
                  type="number"
                  value={contextWindow}
                  onChange={(e) => setContextWindow(e.target.value)}
                  placeholder="128000"
                  className="chrome-settings-input"
                />
              </div>

              <div className="chrome-settings-form-field">
                <label htmlFor="temperature">Temperature (0-2)</label>
                <input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="0.7"
                  className="chrome-settings-input"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="chrome-settings-modal-footer">
          <button
            onClick={onClose}
            className="chrome-settings-button-secondary"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="chrome-settings-button-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}