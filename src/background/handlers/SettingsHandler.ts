import { PortMessage } from '@/lib/runtime/PortMessaging'
import { MessageType } from '@/lib/types/messaging'
import { Logging } from '@/lib/utils/Logging'

export class SettingsHandler {
  async handleGetPref(message: PortMessage, port: chrome.runtime.Port): Promise<void> {
    const { name } = message.payload as { name: string }

    // ONLY use chrome.storage.local - we're an extension, not browser settings
    try {
      chrome.storage.local.get(name, (result) => {
        port.postMessage({
          type: MessageType.SETTINGS_GET_PREF_RESPONSE,
          payload: { name, value: result[name] || null },
          id: message.id
        })
      })
    } catch (error) {
      Logging.log('SettingsHandler', `Error getting pref from storage ${name}: ${error}`, 'error')
      port.postMessage({
        type: MessageType.ERROR,
        payload: { error: `Failed to get preference: ${error}` },
        id: message.id
      })
    }
  }

  async handleSetPref(message: PortMessage, port: chrome.runtime.Port): Promise<void> {
    const { name, value } = message.payload as { name: string; value: string }

    // ONLY use chrome.storage.local - we're an extension, not browser settings
    try {
      chrome.storage.local.set({ [name]: value }, () => {
        const success = !chrome.runtime.lastError
        if (!success) {
          Logging.log('SettingsHandler', `Storage error for ${name}: ${chrome.runtime.lastError?.message}`, 'error')
        }
        port.postMessage({
          type: MessageType.SETTINGS_SET_PREF_RESPONSE,
          payload: { name, success },
          id: message.id
        })
      })
    } catch (error) {
      Logging.log('SettingsHandler', `Error setting pref in storage ${name}: ${error}`, 'error')
      port.postMessage({
        type: MessageType.ERROR,
        payload: { error: `Failed to set preference: ${error}` },
        id: message.id
      })
    }
  }

  async handleGetAllPrefs(message: PortMessage, port: chrome.runtime.Port): Promise<void> {
    // ONLY use chrome.storage.local - we're an extension, not browser settings
    try {
      chrome.storage.local.get(null, (items) => {
        port.postMessage({
          type: MessageType.SETTINGS_GET_ALL_PREFS_RESPONSE,
          payload: { prefs: items },
          id: message.id
        })
      })
    } catch (error) {
      Logging.log('SettingsHandler', `Error getting all prefs from storage: ${error}`, 'error')
      port.postMessage({
        type: MessageType.ERROR,
        payload: { error: `Failed to get all preferences: ${error}` },
        id: message.id
      })
    }
  }

