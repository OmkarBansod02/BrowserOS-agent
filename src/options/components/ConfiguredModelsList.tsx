import React, { useState } from 'react'
import { Edit2, Trash2, Play, Activity, ChevronDown, Check, X, AlertCircle, Loader2, Zap } from 'lucide-react'
import { LLMProvider, TestResult } from '../types/llm-settings'

interface ConfiguredModelsListProps {
  providers: LLMProvider[]
  defaultProvider: string
  testResults: Record<string, TestResult>
  benchmarkProgress?: Record<string, string>
  onSetDefault: (providerId: string) => void
  onTest: (providerId: string) => void
  onBenchmark: (providerId: string) => void
  onEdit: (provider: LLMProvider) => void
  onDelete: (providerId: string) => void
  onClearTestResult?: (providerId: string) => void
}

const BENCHMARK_ENABLED = false

const getProviderIcon = (type: string, name?: string) => {
  // BrowserOS built-in provider
  if (name === 'BrowserOS') {
    return <img src="/assets/browseros.svg" alt="BrowserOS" className="w-6 h-6 object-contain" />
  }

  switch (type.toLowerCase()) {
    case 'openai':
      return <img src="/assets/openai.svg" alt="OpenAI" className="w-6 h-6 object-contain" />
    case 'claude':
    case 'anthropic':
      return <img src="/assets/anthropic.svg" alt="Anthropic" className="w-6 h-6 object-contain" />
    case 'gemini':
    case 'google_gemini':
      return <img src="/assets/Google-gemini-icon.svg" alt="Google Gemini" className="w-6 h-6 object-contain" />
    case 'ollama':
      return <img src="/assets/ollama.svg" alt="Ollama" className="w-6 h-6 object-contain" />
    case 'openrouter':
      return <img src="/assets/openrouter.svg" alt="OpenRouter" className="w-6 h-6 object-contain" />
    case 'browseros':
      return <img src="/assets/browseros.svg" alt="BrowserOS" className="w-6 h-6 object-contain" />
    case 'lm studio':
    case 'openai_compatible':
      return <img src="/assets/lmstudio.svg" alt="LM Studio" className="w-6 h-6 object-contain" />
    default:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )
  }
}

