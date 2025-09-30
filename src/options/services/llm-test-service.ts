import { LLMProvider } from '../types/llm-settings'
import { MessageType } from '@/lib/types/messaging'
import { PortMessage } from '@/lib/runtime/PortMessaging'

export interface TestResult {
  success: boolean
  latency: number
  error?: string
  response?: string
  timestamp: string
}

export interface PerformanceScore {
  latency: number
  accuracy: number
  reliability: number
  planning?: number
  navigation?: number
  overall: number
}

export interface BenchmarkResult {
  success: boolean
  latency: number
  scores: PerformanceScore
  taskResults?: any[]
  error?: string
  timestamp: string
}

export class LLMTestService {
  private static instance: LLMTestService

  static getInstance(): LLMTestService {
    if (!LLMTestService.instance) {
      LLMTestService.instance = new LLMTestService()
    }
    return LLMTestService.instance
  }

  async testProvider(provider: LLMProvider): Promise<TestResult> {
    return new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'options' })
      const messageId = `test-${Date.now()}`

      const listener = (msg: PortMessage) => {
        if (msg.id === messageId && msg.type === MessageType.SETTINGS_TEST_PROVIDER_RESPONSE) {
          port.onMessage.removeListener(listener)
          port.disconnect()
          const payload = msg.payload as any
          resolve(payload as TestResult)
        } else if (msg.id === messageId && msg.type === MessageType.ERROR) {
          port.onMessage.removeListener(listener)
          port.disconnect()
          const payload = msg.payload as any
          resolve({
            success: false,
            latency: 0,
            error: payload.error || 'Unknown error',
            timestamp: new Date().toISOString()
          })
        }
      }

      port.onMessage.addListener(listener)

      port.postMessage({
        type: MessageType.SETTINGS_TEST_PROVIDER,
        payload: { provider },
        id: messageId
      })

      setTimeout(() => {
        port.onMessage.removeListener(listener)
        port.disconnect()
        resolve({
          success: false,
          latency: 30000,
          error: 'Test timeout after 30 seconds',
          timestamp: new Date().toISOString()
        })
      }, 30000)
    })
  }

  async benchmarkProvider(provider: LLMProvider): Promise<BenchmarkResult> {
    return new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'options' })
      const messageId = `benchmark-${Date.now()}`

      const listener = (msg: PortMessage) => {
        if (msg.id === messageId && msg.type === MessageType.SETTINGS_BENCHMARK_PROVIDER_RESPONSE) {
          port.onMessage.removeListener(listener)
          port.disconnect()
          const payload = msg.payload as any
          resolve(payload as BenchmarkResult)
        } else if (msg.id === messageId && msg.type === MessageType.ERROR) {
          port.onMessage.removeListener(listener)
          port.disconnect()
          const payload = msg.payload as any
          resolve({
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
            error: payload.error || 'Unknown error',
            timestamp: new Date().toISOString()
          })
        }
      }

      port.onMessage.addListener(listener)

      port.postMessage({
        type: MessageType.SETTINGS_BENCHMARK_PROVIDER,
        payload: { provider },
        id: messageId
      })

      setTimeout(() => {
        port.onMessage.removeListener(listener)
        port.disconnect()
        resolve({
          success: false,
          latency: 30000,
          scores: {
            latency: 1,
            accuracy: 1,
            reliability: 1,
            planning: 1,
            navigation: 1,
            overall: 1
          },
          error: 'Benchmark timeout after 30 seconds',
          timestamp: new Date().toISOString()
        })
      }, 30000)  // 30 seconds for simple benchmark
    })
  }

  async runPerformanceTests(provider: LLMProvider, useBenchmark: boolean = false): Promise<PerformanceScore> {
    if (useBenchmark) {
      // Run comprehensive benchmark tests
      const benchmarkResult = await this.benchmarkProvider(provider)

      if (!benchmarkResult.success) {
        return benchmarkResult.scores || {
          latency: 1,
          accuracy: 1,
          reliability: 1,
          planning: 1,
          navigation: 1,
          overall: 1
        }
      }

      return benchmarkResult.scores
    }

    // Use simple test for quick validation (existing logic)
    const testResult = await this.testProvider(provider)

    if (!testResult.success) {
      return {
        latency: 1,
        accuracy: 1,
        reliability: 1,
        overall: 1
      }
    }

    // Calculate latency score based on response time
    const latencyScore = this.calculateLatencyScore(testResult.latency)

    // Calculate reliability score based on test success
    const reliability = 10 // Passed basic test

    // Calculate accuracy score based on provider type and model (estimated)
    const accuracy = this.calculateAccuracyScore(provider)

    const overall = (latencyScore + accuracy + reliability) / 3

    return {
      latency: Math.round(latencyScore * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      reliability: Math.round(reliability * 10) / 10,
      overall: Math.round(overall * 10) / 10
    }
  }

  private calculateAccuracyScore(provider: LLMProvider): number {
    const providerType = provider.type.toLowerCase()
    const modelId = provider.modelId?.toLowerCase() || ''

    // High accuracy models
    if (providerType === 'anthropic') {
      if (modelId.includes('opus') || modelId.includes('sonnet')) return 10
      if (modelId.includes('haiku')) return 8
      return 9
    }

    if (providerType === 'openai') {
      if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo')) return 9
      if (modelId.includes('gpt-4')) return 9
      if (modelId.includes('gpt-3.5')) return 7
      return 8
    }

    if (providerType === 'google_gemini') {
      if (modelId.includes('2.0')) return 9
      if (modelId.includes('1.5-pro')) return 8
      if (modelId.includes('1.5-flash')) return 7
      return 7
    }

    // Local models - varies by model
    if (providerType === 'ollama') {
      if (modelId.includes('qwen')) return 7
      if (modelId.includes('llama') && modelId.includes('70b')) return 8
      if (modelId.includes('llama')) return 6
      if (modelId.includes('mistral')) return 6
      if (modelId.includes('codellama')) return 6
      return 5
    }

    // Default scores
    if (providerType === 'openrouter') return 8
    if (providerType === 'openai_compatible') return 7
    if (providerType === 'browseros') return 9

    return 7
  }

  private calculateLatencyScore(latency: number): number {
    if (latency < 500) return 10
    if (latency < 1000) return 9
    if (latency < 1500) return 8
    if (latency < 2000) return 7
    if (latency < 3000) return 6
    if (latency < 4000) return 5
    if (latency < 5000) return 4
    if (latency < 7000) return 3
    if (latency < 10000) return 2
    return 1
  }

  getRecommendation(provider: LLMProvider, score: PerformanceScore): string {
    const providerType = provider.type.toLowerCase()
    const modelId = provider.modelId?.toLowerCase() || ''

    // Anthropic models
    if (providerType === 'anthropic') {
      if (modelId.includes('opus')) {
        return '🌟 Best for complex agent tasks - Highest reasoning ability'
      }
      if (modelId.includes('sonnet')) {
        return '⚡ Excellent for agent tasks - Best balance of speed and intelligence'
      }
      if (modelId.includes('haiku')) {
        return '💬 Good for chat - Fast responses, lighter reasoning'
      }
      return '✅ Excellent for both chat and agent tasks'
    }

    // OpenAI models
    if (providerType === 'openai') {
      if (modelId.includes('gpt-4o')) {
        return '🌟 Excellent for agent tasks - Fast and highly capable'
      }
      if (modelId.includes('gpt-4-turbo')) {
        return '⚡ Great for agent tasks - Good reasoning speed'
      }
      if (modelId.includes('gpt-4')) {
        return '✅ Good for complex agent tasks - Slower but accurate'
      }
      if (modelId.includes('gpt-3.5')) {
        return '💬 Best for chat - Fast but limited reasoning'
      }
      return '✅ Good for general chat and agent tasks'
    }

    // Gemini models
    if (providerType === 'google_gemini') {
      if (modelId.includes('2.0')) {
        return '⚡ Excellent for agent tasks - Native tool calling support'
      }
      if (modelId.includes('1.5-pro')) {
        return '🖼️ Great for multimodal agent tasks - Excellent with images'
      }
      if (modelId.includes('flash')) {
        return '💬 Good for chat - Fast and efficient'
      }
      return '🖼️ Great for multimodal tasks with images'
    }

    // Ollama models
    if (providerType === 'ollama') {
      if (modelId.includes('qwen3:4b') || modelId.includes('qwen')) {
        return '🏠 Recommended for local agent tasks - Good balance of performance and speed'
      }
      if (modelId.includes('llama') && modelId.includes('70b')) {
        return '🏠 Good for agent tasks - Requires high-end hardware'
      }
      if (modelId.includes('llama')) {
        return '💬 Best for chat - Lighter agent tasks only'
      }
      if (modelId.includes('codellama')) {
        return '💻 Best for code-focused tasks'
      }
      if (modelId.includes('mistral')) {
        return '💬 Good for chat - Basic agent tasks'
      }
      return '🏠 Best for local development and testing'
    }

    // LM Studio / OpenAI Compatible
    if (providerType === 'openai_compatible') {
      return '🏠 Use Qwen or Llama models for agent tasks - Check model compatibility'
    }

    // OpenRouter
    if (providerType === 'openrouter') {
      return '🌐 Access to multiple models - Check specific model capabilities'
    }

    // BrowserOS
    if (providerType === 'browseros') {
      return '🌟 Optimized for web browsing tasks'
    }

    // Fallback
    if (score.overall >= 8) {
      return '✅ Excellent for both chat and agent tasks'
    }
    if (score.overall >= 6) {
      return '💬 Suitable for basic chat interactions'
    }

    return '⚠️ May have performance limitations for agent tasks'
  }

  /**
   * Store test results in chrome.browserOS prefs
   */
  async storeTestResults(providerId: string, results: TestResult, scores?: PerformanceScore): Promise<boolean> {
    const data = {
      providerId,
      testResult: results,
      performanceScores: scores,
      timestamp: new Date().toISOString()
    }

    return new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'options' })
      const messageId = `store-${Date.now()}`

      const listener = (msg: PortMessage) => {
        if (msg.id === messageId && msg.type === MessageType.SETTINGS_SET_PREF_RESPONSE) {
          port.onMessage.removeListener(listener)
          port.disconnect()
          const payload = msg.payload as any
          resolve(payload.success)
        }
      }

      port.onMessage.addListener(listener)

      port.postMessage({
        type: MessageType.SETTINGS_SET_PREF,
        payload: {
          name: `browseros.llm_test_results_${providerId}`,
          value: JSON.stringify(data)
        },
        id: messageId
      })

      setTimeout(() => {
        port.onMessage.removeListener(listener)
        port.disconnect()
        localStorage.setItem(`browseros.llm_test_results_${providerId}`, JSON.stringify(data))
        resolve(true)
      }, 5000)
    })
  }

  async getStoredResults(providerId: string): Promise<{ testResult: TestResult; performanceScores?: PerformanceScore } | null> {
    return new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'options' })
      const messageId = `get-${Date.now()}`

      const listener = (msg: PortMessage) => {
        if (msg.id === messageId && msg.type === MessageType.SETTINGS_GET_PREF_RESPONSE) {
          port.onMessage.removeListener(listener)
          port.disconnect()

          const payload = msg.payload as any
          if (payload.value) {
            try {
              const data = JSON.parse(payload.value)
              resolve(data)
            } catch {
              resolve(null)
            }
          } else {
            resolve(null)
          }
        }
      }

      port.onMessage.addListener(listener)

      port.postMessage({
        type: MessageType.SETTINGS_GET_PREF,
        payload: { name: `browseros.llm_test_results_${providerId}` },
        id: messageId
      })

      setTimeout(() => {
        port.onMessage.removeListener(listener)
        port.disconnect()
        const stored = localStorage.getItem(`browseros.llm_test_results_${providerId}`)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            resolve(data)
          } catch {
            resolve(null)
          }
        } else {
          resolve(null)
        }
      }, 5000)
    })
  }
}