  async handleTestProvider(message: PortMessage, port: chrome.runtime.Port): Promise<void> {
    const { provider } = message.payload as { provider: any }

    try {
      const { ChatOpenAI } = await import('@langchain/openai')
      const { ChatAnthropic } = await import('@langchain/anthropic')
      const { ChatOllama } = await import('@langchain/ollama')
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
      const { HumanMessage } = await import('@langchain/core/messages')

      const startTime = performance.now()

      try {
        let llm: any

        switch (provider.type) {
          case 'openai':
            llm = new ChatOpenAI({
              openAIApiKey: provider.apiKey,
              modelName: provider.modelId || 'gpt-4o-mini',
              temperature: 0.7,
              maxTokens: 100,
              streaming: false
            })
            break

          case 'anthropic':
            llm = new ChatAnthropic({
              anthropicApiKey: provider.apiKey,
              modelName: provider.modelId || 'claude-3-5-sonnet-latest',
              temperature: 0.7,
              maxTokens: 100,
              streaming: false
            })
            break

          case 'google_gemini':
            if (!provider.apiKey) {
              throw new Error('API key required for Google Gemini')
            }
            llm = new ChatGoogleGenerativeAI({
              model: provider.modelId || 'gemini-2.0-flash',
              temperature: 0.7,
              maxOutputTokens: 100,
              apiKey: provider.apiKey,
              convertSystemMessageToHumanContent: true
            })
            break

          case 'ollama':
            // Replace localhost with 127.0.0.1 for better compatibility
            let baseUrl = provider.baseUrl || 'http://localhost:11434'
            if (baseUrl.includes('localhost')) {
              baseUrl = baseUrl.replace('localhost', '127.0.0.1')
            }
            llm = new ChatOllama({
              baseUrl,
              model: provider.modelId || 'qwen3:4b',
              temperature: 0.7,
              numPredict: 100
            })
            break

          case 'openrouter':
            if (!provider.apiKey) {
              throw new Error('API key required for OpenRouter')
            }
            llm = new ChatOpenAI({
              openAIApiKey: provider.apiKey,
              modelName: provider.modelId || 'auto',
              temperature: 0.7,
              maxTokens: 100,
              streaming: false,
              configuration: {
                baseURL: provider.baseUrl || 'https://openrouter.ai/api/v1'
              }
            })
            break

          case 'openai_compatible':
          case 'custom':
            if (!provider.baseUrl) {
              throw new Error('Base URL required for OpenAI Compatible provider')
            }
            llm = new ChatOpenAI({
              openAIApiKey: provider.apiKey || 'dummy-key',
              modelName: provider.modelId || 'default',
              temperature: 0.7,
              maxTokens: 100,
              streaming: false,
              configuration: {
                baseURL: provider.baseUrl
              }
            })
            break

          case 'browseros':
            llm = new ChatOpenAI({
              openAIApiKey: 'browseros-key',
              modelName: 'default-llm',
              temperature: 0.7,
              maxTokens: 100,
              streaming: false,
              configuration: {
                baseURL: 'https://llm.browseros.com/default/'
              }
            })
            break

          default:
            throw new Error(`Unsupported provider type: ${provider.type}`)
        }

        const testMessage = new HumanMessage('Hello! Please respond with "Hello World" to confirm you are working.')
        const response = await llm.invoke([testMessage])
        const latency = performance.now() - startTime

        port.postMessage({
          type: MessageType.SETTINGS_TEST_PROVIDER_RESPONSE,
          payload: {
            success: true,
            latency,
            response: response.content as string,
            timestamp: new Date().toISOString()
          },
          id: message.id
        })
      } catch (testError) {
        const latency = performance.now() - startTime

        port.postMessage({
          type: MessageType.SETTINGS_TEST_PROVIDER_RESPONSE,
          payload: {
            success: false,
            latency,
            error: testError instanceof Error ? testError.message : 'Unknown error',
            timestamp: new Date().toISOString()
          },
          id: message.id
        })
      }
    } catch (error) {
      Logging.log('SettingsHandler', `Error testing provider: ${error}`, 'error')
      port.postMessage({
        type: MessageType.ERROR,
        payload: { error: `Failed to test provider: ${error}` },
        id: message.id
      })
    }
  }