export function ConfiguredModelsList({
  providers,
  defaultProvider,
  testResults,
  benchmarkProgress = {},
  onSetDefault,
  onTest,
  onBenchmark,
  onEdit,
  onDelete,
  onClearTestResult
}: ConfiguredModelsListProps) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)

  const toggleExpanded = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId)
  }

  // Extract user-friendly error message
  const getErrorMessage = (error: string): string => {
    const lowerError = error.toLowerCase()

    // API key errors
    if (lowerError.includes('api key not valid') || lowerError.includes('api_key_invalid')) {
      return 'Invalid API key'
    }
    if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
      return 'Authentication failed - check your API key'
    }

    // Model errors
    if (lowerError.includes('model') && lowerError.includes('not found')) {
      return 'Model not found or not accessible'
    }

    // Rate limit
    if (lowerError.includes('rate limit') || lowerError.includes('429')) {
      return 'Rate limit exceeded - please try again later'
    }

    // Timeout
    if (lowerError.includes('timeout')) {
      return 'Request timed out - provider may be slow'
    }

    // Connection errors
    if (lowerError.includes('fetch') || lowerError.includes('network') || lowerError.includes('econnrefused')) {
      return 'Connection failed - check provider URL'
    }

    // Extract first meaningful sentence if available
    const firstSentence = error.split(/[.\n]/)[0].trim()
    if (firstSentence.length > 0 && firstSentence.length < 100) {
      return firstSentence
    }

    return 'Test failed - check provider configuration'
  }

  const getErrorHint = (error: string): string => {
    const lowerError = error.toLowerCase()

    if (lowerError.includes('api') || lowerError.includes('unauthorized') || lowerError.includes('401')) {
      return 'Verify your API key in provider settings'
    }
    if (lowerError.includes('model')) {
      return 'Check if the model ID is correct'
    }
    if (lowerError.includes('rate')) {
      return 'Wait a few minutes before testing again'
    }
    if (lowerError.includes('timeout')) {
      return 'Try increasing timeout or check network'
    }
    if (lowerError.includes('fetch') || lowerError.includes('network')) {
      return 'Verify the base URL is correct'
    }

    return 'Review provider configuration and try again'
  }

  // Auto-expand when test/benchmark starts or completes
  React.useEffect(() => {
    Object.entries(testResults).forEach(([providerId, result]) => {
      if (result && (result.status === 'loading' || result.status === 'success' || result.status === 'error')) {
        // Auto-expand to show results
        if (expandedProvider !== providerId) {
          setExpandedProvider(providerId)
        }
      }
    })
  }, [testResults])

  const renderStatusBadge = (result?: TestResult): JSX.Element | null => {
    if (!result) return null

    const isBenchmark = result.benchmark !== undefined
    if (isBenchmark && !BENCHMARK_ENABLED) {
      return null
    }

    if (result.status === 'loading') {
      return (
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Testing...
        </span>
      )
    }

    if (result.status === 'success' && !result.benchmark) {
      return (
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
          <Check className="w-3 h-3" />
          Connection verified
        </span>
      )
    }

    if (result.status === 'error') {
      return (
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          <X className="w-3 h-3" />
          Test failed
        </span>
      )
    }

    return null
  }

  const renderTestResult = (result: TestResult, providerId: string, progress?: string) => {
    if (!result) return null

    if (result.status === 'loading') {
      // Check if it's a benchmark (has benchmark property even if empty)
      const isBenchmark = result.benchmark !== undefined

      if (isBenchmark && !BENCHMARK_ENABLED) {
        return null
      }

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="font-medium text-foreground">
              {isBenchmark ? 'Running Benchmark' : 'Testing Connection'}...
            </span>
          </div>

          {/* Show progress for benchmark */}
          {isBenchmark && progress && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="font-medium">Current Task:</span>
                </div>
                <p className="ml-5">{progress}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                This comprehensive test takes 2-3 minutes to complete
              </div>
            </div>
          )}
        </div>
      )
    }

    if (result.status === 'error') {
      const errorMsg = result.error ? getErrorMessage(result.error) : 'Test failed'
      const hint = result.error ? getErrorHint(result.error) : ''

      return (
        <div className="relative p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/50">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-full flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-red-900 dark:text-red-300">
                    {errorMsg}
                  </h4>
                  {hint && (
                    <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                      {hint}
                    </p>
                  )}
                </div>
                {onClearTestResult && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onClearTestResult(providerId)
                    }}
                    className="p-1 hover:bg-red-200 dark:hover:bg-red-900/50 rounded transition-colors flex-shrink-0"
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (result.status === 'success') {
      const isBenchmark = !!(result.benchmark && result.benchmark.overallScore !== undefined)

      if (isBenchmark && !BENCHMARK_ENABLED) {
        return null
      }

      if (isBenchmark) {
        // Benchmark success display
        const score = result.benchmark!.overallScore
        const scoreColor = score >= 8 ? 'text-green-600 dark:text-green-400' :
                          score >= 6 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
        const scoreBg = score >= 8 ? 'bg-green-100 dark:bg-green-900/30' :
                       score >= 6 ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                       'bg-red-100 dark:bg-red-900/30'

        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${scoreBg}`}>
                <Activity className={`w-4 h-4 ${scoreColor}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Benchmark Complete</h4>
                  <div className={`text-2xl font-bold ${scoreColor}`}>
                    {score.toFixed(1)}/10
                  </div>
                </div>

                {/* Score breakdown with better visuals */}
                <div className="grid grid-cols-1 gap-2 p-3 bg-muted/30 rounded-lg">
                  {Object.entries(result.benchmark!.scores).filter(([key]) => key !== 'overall').map(([key, score]) => {
                    const scoreNum = typeof score === 'number' ? score : 0
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground w-32">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                scoreNum >= 8 ? 'bg-green-500' :
                                scoreNum >= 6 ? 'bg-yellow-500' :
                                scoreNum >= 4 ? 'bg-orange-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${scoreNum * 10}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold w-8 text-right">
                            {scoreNum.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

              </div>
            </div>
          </div>
        )
      } else {
        // Simple test success display
        return (
          <div className="relative p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900/50">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-full flex-shrink-0">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-2">
                    <h4 className="text-sm font-semibold text-green-900 dark:text-green-300">
                      Connection Verified
                    </h4>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Provider responded successfully in {result.responseTime}ms
                    </p>
                    {result.response && (
                      <div className="p-2 bg-green-100/50 dark:bg-green-900/30 rounded border border-green-200 dark:border-green-800">
                        <p className="text-[11px] font-medium text-green-900 dark:text-green-300 mb-1">
                          AI Response:
                        </p>
                        <p className="text-xs text-green-800 dark:text-green-400 italic">
                          "{result.response}"
                        </p>
                      </div>
                    )}
                  </div>
                  {onClearTestResult && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onClearTestResult(providerId)
                      }}
                      className="p-1 hover:bg-green-200 dark:hover:bg-green-900/50 rounded transition-colors flex-shrink-0"
                      aria-label="Dismiss result"
                    >
                      <X className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
    }

    return null
  }

  // Sort providers: BrowserOS first, then others
  const sortedProviders = [...providers].sort((a, b) => {
    if (a.name === 'BrowserOS') return -1
    if (b.name === 'BrowserOS') return 1
    return 0
  })

  return (
    <div className="space-y-3">
      {sortedProviders.map((provider) => {
        if (!provider || !provider.id) return null

        const testResult = testResults[provider.id]
        const isExpanded = expandedProvider === provider.id && testResult
        const isBrowserOS = provider.name === 'BrowserOS'

        return (
          <div
            key={provider.id}
            className="settings-card overflow-hidden transition-all hover:bg-accent/50 cursor-pointer"
            onClick={() => onSetDefault(provider.id)}
          >
            {/* Main provider row */}
            <div className="p-4">
              <div className="flex items-center gap-4">
                {/* Radio button for default selection */}
                <input
                  type="radio"
                  name="default-provider"
                  checked={defaultProvider === provider.id}
                  onChange={() => onSetDefault(provider.id)}
                  className="w-4 h-4 text-primary focus:ring-primary pointer-events-none"
                />

                {/* Provider info */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="provider-icon">
                    {getProviderIcon(provider.type, provider.name)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-normal">{provider.name}</span>
                      {isBrowserOS && (
                        <>
                          <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded uppercase">
                            DEFAULT
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded uppercase">
                            BUILT-IN
                          </span>
                        </>
                      )}
                    </div>
                    {!isBrowserOS && (
                      <>
                        <div className="text-[12px] text-muted-foreground">
                          {provider.modelId || provider.type}
                        </div>
                        {renderStatusBadge(testResult)}
                      </>
                    )}
                    {isBrowserOS && (
                      <div className="text-[12px] text-muted-foreground">
                        Automatically chooses the best model for each task
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {!isBrowserOS && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(provider)
                        }}
                        className="p-2 hover:bg-accent rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {testResult && testResult.status !== 'idle' && testResult.status !== 'loading' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpanded(provider.id)
                          }}
                          className="p-2 hover:bg-accent rounded-md transition-colors"
                          title="Toggle test results"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`} />
                        </button>
                      )}
                    </>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onTest(provider.id)
                    }}
                    disabled={testResult?.status === 'loading'}
                    className="settings-button settings-button-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Test connection"
                  >
                    {testResult?.status === 'loading' && !testResult?.benchmark ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span className="text-sm">Test</span>
                  </button>

                  {!isBrowserOS && (
                    <>
                      {BENCHMARK_ENABLED && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onBenchmark(provider.id)
                          }}
                          disabled={testResult?.status === 'loading'}
                          className="settings-button settings-button-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Run benchmark"
                        >
                          {testResult?.status === 'loading' && testResult?.benchmark !== undefined ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                          <span className="text-sm">Benchmark</span>
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(provider.id)
                        }}
                        className="settings-button settings-button-destructive"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Expandable test results */}
            {isExpanded && testResult && (
              <div className="border-t border-border bg-muted/30 p-4">
                {renderTestResult(testResult, provider.id, benchmarkProgress[provider.id])}
              </div>
            )}
          </div>
        )
      })}

      {providers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">No providers configured yet</p>
          <p className="text-xs mt-1">Add a provider using the templates above</p>
        </div>
      )}
    </div>
  )
}