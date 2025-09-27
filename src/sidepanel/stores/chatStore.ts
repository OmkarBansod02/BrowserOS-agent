import { create } from 'zustand'
import { z } from 'zod'
import { MessageType } from '@/lib/types/messaging'
import { PortMessaging, PortPrefix } from '@/lib/runtime/PortMessaging'
import { FeedbackSubmissionSchema, type FeedbackSubmission, type FeedbackType } from '@/lib/types/feedback'
import { feedbackService } from '@/lib/services/feedbackService'

// Message schema for chat store with Zod validation
export const MessageSchema = z.object({
  msgId: z.string(),  // Primary ID for both React keys and PubSub correlation
  role: z.enum(['user', 'thinking', 'assistant', 'error', 'narration', 'plan_editor']), 
  content: z.string(),  // Message content
  timestamp: z.date(),  // When message was created
  metadata: z.object({
    toolName: z.string().optional(),  // Tool name if this is a tool result
  }).optional()  // Minimal metadata
})

export type Message = z.infer<typeof MessageSchema>

// Per-execution chat state schema
const ExecutionChatStateSchema = z.object({
  messages: z.array(MessageSchema),  // All chat messages
  isProcessing: z.boolean(),  // Is agent currently processing
  error: z.string().nullable(),  // Current error message if any
  feedbacks: z.record(z.string(), FeedbackSubmissionSchema),  // messageId -> feedback
  feedbackUI: z.record(z.string(), z.object({
    isSubmitting: z.boolean(),
    showModal: z.boolean(),
    error: z.string().nullable()
  })),  // messageId -> UI state
  executedPlans: z.record(z.string(), z.boolean())  // planId -> executed status
})

// Constants for execution management
const MAX_EXECUTIONS = 20  // Maximum number of executions to keep
const EXECUTION_AGE_LIMIT_MS = 30 * 60 * 1000  // 30 minutes

// Global store state schema
const ChatStateSchema = z.object({
  executions: z.record(z.string(), ExecutionChatStateSchema),  // executionId -> execution state
  currentExecutionId: z.string().nullable(),  // Active execution ID
  currentTabId: z.number().nullable(),  // Active browser tab id
  tabExecutionMap: z.record(z.string(), z.string()),  // tabId -> executionId mapping
  executionTimestamps: z.record(z.string(), z.number()).optional()  // executionId -> last activity timestamp
})

type ExecutionChatState = z.infer<typeof ExecutionChatStateSchema>
type ChatState = z.infer<typeof ChatStateSchema>

// External message format for upsert operations
export interface PubSubMessage {
  msgId: string
  content: string
  role: 'thinking' | 'user' | 'assistant' | 'error' | 'narration' | 'plan_editor'
  ts: number
}

// Store actions
interface ChatActions {
  // Execution management
  setCurrentExecution: (executionId: string | null) => void
  getCurrentExecution: () => string | null
  setCurrentTab: (tabId: number | null) => void
  setTabExecution: (tabId: number, executionId: string) => void
  getExecutionForTab: (tabId: number) => string | null
  migrateExecutionState: (fromExecutionId: string, toExecutionId: string) => void
  cleanupOldExecutions: () => void
  removeExecution: (executionId: string) => void
  
  // Message operations - now with executionId parameter
  upsertMessage: (executionId: string, pubsubMessage: PubSubMessage) => void
  addMessage: (executionId: string, message: Omit<Message, 'timestamp'>) => void
  updateMessage: (executionId: string, msgId: string, updates: Partial<Message>) => void
  clearMessages: (executionId: string) => void
  
  // Processing state
  setProcessing: (executionId: string, processing: boolean) => void
  
  // Error handling
  setError: (executionId: string, error: string | null) => void
  
  // Feedback operations
  submitFeedback: (executionId: string, messageId: string, type: FeedbackType, textFeedback?: string) => Promise<void>
  getFeedbackForMessage: (executionId: string, messageId: string) => FeedbackSubmission | null
  setFeedbackUIState: (executionId: string, messageId: string, state: Partial<{ isSubmitting: boolean; showModal: boolean; error: string | null }>) => void
  getFeedbackUIState: (executionId: string, messageId: string) => { isSubmitting: boolean; showModal: boolean; error: string | null }
  
