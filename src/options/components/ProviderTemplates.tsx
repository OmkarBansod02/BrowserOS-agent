import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LLMProvider } from '../types/llm-settings'

interface ProviderTemplatesProps {
  onUseTemplate: (template: LLMProvider) => void
}

const PROVIDER_TEMPLATES = [
  {
    name: 'OpenAI',
    abbreviation: 'O',
    color: '#10A37F',
    template: {
      id: '',
      name: 'OpenAI',
      type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1',
      isBuiltIn: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },
  {
    name: 'Claude',
    abbreviation: 'C',
    color: '#7C3AED',
    template: {
      id: '',
      name: 'Claude',
      type: 'anthropic' as const,
      baseUrl: 'https://api.anthropic.com',
      isBuiltIn: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },
  {
    name: 'Gemini',
    abbreviation: 'G',
    color: '#1E88E5',
    template: {
      id: '',
      name: 'Gemini',
      type: 'google_gemini' as const,
      isBuiltIn: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },
  {
    name: 'Ollama',
    abbreviation: 'O',
    color: '#6B7280',
    template: {
      id: '',
      name: 'Ollama',
      type: 'ollama' as const,
      baseUrl: 'http://localhost:11434',
      isBuiltIn: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },
  {
    name: 'OpenRouter',
    abbreviation: 'R',
    color: '#374151',
    template: {
      id: '',
      name: 'OpenRouter',
      type: 'openrouter' as const,
      baseUrl: 'https://openrouter.ai/api/v1',
      isBuiltIn: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },
  {
    name: 'LM Studio',
    abbreviation: 'LM',
    color: '#3B82F6',
    template: {
      id: '',
      name: 'LM Studio',
      type: 'openai_compatible' as const,
      baseUrl: 'http://localhost:1234/v1',
      isBuiltIn: false,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }
]

export function ProviderTemplates({ onUseTemplate }: ProviderTemplatesProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <section className="chrome-settings-card">
      <div className="chrome-settings-card-content">
        {/* Section Header with Collapse */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="chrome-settings-collapsible-header"
        >
          <div className="chrome-settings-collapsible-title">
            {isExpanded ? (
              <ChevronDown className="chrome-settings-collapsible-icon expanded" />
            ) : (
              <ChevronUp className="chrome-settings-collapsible-icon" />
            )}
            <h3 className="chrome-settings-section-title">
              Quick provider templates
            </h3>
            <span className="chrome-settings-section-description">
              6 templates available
            </span>
          </div>
        </div>

        {/* Templates Grid */}
        {isExpanded && (
          <div className="chrome-settings-templates-grid">
            {PROVIDER_TEMPLATES.map((provider) => (
              <div
                key={provider.name}
                className="chrome-settings-template-card"
                onClick={() => onUseTemplate(provider.template as LLMProvider)}
              >
                <div className="chrome-settings-template-info">
                  {/* Provider Icon */}
                  <div
                    className={`chrome-settings-template-icon provider-icon-${provider.name.toLowerCase().replace(' ', '')}`}
                  >
                    {provider.abbreviation}
                  </div>

                  {/* Provider Name */}
                  <span className="chrome-settings-template-name">
                    {provider.name}
                  </span>
                </div>

                {/* USE Button */}
                <button
                  className="chrome-settings-template-use"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUseTemplate(provider.template as LLMProvider)
                  }}
                >
                  use
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}