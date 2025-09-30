import React from 'react'
import { Plus } from 'lucide-react'
import { LLMProvider } from '../types/llm-settings'

interface LLMProvidersSectionProps {
  defaultProvider: string
  providers: LLMProvider[]
  onDefaultChange: (provider: string) => void
  onAddProvider: () => void
}

export function LLMProvidersSection({
  defaultProvider,
  providers,
  onDefaultChange,
  onAddProvider
}: LLMProvidersSectionProps) {
  return (
    <section className="chrome-settings-card">
      <div className="chrome-settings-card-content">
        <div className="chrome-settings-section-header">
          <div className="chrome-settings-icon" style={{ padding: 0, overflow: 'hidden' }}>
            <img
              src="/assets/browseros.svg"
              alt="BrowserOS"
              style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '50%' }}
            />
          </div>
          <div className="chrome-settings-section-info">
            <h2 className="chrome-settings-section-title">
              LLM Providers
            </h2>
            <p className="chrome-settings-section-description">
              Configure and test your language model providers
            </p>
          </div>
        </div>

        <div className="chrome-settings-controls">
          <div className="chrome-settings-select-group">
            <label className="chrome-settings-label">
              Default Provider:
            </label>
            <select
              value={defaultProvider}
              onChange={(e) => onDefaultChange(e.target.value)}
              className="chrome-settings-select"
            >
              {providers.filter(p => p && p.id && p.name).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onAddProvider}
            className="chrome-settings-button chrome-settings-button-text"
          >
            <Plus size={18} />
            <span>Add custom provider</span>
          </button>
        </div>
      </div>
    </section>
  )
}