  // Plan editing
  publishPlanEditResponse: (executionId: string, response: { planId: string; action: 'execute' | 'cancel'; steps?: any[] }) => void
  setPlanExecuted: (executionId: string, planId: string) => void
  
  // Current execution helpers (convenience methods)
  getCurrentMessages: () => Message[]
  getCurrentProcessingState: () => boolean
  getCurrentError: () => string | null
  
  // Reset operations
  resetExecution: (executionId: string) => void
  resetAll: () => void
}

// Default execution state
const createDefaultExecutionState = (): ExecutionChatState => ({
  messages: [],
  isProcessing: false,
  error: null,
  feedbacks: {},
  feedbackUI: {},
  executedPlans: {}
})

// Initial state
const initialState: ChatState = {
  executions: {},
  currentExecutionId: null,
  currentTabId: null,
  tabExecutionMap: {},
  executionTimestamps: {}
}

// Helper function to get or create execution state
const getOrCreateExecution = (state: ChatState, executionId: string): ExecutionChatState => {
  if (!state.executions[executionId]) {
    state.executions[executionId] = createDefaultExecutionState()
  }
  return state.executions[executionId]
}

// Create the store
export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  // State
  ...initialState,
  
  // Execution management
  setCurrentExecution: (executionId: string | null) => {
    console.log('[ChatStore] Setting current execution to:', executionId)

    if (executionId === null) {
      set(() => ({ currentExecutionId: null }))
      return
    }

    set((state) => {
      const executionState = getOrCreateExecution(state, executionId)
      const mergedExecutions = {
        ...state.executions,
        [executionId]: executionState
      }
      const updates: Partial<ChatState> = {
        currentExecutionId: executionId,
        executions: mergedExecutions
      }

      if (typeof state.currentTabId === 'number') {
        updates.tabExecutionMap = {
          ...state.tabExecutionMap,
          [String(state.currentTabId)]: executionId
        }
      }

      console.log('[ChatStore] Execution switched. Messages count:', mergedExecutions[executionId]?.messages?.length || 0)

      return updates
    })
  },

  getCurrentExecution: () => get().currentExecutionId,

  setCurrentTab: (tabId: number | null) => {
    console.log('[ChatStore] Setting current tab to:', tabId)
    set((state) => {
      if (tabId === null) {
        if (state.currentTabId === null) {
          return {}
        }
        return { currentTabId: null }
      }

      if (state.currentTabId === tabId && state.currentExecutionId) {
        return {}
      }

      const mappedExecutionId = state.tabExecutionMap[String(tabId)]
      if (!mappedExecutionId) {
        if (state.currentTabId === tabId) {
          return {}
        }
        return { currentTabId: tabId }
      }

      const executionState = getOrCreateExecution(state, mappedExecutionId)
      return {
        currentTabId: tabId,
        currentExecutionId: mappedExecutionId,
        executions: {
          ...state.executions,
          [mappedExecutionId]: executionState
        }
      }
    })
  },

  setTabExecution: (tabId: number, executionId: string) => {
    set((state) => {
      const executionState = getOrCreateExecution(state, executionId)
      const key = String(tabId)
      const updates: Partial<ChatState> = {
        executions: {
          ...state.executions,
          [executionId]: executionState
        }
      }

      if (state.tabExecutionMap[key] !== executionId) {
        updates.tabExecutionMap = {
          ...state.tabExecutionMap,
          [key]: executionId
        }
      }

      if (state.currentTabId === tabId && state.currentExecutionId !== executionId) {
        updates.currentExecutionId = executionId
      }

      return updates
    })
  },

  getExecutionForTab: (tabId: number) => {
    const state = get()
    const mapped = state.tabExecutionMap[String(tabId)]
    return mapped ?? null
  },

  migrateExecutionState: (fromExecutionId: string, toExecutionId: string) => {
    if (!fromExecutionId || !toExecutionId || fromExecutionId === toExecutionId) {
      return
    }

    set((state) => {
      const source = state.executions[fromExecutionId]
      if (!source) {
        return {}
      }

      const destination = state.executions[toExecutionId]
      const mergedState: ExecutionChatState = {
        messages: destination?.messages?.length ? [...destination.messages] : [...source.messages],
        isProcessing: destination?.isProcessing ?? source.isProcessing,
        error: destination?.error ?? source.error,
        feedbacks: {
          ...(destination?.feedbacks ?? {}),
          ...source.feedbacks
        },
        feedbackUI: {
          ...(destination?.feedbackUI ?? {}),
          ...source.feedbackUI
        },
        executedPlans: {
          ...(destination?.executedPlans ?? {}),
          ...source.executedPlans
        }
      }

      const updatedExecutions = {
        ...state.executions,
        [toExecutionId]: mergedState
      }
      delete updatedExecutions[fromExecutionId]

      const updatedTimestamps = { ...state.executionTimestamps }
      delete updatedTimestamps[fromExecutionId]
      updatedTimestamps[toExecutionId] = Date.now()

      const updatedMap: Record<string, string> = {}
      for (const [key, value] of Object.entries(state.tabExecutionMap)) {
        updatedMap[key] = value === fromExecutionId ? toExecutionId : value
      }

      const result: Partial<ChatState> = {
        executions: updatedExecutions,
        tabExecutionMap: updatedMap,
        executionTimestamps: updatedTimestamps
      }

      if (state.currentExecutionId === fromExecutionId) {
        result.currentExecutionId = toExecutionId
      }

      return result
    })
  },

  cleanupOldExecutions: () => {
    set((state) => {
      const now = Date.now()
      const timestamps = state.executionTimestamps || {}

      // Find executions to remove (old or exceeds limit)
      const executionIds = Object.keys(state.executions)
      const toRemove: string[] = []

      // Remove old executions
      for (const id of executionIds) {
        const timestamp = timestamps[id]
        if (timestamp && (now - timestamp > EXECUTION_AGE_LIMIT_MS)) {
          toRemove.push(id)
        }
      }

      // If still over limit, remove oldest
      if (executionIds.length - toRemove.length > MAX_EXECUTIONS) {
        const sortedByTime = executionIds
          .filter(id => !toRemove.includes(id))
          .sort((a, b) => (timestamps[a] || 0) - (timestamps[b] || 0))

        const excess = executionIds.length - toRemove.length - MAX_EXECUTIONS
        toRemove.push(...sortedByTime.slice(0, excess))
      }

      if (toRemove.length === 0) return {}

      // Remove executions
      const updatedExecutions = { ...state.executions }
      const updatedTimestamps = { ...timestamps }
      const updatedTabMap = { ...state.tabExecutionMap }

      for (const id of toRemove) {
        delete updatedExecutions[id]
        delete updatedTimestamps[id]

        // Remove from tab map
        for (const [tabId, execId] of Object.entries(updatedTabMap)) {
          if (execId === id) {
            delete updatedTabMap[tabId]
          }
        }
      }

      console.log(`[ChatStore] Cleaned up ${toRemove.length} old executions`)

      const updates: Partial<ChatState> = {
        executions: updatedExecutions,
        executionTimestamps: updatedTimestamps,
        tabExecutionMap: updatedTabMap
      }

      // Update current execution if it was removed
      if (state.currentExecutionId && toRemove.includes(state.currentExecutionId)) {
        updates.currentExecutionId = null
      }

      return updates
    })
  },

  removeExecution: (executionId: string) => {
    set((state) => {
      const updatedExecutions = { ...state.executions }
      const updatedTimestamps = { ...state.executionTimestamps }
      const updatedTabMap = { ...state.tabExecutionMap }

      delete updatedExecutions[executionId]
      delete updatedTimestamps[executionId]

      // Remove from tab map
      for (const [tabId, execId] of Object.entries(updatedTabMap)) {
        if (execId === executionId) {
          delete updatedTabMap[tabId]
        }
      }

      const updates: Partial<ChatState> = {
        executions: updatedExecutions,
        executionTimestamps: updatedTimestamps,
        tabExecutionMap: updatedTabMap
      }

      // Update current execution if it was removed
      if (state.currentExecutionId === executionId) {
        updates.currentExecutionId = null
      }

      return updates
    })
  },

  // Message operations
  upsertMessage: (executionId: string, pubsubMessage: PubSubMessage) => {
    set((state) => {
      console.log(`[ChatStore] Upserting message for execution ${executionId}:`, pubsubMessage.msgId, pubsubMessage.role)
      const execution = getOrCreateExecution(state, executionId)
      const existingIndex = execution.messages.findIndex(m => m.msgId === pubsubMessage.msgId)

      // Update timestamp for this execution
      const updatedTimestamps = {
        ...(state.executionTimestamps || {}),
        [executionId]: Date.now()
      }

      if (existingIndex >= 0) {
        // Update existing message content
        const updated = [...execution.messages]
        updated[existingIndex] = {
          ...updated[existingIndex],
          content: pubsubMessage.content,
          timestamp: new Date(pubsubMessage.ts)
        }
        return {
          executions: {
            ...state.executions,
            [executionId]: {
              ...execution,
              messages: updated,
              error: null
            }
          },
          executionTimestamps: updatedTimestamps
        }
      } else {
        const newMessage: Message = {
          msgId: pubsubMessage.msgId,
          content: pubsubMessage.content,
          role: pubsubMessage.role,
          timestamp: new Date(pubsubMessage.ts),
          metadata: {}
        }

        // Periodically cleanup old executions (every 10 messages)
        if (Math.random() < 0.1) {
          setTimeout(() => useChatStore.getState().cleanupOldExecutions(), 0)
        }

        return {
          executions: {
            ...state.executions,
            [executionId]: {
              ...execution,
              messages: [...execution.messages, newMessage],
              error: null,
              isProcessing: true  // Only set processing when adding new messages
            }
          },
          executionTimestamps: updatedTimestamps
        }
      }
    })
  },

  addMessage: (executionId: string, message: Omit<Message, 'timestamp'>) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            messages: [...execution.messages, { ...message, timestamp: new Date() }]
          }
        }
      }
    })
  },

  updateMessage: (executionId: string, msgId: string, updates: Partial<Message>) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            messages: execution.messages.map(msg => 
              msg.msgId === msgId ? { ...msg, ...updates } : msg
            )
          }
        }
      }
    })
  },
  
  clearMessages: (executionId: string) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            messages: []
          }
        }
      }
    })
  },
  
  setProcessing: (executionId: string, processing: boolean) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            isProcessing: processing
          }
        }
      }
    })
  },
  
  setError: (executionId: string, error: string | null) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            error
          }
        }
      }
    })
  },
  

  // Send plan edit response to background script
  publishPlanEditResponse: (executionId: string, response: { planId: string; action: 'execute' | 'cancel'; steps?: any[] }) => {
    const currentTabId = get().currentTabId
    if (typeof currentTabId !== 'number') {
      console.error('Failed to send plan edit response - no active tab context')
      return
    }

    const portKey = `${PortPrefix.SIDEPANEL}|tab-${currentTabId}`
    const messaging = PortMessaging.peekInstance(portKey)
    if (!messaging) {
      console.error('Failed to send plan edit response - no port instance for', portKey)
      return
    }

    const success = messaging.sendMessage(MessageType.PLAN_EDIT_RESPONSE, { ...response, executionId })
    if (!success) {
      console.error('Failed to send plan edit response - port not connected')
    }
  },

  setPlanExecuted: (executionId: string, planId: string) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            executedPlans: { ...execution.executedPlans, [planId]: true }
          }
        }
      }
    })
  },

  // Feedback operations
  submitFeedback: async (executionId: string, messageId: string, type: FeedbackType, textFeedback?: string) => {
    const sessionId = crypto.randomUUID()
    const feedbackId = crypto.randomUUID()
    
    // Set submitting state
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            feedbackUI: {
              ...execution.feedbackUI,
              [messageId]: {
                ...execution.feedbackUI[messageId],
                isSubmitting: true,
                error: null
              }
            }
          }
        }
      }
    })

    try {
      const state = get()
      const execution = state.executions[executionId]
      if (!execution) return

      const message = execution.messages.find((m: Message) => m.msgId === messageId)
      
      // Find the user message that triggered this agent response
      const messageIndex = execution.messages.findIndex((m: Message) => m.msgId === messageId)
      let userQuery = 'No user query found'
      
      // Look backwards from agent message to find the most recent user message
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (execution.messages[i].role === 'user') {
          userQuery = execution.messages[i].content
          break
        }
      }
      
      const feedback: FeedbackSubmission = {
        feedbackId,
        messageId,
        sessionId,
        type,
        textFeedback,
        timestamp: new Date(),
        agentResponse: message?.content,
        userQuery
      }

      // Store feedback locally
      set((state) => {
        const exec = getOrCreateExecution(state, executionId)
        return {
          executions: {
            ...state.executions,
            [executionId]: {
              ...exec,
              feedbacks: { ...exec.feedbacks, [messageId]: feedback },
              feedbackUI: {
                ...exec.feedbackUI,
                [messageId]: {
                  isSubmitting: false,
                  showModal: false,
                  error: null
                }
              }
            }
          }
        }
      })

      // Submit to Firebase
      await feedbackService.submitFeedback(feedback)
      
    } catch (error) {
      set((state) => {
        const execution = getOrCreateExecution(state, executionId)
        return {
          executions: {
            ...state.executions,
            [executionId]: {
              ...execution,
              feedbackUI: {
                ...execution.feedbackUI,
                [messageId]: {
                  ...execution.feedbackUI[messageId],
                  isSubmitting: false,
                  error: error instanceof Error ? error.message : 'Failed to submit feedback'
                }
              }
            }
          }
        }
      })
    }
  },

  getFeedbackForMessage: (executionId: string, messageId: string): FeedbackSubmission | null => {
    const state = get()
    const execution = state.executions[executionId]
    return execution?.feedbacks[messageId] || null
  },

  setFeedbackUIState: (executionId: string, messageId: string, newState: Partial<{ isSubmitting: boolean; showModal: boolean; error: string | null }>) => {
    set((state) => {
      const execution = getOrCreateExecution(state, executionId)
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...execution,
            feedbackUI: {
              ...execution.feedbackUI,
              [messageId]: {
                ...execution.feedbackUI[messageId],
                ...newState
              }
            }
          }
        }
      }
    })
  },

  getFeedbackUIState: (executionId: string, messageId: string): { isSubmitting: boolean; showModal: boolean; error: string | null } => {
    const state = get()
    const execution = state.executions[executionId]
    const uiState = execution?.feedbackUI[messageId]
    return uiState || { isSubmitting: false, showModal: false, error: null }
  },

  // Current execution helpers (convenience methods)
  getCurrentMessages: (): Message[] => {
    const state = get()
    const currentId = state.currentExecutionId
    if (!currentId) return []
    return state.executions[currentId]?.messages || []
  },

  getCurrentProcessingState: (): boolean => {
    const state = get()
    const currentId = state.currentExecutionId
    if (!currentId) return false
    return state.executions[currentId]?.isProcessing || false
  },

  getCurrentError: (): string | null => {
    const state = get()
    const currentId = state.currentExecutionId
    if (!currentId) return null
    return state.executions[currentId]?.error || null
  },

  // Reset operations
  resetExecution: (executionId: string) => {
    set((state) => ({
      executions: {
        ...state.executions,
        [executionId]: createDefaultExecutionState()
      }
    }))
  },

  resetAll: () => set(initialState)
}))

// Selectors for common operations
export const chatSelectors = {
  getLastMessage: (state: ChatState, executionId: string): Message | undefined => {
    const execution = state.executions[executionId]
    if (!execution) return undefined
    return execution.messages[execution.messages.length - 1]
  },
    
  hasMessages: (state: ChatState, executionId: string): boolean => {
    const execution = state.executions[executionId]
    return execution ? execution.messages.length > 0 : false
  },
    
  getMessageByMsgId: (state: ChatState, executionId: string, msgId: string): Message | undefined => {
    const execution = state.executions[executionId]
    return execution?.messages.find(msg => msg.msgId === msgId)
  },

  // Current execution selectors (convenience)
  getCurrentLastMessage: (state: ChatState): Message | undefined => {
    if (!state.currentExecutionId) return undefined
    return chatSelectors.getLastMessage(state, state.currentExecutionId)
  },

  getCurrentHasMessages: (state: ChatState): boolean => {
    if (!state.currentExecutionId) return false
    return chatSelectors.hasMessages(state, state.currentExecutionId)
  }
}





