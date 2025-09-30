import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LLMProvider } from '../types/llm-settings'

interface ProviderTemplatesProps {
  onUseTemplate: (template: LLMProvider) => void
}

const getProviderIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
        </svg>
      )
    case 'claude':
    case 'anthropic':
      return <img src="/assets/claude-ai-icon.webp" alt="Claude" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%' }} />
    case 'gemini':
    case 'google_gemini':
      return <img src="/assets/Google-gemini-icon.svg.png" alt="Gemini" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
    case 'ollama':
      return <img src="/assets/ollama.png" alt="Ollama" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
    case 'openrouter':
      return <img src="/assets/open router.png" alt="OpenRouter" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
    case 'lm studio':
    case 'openai_compatible':
      return <img src="/assets/LM-studio.jpeg" alt="LM Studio" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
    default:
      return null
  }
}

const PROVIDER_TEMPLATES = [
  {
    name: 'OpenAI',
    type: 'openai',
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
    type: 'claude',
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
    type: 'gemini',
    color: '#FFFFFF',
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
    type: 'ollama',
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
    type: 'openrouter',
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
    type: 'lm studio',
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
                  <div
                    className="chrome-settings-template-icon"
                    style={{ backgroundColor: provider.color }}
                  >
                    {getProviderIcon(provider.type)}
                  </div>
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