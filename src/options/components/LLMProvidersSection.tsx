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
          <div className="chrome-settings-icon">
            L
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
              value="browseros"
              disabled
              className="chrome-settings-select"
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            >
              <option value="browseros">BrowserOS (Always Default)</option>
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