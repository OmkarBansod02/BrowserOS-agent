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
  instructionFollowing: number
  contextUnderstanding: number
  toolUsage: number
  planning: number
  errorRecovery: number
  performance: number
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
      let port: chrome.runtime.Port | null = null
      let keepAliveInterval: NodeJS.Timeout | null = null
      let timeoutTimer: NodeJS.Timeout | null = null
      const messageId = `benchmark-${Date.now()}`

      // Function to cleanup resources
      const cleanup = () => {
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval)
          keepAliveInterval = null
        }
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
        if (port) {
          try {
            port.onMessage.removeListener(listener)
            port.onDisconnect.removeListener(disconnectListener)
            port.disconnect()
          } catch (e) {
            // Port might already be disconnected
          }
          port = null
        }
      }

      const listener = (msg: PortMessage) => {
        if (msg.id === messageId && msg.type === MessageType.SETTINGS_BENCHMARK_PROVIDER_RESPONSE) {
          cleanup()
          const payload = msg.payload as any
          resolve(payload as BenchmarkResult)
        } else if (msg.id === messageId && msg.type === MessageType.ERROR) {
          cleanup()
          const payload = msg.payload as any
          resolve({
            success: false,
            latency: 0,
            scores: {
              instructionFollowing: 0,
              contextUnderstanding: 0,
              toolUsage: 0,
              planning: 0,
              errorRecovery: 0,
              performance: 0,
              overall: 0
            },
            error: payload.error || 'Unknown error',
            timestamp: new Date().toISOString()
          })
        }
      }

      const disconnectListener = () => {
        // Port was disconnected unexpectedly
        cleanup()
        resolve({
          success: false,
          latency: 0,
          scores: {
            instructionFollowing: 0,
            contextUnderstanding: 0,
            toolUsage: 0,
            planning: 0,
            errorRecovery: 0,
            performance: 0,
            overall: 0
          },
          error: 'Connection lost to background service. Please try again.',
          timestamp: new Date().toISOString()
        })
      }

      try {
        port = chrome.runtime.connect({ name: 'options' })

        port.onMessage.addListener(listener)
        port.onDisconnect.addListener(disconnectListener)

        // Send keep-alive ping every 20 seconds to prevent disconnection
        keepAliveInterval = setInterval(() => {
          if (port) {
            try {
              port.postMessage({
                type: 'KEEP_ALIVE',
                id: `keepalive-${messageId}`
              })
            } catch (e) {
              // Port might be disconnected
              cleanup()
            }
          }
        }, 20000) // Every 20 seconds

        port.postMessage({
          type: MessageType.SETTINGS_BENCHMARK_PROVIDER,
          payload: { provider },
          id: messageId
        })

        // Set timeout for 180 seconds (3 minutes) instead of 120
        timeoutTimer = setTimeout(() => {
          cleanup()
          resolve({
            success: false,
            latency: 180000,
            scores: {
              instructionFollowing: 0,
              contextUnderstanding: 0,
              toolUsage: 0,
              planning: 0,
              errorRecovery: 0,
              performance: 0,
              overall: 0
            },
            error: 'Benchmark timeout after 3 minutes. The provider may be unresponsive.',
            timestamp: new Date().toISOString()
          })
        }, 180000)  // 180 seconds (3 minutes) for comprehensive benchmark

      } catch (error) {
        cleanup()
        resolve({
          success: false,
          latency: 0,
          scores: {
            instructionFollowing: 0,
            contextUnderstanding: 0,
            toolUsage: 0,
            planning: 0,
            errorRecovery: 0,
            performance: 0,
            overall: 0
          },
          error: error instanceof Error ? error.message : 'Failed to connect to extension service',
          timestamp: new Date().toISOString()
        })
      }
    })
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