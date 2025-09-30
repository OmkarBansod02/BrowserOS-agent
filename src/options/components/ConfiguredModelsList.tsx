import React, { useState, useEffect } from 'react'
import { LLMProvider } from '../types/llm-settings'
import { LLMTestService, TestResult, PerformanceScore, BenchmarkResult } from '../services/llm-test-service'
import { Loader2, Zap, Brain, Shield, X, AlertCircle, Gauge, MapPin, GitBranch } from 'lucide-react'

interface ConfiguredModelsListProps {
  providers: LLMProvider[]
  defaultProvider: string
  onEditProvider: (provider: LLMProvider) => void
  onDeleteProvider: (providerId: string) => void
}


export function ConfiguredModelsList({
  providers,
  defaultProvider,
  onEditProvider,
  onDeleteProvider
}: ConfiguredModelsListProps) {
  const [selectedProviderId, setSelectedProviderId] = useState('1')
  const [testingProviders, setTestingProviders] = useState<Set<string>>(new Set())
  const [benchmarkingProviders, setBenchmarkingProviders] = useState<Set<string>>(new Set())
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map())
  const [performanceScores, setPerformanceScores] = useState<Map<string, PerformanceScore>>(new Map())
  const [benchmarkResults, setBenchmarkResults] = useState<Map<string, BenchmarkResult>>(new Map())
  const [showScores, setShowScores] = useState<Set<string>>(new Set())

  const testService = LLMTestService.getInstance()

  useEffect(() => {
    providers.forEach(async (provider) => {
      if (provider.id) {
        const stored = await testService.getStoredResults(provider.id)
        if (stored) {
          if (stored.testResult) {
            setTestResults(prev => new Map(prev).set(provider.id, stored.testResult))
          }
          if (stored.performanceScores) {
            setPerformanceScores(prev => new Map(prev).set(provider.id, stored.performanceScores!))
          }
        }
      }
    })
  }, [providers])

  const [recommendations, setRecommendations] = useState<Map<string, string>>(new Map())

  const handleTestProvider = async (provider: LLMProvider) => {
    const providerId = provider.id
    setTestingProviders(prev => new Set(prev).add(providerId))

    try {
      const testResult = await testService.testProvider(provider)
      const scores = await testService.runPerformanceTests(provider, false)
      const recommendation = testService.getRecommendation(provider, scores)

      setTestResults(prev => new Map(prev).set(providerId, testResult))
      setPerformanceScores(prev => new Map(prev).set(providerId, scores))
      setRecommendations(prev => new Map(prev).set(providerId, recommendation))
      setShowScores(prev => new Set(prev).add(providerId))

      await testService.storeTestResults(providerId, testResult, scores)
    } catch (error) {
      console.error('Test failed:', error)

      const errorResult: TestResult = {
        success: false,
        latency: 0,
        error: error instanceof Error ? error.message : 'Test failed',
        timestamp: new Date().toISOString()
      }
      setTestResults(prev => new Map(prev).set(providerId, errorResult))
      setShowScores(prev => new Set(prev).add(providerId))
    } finally {
      setTestingProviders(prev => {
        const next = new Set(prev)
        next.delete(providerId)
        return next
      })
    }
  }

  const handleBenchmarkProvider = async (provider: LLMProvider) => {
    const providerId = provider.id
    setBenchmarkingProviders(prev => new Set(prev).add(providerId))

    try {
      const benchmarkResult = await testService.benchmarkProvider(provider)

      setBenchmarkResults(prev => new Map(prev).set(providerId, benchmarkResult))

      if (benchmarkResult.success) {
        const recommendation = testService.getRecommendation(provider, benchmarkResult.scores)
        setPerformanceScores(prev => new Map(prev).set(providerId, benchmarkResult.scores))
        setRecommendations(prev => new Map(prev).set(providerId, recommendation))
        setShowScores(prev => new Set(prev).add(providerId))
        await testService.storeTestResults(providerId, benchmarkResult as any, benchmarkResult.scores)
      } else {
        // Clear any existing scores if benchmark failed
        setPerformanceScores(prev => {
          const next = new Map(prev)
          next.delete(providerId)
          return next
        })
        console.error('Benchmark failed:', benchmarkResult.error)
      }
    } catch (error) {
      console.error('Benchmark failed:', error)

      const errorResult: BenchmarkResult = {
        success: false,
        latency: 0,
        scores: {
          latency: 1,
          accuracy: 1,
          reliability: 1,
          planning: 1,
          navigation: 1,
          overall: 1
        },
        error: error instanceof Error ? error.message : 'Benchmark failed',
        timestamp: new Date().toISOString()
      }
      setBenchmarkResults(prev => new Map(prev).set(providerId, errorResult))
      // Don't show scores panel on error
      setPerformanceScores(prev => {
        const next = new Map(prev)
        next.delete(providerId)
        return next
      })
    } finally {
      setBenchmarkingProviders(prev => {
        const next = new Set(prev)
        next.delete(providerId)
        return next
      })
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return '#81c995'
    if (score >= 6) return '#fbbc04'
    return '#f28b82'
  }

  const getProviderColor = (type: string) => {
    switch (type) {
      case 'openai': return '#10A37F'
      case 'anthropic': return '#D97757'
      case 'google_gemini': return '#4285F4'
      case 'ollama': return '#000000'
      case 'openrouter': return '#6B47ED'
      case 'browseros': return '#8B5CF6'
      default: return '#6B7280'
    }
  }

  const getProviderLetter = (type: string) => {
    switch (type) {
      case 'openai': return 'O'
      case 'anthropic': return 'A'
      case 'google_gemini': return 'G'
      case 'ollama': return 'L'
      case 'openrouter': return 'R'
      case 'browseros': return 'B'
      default: return 'C'
    }
  }

  const closeTestResults = (providerId: string) => {
    setShowScores(prev => {
      const next = new Set(prev)
      next.delete(providerId)
      return next
    })
  }

  return (
    <section className="chrome-settings-card">
      <div className="chrome-settings-card-content">
        <h3 className="chrome-settings-section-title" style={{ marginBottom: '16px' }}>
          Configured Models
        </h3>

        <div className="chrome-settings-models-list">
          {providers.map((provider) => (
            <div key={provider.id}>
              <div
                className={`chrome-settings-model-item ${selectedProviderId === provider.id ? 'selected' : ''}`}
                onClick={() => setSelectedProviderId(provider.id)}
              >
                <div className="chrome-settings-model-content">
                  <div className="chrome-settings-model-radio" />

                  <div className="chrome-settings-model-info">
                    <div
                      className="chrome-settings-model-icon"
                      style={{ backgroundColor: getProviderColor(provider.type) }}
                    >
                      {getProviderLetter(provider.type)}
                    </div>

                    <div className="chrome-settings-model-details">
                      <span className="chrome-settings-model-name">
                        {provider.name}
                      </span>
                      <span className="chrome-settings-model-description">
                        {provider.modelId ? `Model: ${provider.modelId}` : `Type: ${provider.type}`}
                      </span>
                    </div>

                    <div className="chrome-settings-model-badges">
                      {provider.id === defaultProvider && (
                        <span className="chrome-settings-model-badge default">
                          Default
                        </span>
                      )}
                      {provider.isBuiltIn && (
                        <span className="chrome-settings-model-badge builtin">
                          Built-in
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="chrome-settings-model-actions" style={{ opacity: 1 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTestProvider(provider)
                    }}
                    className="chrome-settings-action-button chrome-settings-action-test"
                    disabled={testingProviders.has(provider.id) || benchmarkingProviders.has(provider.id)}
                    style={{
                      color: testResults.get(provider.id)?.success ? '#81c995' : '#8ab4f8',
                      minWidth: '50px',
                      opacity: 1
                    }}
                  >
                    {testingProviders.has(provider.id) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : testResults.get(provider.id) ? (
                      testResults.get(provider.id)?.success ? '✓ Tested' : 'Retry'
                    ) : (
                      'Test'
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBenchmarkProvider(provider)
                    }}
                    className="chrome-settings-action-button"
                    disabled={benchmarkingProviders.has(provider.id) || testingProviders.has(provider.id)}
                    style={{
                      color: benchmarkResults.get(provider.id)?.success ? '#81c995' : '#fbbc04',
                      minWidth: '80px',
                      opacity: 1
                    }}
                  >
                    {benchmarkingProviders.has(provider.id) ? (
                      <><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Benchmarking</>
                    ) : benchmarkResults.get(provider.id) ? (
                      `Score: ${benchmarkResults.get(provider.id)?.scores.overall}/10`
                    ) : (
                      <><Gauge className="w-3 h-3 inline mr-1" />Benchmark</>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditProvider(provider)
                    }}
                    className="chrome-settings-action-button chrome-settings-action-edit"
                    style={{ opacity: 1 }}
                  >
                    Edit
                  </button>
                  {!provider.isBuiltIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteProvider(provider.id)
                      }}
                      className="chrome-settings-action-button chrome-settings-action-delete"
                      style={{ opacity: 1 }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {showScores.has(provider.id) && (
                <div className="chrome-settings-scores-panel">
                  <button
                    onClick={() => closeTestResults(provider.id)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#9aa0a6',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                      e.currentTarget.style.color = '#e8eaed'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#9aa0a6'
                    }}
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {(testResults.get(provider.id) && !testResults.get(provider.id)?.success) ||
                   (benchmarkResults.get(provider.id) && !benchmarkResults.get(provider.id)?.success) ? (
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px'
                    }}>
                      <div style={{
                        color: '#dc2626',
                        fontWeight: 500,
                        marginBottom: '4px',
                        fontSize: '14px'
                      }}>
                        {benchmarkResults.get(provider.id) && !benchmarkResults.get(provider.id)?.success
                          ? 'Benchmark Failed'
                          : 'Connection Error'}
                      </div>
                      <div style={{
                        color: '#7f1d1d',
                        fontSize: '13px',
                        lineHeight: '1.5'
                      }}>
                        {(() => {
                          const testError = testResults.get(provider.id)?.error
                          const benchmarkError = benchmarkResults.get(provider.id)?.error
                          const error = benchmarkError || testError || ''
                          if (error.includes('401')) {
                            return 'Invalid API key. Please check your API key and try again.'
                          } else if (error.includes('429')) {
                            return 'Rate limit exceeded. Please wait a moment and try again.'
                          } else if (error.includes('Network') || error.includes('fetch')) {
                            return 'Network error. Please check your internet connection.'
                          } else if (error.includes('404')) {
                            return 'Model not found. Please check the model name.'
                          } else if (error.includes('timeout')) {
                            return 'Request timed out. Please try again.'
                          } else {
                            return error || 'Failed to connect to the API. Please check your settings.'
                          }
                        })()}
                      </div>
                    </div>
                  ) : performanceScores.has(provider.id) ? (
                    <>
                      <div className="chrome-settings-scores-grid">
                        <div className="chrome-settings-score-item">
                          <Zap className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.latency) }} />
                          <div>
                            <div className="chrome-settings-score-label">Latency</div>
                            <div className="chrome-settings-score-value">
                              {Math.round(performanceScores.get(provider.id)!.latency * 10) / 10}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <Brain className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.accuracy) }} />
                          <div>
                            <div className="chrome-settings-score-label">Accuracy</div>
                            <div className="chrome-settings-score-value">
                              {Math.round(performanceScores.get(provider.id)!.accuracy * 10) / 10}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <Shield className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.reliability) }} />
                          <div>
                            <div className="chrome-settings-score-label">Reliability</div>
                            <div className="chrome-settings-score-value">
                              {Math.round(performanceScores.get(provider.id)!.reliability * 10) / 10}/10
                            </div>
                          </div>
                        </div>
                        {performanceScores.get(provider.id)?.planning !== undefined && (
                          <div className="chrome-settings-score-item">
                            <GitBranch className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.planning!) }} />
                            <div>
                              <div className="chrome-settings-score-label">Planning</div>
                              <div className="chrome-settings-score-value">
                                {Math.round(performanceScores.get(provider.id)!.planning! * 10) / 10}/10
                              </div>
                            </div>
                          </div>
                        )}
                        {performanceScores.get(provider.id)?.navigation !== undefined && (
                          <div className="chrome-settings-score-item">
                            <MapPin className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.navigation!) }} />
                            <div>
                              <div className="chrome-settings-score-label">Navigation</div>
                              <div className="chrome-settings-score-value">
                                {Math.round(performanceScores.get(provider.id)!.navigation! * 10) / 10}/10
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {testResults.get(provider.id)?.latency && (
                        <div className="chrome-settings-test-info">
                          <div>Response time: {Math.round(testResults.get(provider.id)!.latency)}ms</div>
                          {testResults.get(provider.id)?.response && (
                            <div style={{
                              marginTop: '8px',
                              padding: '8px',
                              backgroundColor: 'rgba(138, 180, 248, 0.1)',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: '#e8eaed'
                            }}>
                              <strong>LLM Response:</strong> {testResults.get(provider.id)?.response}
                            </div>
                          )}
                        </div>
                      )}
                      {recommendations.get(provider.id) && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          backgroundColor: 'rgba(138, 180, 248, 0.1)',
                          border: '1px solid rgba(138, 180, 248, 0.3)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#e8eaed',
                          lineHeight: '1.5'
                        }}>
                          <div style={{
                            fontWeight: 500,
                            marginBottom: '4px',
                            color: '#8ab4f8'
                          }}>
                            💡 Recommendation
                          </div>
                          {recommendations.get(provider.id)}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}