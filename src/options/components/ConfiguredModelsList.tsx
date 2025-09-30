import React, { useState, useEffect } from 'react'
import { LLMProvider } from '../types/llm-settings'
import { LLMTestService, TestResult, PerformanceScore, BenchmarkResult } from '../services/llm-test-service'
import { Loader2, Zap, Brain, Shield, X, AlertCircle, Gauge, MapPin, GitBranch, FlaskConical, Pencil, Trash2 } from 'lucide-react'

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

  const [recommendations, setRecommendations] = useState<Map<string, any>>(new Map())

  const handleTestAndBenchmark = async (provider: LLMProvider) => {
    const providerId = provider.id
    setTestingProviders(prev => new Set(prev).add(providerId))

    try {
      const benchmarkResult = await testService.benchmarkProvider(provider)
      setBenchmarkResults(prev => new Map(prev).set(providerId, benchmarkResult))

      if (benchmarkResult.success) {
        setPerformanceScores(prev => new Map(prev).set(providerId, benchmarkResult.scores))
        setRecommendations(prev => new Map(prev).set(providerId, benchmarkResult.recommendation))
        setShowScores(prev => new Set(prev).add(providerId))
        await testService.storeTestResults(providerId, benchmarkResult as any, benchmarkResult.scores)
      } else {
        setPerformanceScores(prev => {
          const next = new Map(prev)
          next.delete(providerId)
          return next
        })
        setShowScores(prev => new Set(prev).add(providerId))
        console.error('Benchmark failed:', benchmarkResult.error)
      }
    } catch (error) {
      console.error('Test failed:', error)

      const errorResult: BenchmarkResult = {
        success: false,
        latency: 0,
        scores: {
          instructionFollowing: 1,
          contextUnderstanding: 1,
          toolUsage: 1,
          planning: 1,
          errorRecovery: 1,
          performance: 1,
          overall: 1
        },
        recommendation: {
          useCase: 'unknown',
          description: 'Test failed',
          suitability: [],
          agentScore: 0,
          chatScore: 0
        },
        error: error instanceof Error ? error.message : 'Test failed',
        timestamp: new Date().toISOString()
      }
      setBenchmarkResults(prev => new Map(prev).set(providerId, errorResult))
      setShowScores(prev => new Set(prev).add(providerId))
    } finally {
      setTestingProviders(prev => {
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
                          default
                        </span>
                      )}
                      {provider.isBuiltIn && (
                        <span className="chrome-settings-model-badge builtin">
                          built-in
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="chrome-settings-model-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTestAndBenchmark(provider)
                    }}
                    className="chrome-settings-action-button chrome-settings-action-test"
                    disabled={testingProviders.has(provider.id)}
                  >
                    {testingProviders.has(provider.id) ? (
                      <>
                        <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" />
                        <span>Testing</span>
                      </>
                    ) : benchmarkResults.get(provider.id) ? (
                      benchmarkResults.get(provider.id)?.success ? (
                        <span>✓ Score: {benchmarkResults.get(provider.id)?.scores.overall}/10</span>
                      ) : (
                        <span>Retry</span>
                      )
                    ) : (
                      <span>Test</span>
                    )}
                  </button>
                  {!provider.isBuiltIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditProvider(provider)
                      }}
                      className="chrome-settings-action-button chrome-settings-action-edit"
                    >
                      Edit
                    </button>
                  )}
                  {!provider.isBuiltIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteProvider(provider.id)
                      }}
                      className="chrome-settings-action-button chrome-settings-action-delete"
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
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                        marginBottom: '16px'
                      }}>
                        <div className="chrome-settings-score-item">
                          <Zap className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.instructionFollowing) }} />
                          <div>
                            <div className="chrome-settings-score-label">Instruction Following</div>
                            <div className="chrome-settings-score-value">
                              {performanceScores.get(provider.id)!.instructionFollowing}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <Brain className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.contextUnderstanding) }} />
                          <div>
                            <div className="chrome-settings-score-label">Context Understanding</div>
                            <div className="chrome-settings-score-value">
                              {performanceScores.get(provider.id)!.contextUnderstanding}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <Shield className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.toolUsage) }} />
                          <div>
                            <div className="chrome-settings-score-label">Tool Usage</div>
                            <div className="chrome-settings-score-value">
                              {performanceScores.get(provider.id)!.toolUsage}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <GitBranch className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.planning) }} />
                          <div>
                            <div className="chrome-settings-score-label">Planning</div>
                            <div className="chrome-settings-score-value">
                              {performanceScores.get(provider.id)!.planning}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <AlertCircle className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.errorRecovery) }} />
                          <div>
                            <div className="chrome-settings-score-label">Error Recovery</div>
                            <div className="chrome-settings-score-value">
                              {performanceScores.get(provider.id)!.errorRecovery}/10
                            </div>
                          </div>
                        </div>
                        <div className="chrome-settings-score-item">
                          <Gauge className="w-4 h-4" style={{ color: getScoreColor(performanceScores.get(provider.id)!.performance) }} />
                          <div>
                            <div className="chrome-settings-score-label">Performance</div>
                            <div className="chrome-settings-score-value">
                              {performanceScores.get(provider.id)!.performance}/10
                            </div>
                          </div>
                        </div>
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
                          padding: '16px',
                          backgroundColor: 'rgba(129, 201, 149, 0.12)',
                          border: '1px solid rgba(129, 201, 149, 0.3)',
                          borderRadius: '8px'
                        }}>
                          <div style={{
                            fontWeight: 600,
                            marginBottom: '8px',
                            fontSize: '14px',
                            color: '#81c995',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <Brain className="w-4 h-4" />
                            Recommendation
                          </div>
                          <div style={{
                            fontSize: '13px',
                            color: '#e8eaed',
                            lineHeight: '1.6'
                          }}>
                            {typeof recommendations.get(provider.id) === 'object'
                              ? recommendations.get(provider.id).description
                              : recommendations.get(provider.id)}
                          </div>
                          {typeof recommendations.get(provider.id) === 'object' &&
                            recommendations.get(provider.id).suitability?.length > 0 && (
                            <div style={{
                              marginTop: '8px',
                              display: 'flex',
                              gap: '6px',
                              flexWrap: 'wrap'
                            }}>
                              {recommendations.get(provider.id).suitability.map((suit: string) => (
                                <span key={suit} style={{
                                  padding: '4px 10px',
                                  backgroundColor: 'rgba(138, 180, 248, 0.2)',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  color: '#8ab4f8',
                                  fontWeight: 500,
                                  textTransform: 'capitalize'
                                }}>
                                  {suit.replace('_', ' ')}
                                </span>
                              ))}
                            </div>
                          )}
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