  async handleBenchmarkProvider(message: PortMessage, port: chrome.runtime.Port): Promise<void> {
    const { provider } = message.payload as { provider: any }

    Logging.log('SettingsHandler', `Starting benchmark for ${provider.name} (${provider.type})`)

    try {
      const { ChatOpenAI } = await import('@langchain/openai')
      const { ChatAnthropic } = await import('@langchain/anthropic')
      const { ChatOllama } = await import('@langchain/ollama')
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')

      // Benchmark tasks to test different LLM capabilities
      const benchmarkTasks = [
        {
          name: 'simple_navigation',
          description: 'Basic navigation task',
          prompt: 'Navigate to example.com',
          expectedActions: ['navigate'],
          weight: 0.25
        },
        {
          name: 'search_task',
          description: 'Search and interaction',
          prompt: 'Go to google.com and search for "weather forecast"',
          expectedActions: ['navigate', 'find', 'type'],
          weight: 0.35
        },
        {
          name: 'complex_planning',
          description: 'Multi-step task planning',
          prompt: 'Open amazon.com, search for "laptop", and click on the first result',
          expectedActions: ['navigate', 'find', 'type', 'click'],
          weight: 0.4
        }
      ]

      const startTime = performance.now()
      const taskResults: any[] = []

      try {
        let llm: any

        // Initialize the LLM based on provider type
        switch (provider.type) {
          case 'openai':
            llm = new ChatOpenAI({
              openAIApiKey: provider.apiKey,
              modelName: provider.modelId || 'gpt-4o-mini',
              temperature: 0.3,
              maxTokens: 500,
              streaming: false
            })
            break

          case 'anthropic':
            llm = new ChatAnthropic({
              anthropicApiKey: provider.apiKey,
              modelName: provider.modelId || 'claude-3-5-sonnet-latest',
              temperature: 0.3,
              maxTokens: 500,
              streaming: false
            })
            break

          case 'google_gemini':
            if (!provider.apiKey) {
              throw new Error('API key required for Google Gemini')
            }
            llm = new ChatGoogleGenerativeAI({
              model: provider.modelId || 'gemini-2.0-flash',
              temperature: 0.3,
              maxOutputTokens: 500,
              apiKey: provider.apiKey,
              convertSystemMessageToHumanContent: true
            })
            break

          case 'ollama':
            let baseUrl = provider.baseUrl || 'http://localhost:11434'
            if (baseUrl.includes('localhost')) {
              baseUrl = baseUrl.replace('localhost', '127.0.0.1')
            }
            llm = new ChatOllama({
              baseUrl,
              model: provider.modelId || 'qwen3:4b',
              temperature: 0.3,
              numPredict: 500
            })
            break

          case 'openrouter':
            if (!provider.apiKey) {
              throw new Error('API key required for OpenRouter')
            }
            llm = new ChatOpenAI({
              openAIApiKey: provider.apiKey,
              modelName: provider.modelId || 'auto',
              temperature: 0.3,
              maxTokens: 500,
              streaming: false,
              configuration: {
                baseURL: provider.baseUrl || 'https://openrouter.ai/api/v1'
              }
            })
            break

          case 'openai_compatible':
          case 'custom':
            if (!provider.baseUrl) {
              throw new Error('Base URL required for OpenAI Compatible provider')
            }
            llm = new ChatOpenAI({
              openAIApiKey: provider.apiKey || 'dummy-key',
              modelName: provider.modelId || 'default',
              temperature: 0.3,
              maxTokens: 500,
              streaming: false,
              configuration: {
                baseURL: provider.baseUrl
              }
            })
            break

          case 'browseros':
            llm = new ChatOpenAI({
              openAIApiKey: 'browseros-key',
              modelName: 'default-llm',
              temperature: 0.3,
              maxTokens: 500,
              streaming: false,
              configuration: {
                baseURL: 'https://llm.browseros.com/default/'
              }
            })
            break

          default:
            throw new Error(`Unsupported provider type: ${provider.type}`)
        }

        // Run each benchmark task
        for (const task of benchmarkTasks) {
          const taskStartTime = performance.now()

          try {
            // Create a structured prompt that asks the LLM to describe which tools to use
            const systemPrompt = new SystemMessage(
              'You are a browser automation assistant. For the given task, list the exact sequence of actions needed. ' +
              'Available actions: navigate(url), find_element(selector), type_text(text), click(selector). ' +
              'Respond with a JSON array of actions like: [{"action": "navigate", "params": {"url": "..."}}]'
            )
            const userPrompt = new HumanMessage(task.prompt)

            // Get the LLM's response
            const response = await llm.invoke([systemPrompt, userPrompt])
            const taskLatency = performance.now() - taskStartTime

            Logging.log('SettingsHandler', `LLM response for ${task.name}: ${typeof response.content === 'string' ? response.content.substring(0, 100) : 'non-string'}`)

            // Parse the response to extract planned actions
            let usedTools: string[] = []
            try {
              const content = typeof response.content === 'string' ? response.content : ''
              // Try to extract JSON array from response
              const jsonMatch = content.match(/\[[\s\S]*\]/)
              if (jsonMatch) {
                const actions = JSON.parse(jsonMatch[0])
                usedTools = actions.map((a: any) => a.action || '')
              }
            } catch (parseError) {
              // If can't parse, try to extract action words from text
              const content = typeof response.content === 'string' ? response.content.toLowerCase() : ''
              if (content.includes('navigate')) usedTools.push('navigate')
              if (content.includes('find') || content.includes('locate')) usedTools.push('find')
              if (content.includes('type') || content.includes('enter')) usedTools.push('type')
              if (content.includes('click')) usedTools.push('click')
            }

            // Calculate accuracy based on expected actions
            const expectedSet = new Set(task.expectedActions)
            const actualSet = new Set(usedTools.map((t: string) => t.split('_')[0]))
            const correctActions = [...expectedSet].filter(a => actualSet.has(a))
            const accuracy = expectedSet.size > 0 ? correctActions.length / expectedSet.size : 0

            taskResults.push({
              name: task.name,
              success: usedTools.length > 0,
              latency: taskLatency,
              accuracy,
              toolsUsed: usedTools,
              weight: task.weight
            })
          } catch (taskError) {
            taskResults.push({
              name: task.name,
              success: false,
              latency: performance.now() - taskStartTime,
              accuracy: 0,
              error: taskError instanceof Error ? taskError.message : 'Task failed',
              weight: task.weight
            })
          }
        }

        const totalLatency = performance.now() - startTime

        // Calculate weighted scores
        const weightedAccuracy = taskResults.reduce((sum, r) => sum + (r.accuracy * r.weight), 0)
        const weightedSuccess = taskResults.reduce((sum, r) => sum + ((r.success ? 1 : 0) * r.weight), 0)
        const avgTaskLatency = taskResults.reduce((sum, r) => sum + r.latency, 0) / taskResults.length

        Logging.log('SettingsHandler', `Benchmark results - Tasks: ${taskResults.length}, Success: ${weightedSuccess}, Accuracy: ${weightedAccuracy}, AvgLatency: ${avgTaskLatency}ms`)

        // Calculate performance scores (1-10 scale)
        const latencyScore = this.calculateLatencyScore(avgTaskLatency)
        const accuracyScore = Math.round(weightedAccuracy * 10)
        const reliabilityScore = Math.round(weightedSuccess * 10)
        const planningScore = this.calculatePlanningScore(taskResults)

        // Navigation score based on navigation and search tasks
        const navTasks = taskResults.filter(r =>
          r.name === 'simple_navigation' || r.name === 'search_task'
        )
        const navigationScore = navTasks.length > 0
          ? Math.round((navTasks.reduce((sum, r) => sum + r.accuracy, 0) / navTasks.length) * 10)
          : 5

        port.postMessage({
          type: MessageType.SETTINGS_BENCHMARK_PROVIDER_RESPONSE,
          payload: {
            success: true,
            latency: totalLatency,
            scores: {
              latency: latencyScore,
              accuracy: accuracyScore,
              reliability: reliabilityScore,
              planning: planningScore,
              navigation: navigationScore,
              overall: Math.round((latencyScore + accuracyScore + reliabilityScore + planningScore + navigationScore) / 5)
            },
            taskResults,
            timestamp: new Date().toISOString()
          },
          id: message.id
        })
      } catch (benchmarkError) {
        const latency = performance.now() - startTime

        port.postMessage({
          type: MessageType.SETTINGS_BENCHMARK_PROVIDER_RESPONSE,
          payload: {
            success: false,
            latency,
            error: benchmarkError instanceof Error ? benchmarkError.message : 'Benchmark failed',
            scores: {
              latency: 1,
              accuracy: 1,
              reliability: 1,
              planning: 1,
              navigation: 1,
              overall: 1
            },
            taskResults,
            timestamp: new Date().toISOString()
          },
          id: message.id
        })
      }
    } catch (error) {
      Logging.log('SettingsHandler', `Error benchmarking provider: ${error}`, 'error')
      port.postMessage({
        type: MessageType.ERROR,
        payload: { error: `Failed to benchmark provider: ${error}` },
        id: message.id
      })
    }
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

  private calculatePlanningScore(taskResults: any[]): number {
    const planningTask = taskResults.find(r => r.name === 'complex_planning')
    if (!planningTask) return 5

    // Complex task should use multiple tools
    if (planningTask.success && planningTask.toolsUsed?.length >= 3) {
      return Math.round(planningTask.accuracy * 10)
    }
    return planningTask.success ? 5 : 1
  }
}