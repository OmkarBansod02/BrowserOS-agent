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
    return <img src="/assets/browseros.svg" alt="BrowserOS" className="w-8 h-8 object-cover" />
  }

  switch (type.toLowerCase()) {
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
        </svg>
      )
    case 'claude':
    case 'anthropic':
      return (
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
          <rect width="24" height="24" rx="4" fill="#CC9B7A"/>
          <path d="M10.5 7.5L7.5 16.5h1.8l0.6-1.8h2.4l0.6 1.8h1.8L12 7.5h-1.5zm-0.3 5.7l0.9-2.7 0.9 2.7h-1.8z" fill="#191918"/>
          <path d="M13.5 7.5L15 16.5h1.8l0.6-1.8h2.4l0.6 1.8h1.8L19.5 7.5H18zm0.3 5.7l0.9-2.7 0.9 2.7h-1.8z" fill="#191918"/>
        </svg>
      )
    case 'gemini':
    case 'google_gemini':
      return (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
          <defs>
            <linearGradient id="gemini-grad-list" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4285F4"/>
              <stop offset="25%" stopColor="#9B72CB"/>
              <stop offset="50%" stopColor="#D96570"/>
              <stop offset="75%" stopColor="#9B72CB"/>
              <stop offset="100%" stopColor="#4285F4"/>
            </linearGradient>
          </defs>
          <path d="M12 3.5L12 3.5C12.4 3.5 12.7 3.7 12.9 4C13.5 5 14.3 5.9 15.3 6.6C16.3 7.3 17.4 7.9 18.6 8.2C19 8.3 19.2 8.6 19.2 9C19.2 9.4 19 9.7 18.6 9.8C17.4 10.1 16.3 10.7 15.3 11.4C14.3 12.1 13.5 13 12.9 14C12.7 14.3 12.4 14.5 12 14.5C11.6 14.5 11.3 14.3 11.1 14C10.5 13 9.7 12.1 8.7 11.4C7.7 10.7 6.6 10.1 5.4 9.8C5 9.7 4.8 9.4 4.8 9C4.8 8.6 5 8.3 5.4 8.2C6.6 7.9 7.7 7.3 8.7 6.6C9.7 5.9 10.5 5 11.1 4C11.3 3.7 11.6 3.5 12 3.5Z" fill="url(#gemini-grad-list)" stroke="none"/>
          <path d="M17 13L17 13C17.3 13 17.5 13.2 17.6 13.4C17.9 14 18.4 14.5 18.9 14.9C19.4 15.3 20 15.6 20.6 15.8C20.9 15.9 21 16.1 21 16.4C21 16.7 20.9 16.9 20.6 17C20 17.2 19.4 17.5 18.9 17.9C18.4 18.3 17.9 18.8 17.6 19.4C17.5 19.6 17.3 19.8 17 19.8C16.7 19.8 16.5 19.6 16.4 19.4C16.1 18.8 15.6 18.3 15.1 17.9C14.6 17.5 14 17.2 13.4 17C13.1 16.9 13 16.7 13 16.4C13 16.1 13.1 15.9 13.4 15.8C14 15.6 14.6 15.3 15.1 14.9C15.6 14.5 16.1 14 16.4 13.4C16.5 13.2 16.7 13 17 13Z" fill="url(#gemini-grad-list)" stroke="none"/>
        </svg>
      )
    case 'ollama':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
      )
    case 'openrouter':
      return (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
          <path d="M4 8h16v2H4zm0 6h16v2H4z" fill="#8B5CF6"/>
          <circle cx="7" cy="9" r="1.5" fill="#A78BFA"/>
          <circle cx="12" cy="9" r="1.5" fill="#A78BFA"/>
          <circle cx="17" cy="9" r="1.5" fill="#A78BFA"/>
          <circle cx="7" cy="15" r="1.5" fill="#A78BFA"/>
          <circle cx="12" cy="15" r="1.5" fill="#A78BFA"/>
          <circle cx="17" cy="15" r="1.5" fill="#A78BFA"/>
        </svg>
      )
    case 'browseros':
      return <img src="/assets/browseros.svg" alt="BrowserOS" className="w-8 h-8 object-cover" />
    case 'lm studio':
    case 'openai_compatible':
      return (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
          <rect x="4" y="4" width="16" height="16" rx="3" fill="#6F42C1"/>
          <path d="M9 8h1.5v6H12v1.5H9V8zm4.5 0H15v6h1.5V8H18v1.5h-1.5v4.5c0 .8-.7 1.5-1.5 1.5h-1.5V8z" fill="white"/>
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
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