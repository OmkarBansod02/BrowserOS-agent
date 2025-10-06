import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LLMProvider } from '../types/llm-settings'

interface ProviderTemplatesProps {
  onUseTemplate: (template: LLMProvider) => void
}

const getProviderIcon = (type: string) => {
  const iconClass = "w-6 h-6 object-contain"

  switch (type.toLowerCase()) {
    case 'openai':
      return <img src="/assets/openai.svg" alt="OpenAI" className={iconClass} />
    case 'claude':
    case 'anthropic':
      return <img src="/assets/anthropic.svg" alt="Anthropic" className={iconClass} />
    case 'gemini':
    case 'google_gemini':
      return <img src="/assets/Google-gemini-icon.svg" alt="Google Gemini" className={iconClass} />
    case 'ollama':
      return <img src="/assets/ollama.svg" alt="Ollama" className={iconClass} />
    case 'openrouter':
      return <img src="/assets/openrouter.svg" alt="OpenRouter" className={iconClass} />
    case 'lm studio':
    case 'openai_compatible':
      return <img src="/assets/lmstudio.svg" alt="LM Studio" className={iconClass} />
    default:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )
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
    <section className="settings-card mb-8">
      <div className="px-5 py-6">
        {/* Section Header with Collapse */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center cursor-pointer hover:opacity-80 transition-opacity mb-5"
        >
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform mr-3 ${
              isExpanded ? 'rotate-0' : '-rotate-90'
            }`}
          />
          <div>
            <h3 className="text-[14px] font-medium text-foreground">
              Quick provider templates
            </h3>
            <span className="text-[12px] text-muted-foreground">
              6 templates available
            </span>
          </div>
        </div>

        {/* Templates Grid */}
        {isExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROVIDER_TEMPLATES.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors group"
                onClick={() => onUseTemplate(provider.template as LLMProvider)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-muted">
                    {getProviderIcon(provider.type)}
                  </div>
                  <span className="text-[13px] font-normal">
                    {provider.name}
                  </span>
                </div>

                {/* USE Button */}
                <button
                  className="px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border rounded hover:bg-background transition-colors uppercase"
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