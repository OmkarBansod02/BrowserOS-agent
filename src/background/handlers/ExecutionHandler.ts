import { MessageType, ExecuteQueryMessage, CancelTaskMessage, ResetConversationMessage } from '@/lib/types/messaging'
import { PortMessage } from '@/lib/runtime/PortMessaging'
import { Logging } from '@/lib/utils/Logging'
import { PubSub } from '@/lib/pubsub'
import { PortManager } from '../router/PortManager'
import { ExecutionRegistry } from './ExecutionRegistry'

const DEFAULT_EXECUTION_ID = 'main'

type ExecutionAwarePayload = Partial<ExecuteQueryMessage['payload']> & { executionId?: string }

type CancelPayload = CancelTaskMessage['payload'] & { executionId?: string }
type ResetPayload = ResetConversationMessage['payload'] & { executionId?: string }

type HumanInputResponsePayload = {
  requestId: string
  action: 'done' | 'abort'
  executionId?: string
}

/**
 * Handles execution-related messages:
 * - EXECUTE_QUERY: Start a new query execution (opens sidepanel if source is 'newtab')
 * - CANCEL_TASK: Cancel running execution
 * - RESET_CONVERSATION: Reset execution state
 */
export class ExecutionHandler {
  private readonly registry: ExecutionRegistry
  private readonly portManager?: PortManager

  constructor(portManager?: PortManager) {
    this.registry = new ExecutionRegistry()
    this.portManager = portManager
  }

  private async updateSidePanelVisibility(tabId: number | undefined, enabled: boolean): Promise<void> {
    if (typeof tabId !== 'number') {
      return
    }
    if (!chrome?.sidePanel?.setOptions) {
      return
    }

    try {
      await chrome.sidePanel.setOptions({ tabId, enabled })
      Logging.log('ExecutionHandler', `${enabled ? 'Enabled' : 'Disabled'} sidepanel for tab ${tabId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      Logging.log('ExecutionHandler', `Failed to ${enabled ? 'enable' : 'disable'} sidepanel for tab ${tabId}: ${message}`, 'warning')
    }
  }

  private async syncSidePanelVisibility(): Promise<void> {
    if (!this.portManager) {
      return
    }
    const trackedTabs = this.portManager.getTrackedTabs()
    if (trackedTabs.length === 0) {
      return
    }

    await Promise.all(trackedTabs.map(async (tabId) => {
      const executionId = this.portManager?.getExecutionForTab(tabId)
      const shouldEnable = !!executionId && this.registry.has(executionId)
      await this.updateSidePanelVisibility(tabId, shouldEnable)
    }))
  }

  /**
   * Resolve an executionId from the payload/port context.
   */
  private resolveExecutionId(
    payload: ExecutionAwarePayload | undefined,
    port?: chrome.runtime.Port,
    fallbackTabId?: number
  ): string {
    const directId = payload?.executionId
    if (typeof directId === 'string' && directId.trim().length > 0) {
      return directId.trim()
    }

    const metadataExecutionId = (payload?.metadata as { executionId?: string } | undefined)?.executionId
    if (typeof metadataExecutionId === 'string' && metadataExecutionId.trim().length > 0) {
      return metadataExecutionId.trim()
    }

    const payloadTabId = Array.isArray(payload?.tabIds)
      ? payload.tabIds.find((id): id is number => typeof id === 'number')
      : undefined
    if (typeof payloadTabId === 'number') {
      return `tab-${payloadTabId}`
    }

    if (typeof fallbackTabId === 'number') {
      return `tab-${fallbackTabId}`
    }

    const senderTabId = port?.sender?.tab?.id
    if (typeof senderTabId === 'number') {
      return `tab-${senderTabId}`
    }

    return DEFAULT_EXECUTION_ID
  }

  /**
   * Handle EXECUTE_QUERY message
   */
  async handleExecuteQuery(
    message: PortMessage,
    port: chrome.runtime.Port
  ): Promise<void> {
    const payload = message.payload as ExecuteQueryMessage['payload'] & { executionId?: string }
    const { query, tabIds, chatMode, metadata } = payload

    const executionId = this.resolveExecutionId(payload, port)
    Logging.log('ExecutionHandler', `Resolved executionId: ${executionId} for query: "${query}"`)
    const execution = this.registry.getOrCreate(executionId)

    const normalizedTabIds = Array.isArray(tabIds)
      ? tabIds.filter((id): id is number => typeof id === 'number')
      : []

    const senderTabId = port.sender?.tab?.id
    const primaryTabId = normalizedTabIds[0] ?? (typeof senderTabId === 'number' ? senderTabId : undefined)

    this.portManager?.setPortExecution(port, executionId, primaryTabId)

    await this.updateSidePanelVisibility(primaryTabId, true)
    await this.syncSidePanelVisibility()

    Logging.log(
      'ExecutionHandler',
      `Starting execution ${executionId}: "${query}" (mode: ${chatMode ? 'chat' : 'browse'}) [tab=${primaryTabId ?? 'unknown'}]`
    )

    Logging.logMetric('query_initiated', {
      query,
      executionId,
      source: metadata?.source || 'unknown',
      mode: chatMode ? 'chat' : 'browse',
      executionMode: metadata?.executionMode || 'dynamic',
      tabId: primaryTabId ?? null
    })

    try {
      if (execution.isRunning()) {
        Logging.log('ExecutionHandler', `Cancelling previous task for ${executionId}`)
        execution.cancel()
        // Wait a moment to ensure cancellation is processed
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      execution.updateOptions({
        mode: chatMode ? 'chat' : 'browse',
        tabId: primaryTabId,
        tabIds: normalizedTabIds,
        metadata,
        debug: false
      })

      if (normalizedTabIds.length > 0) {
        normalizedTabIds.forEach((id) => {
          this.portManager?.updateExecutionForTab(id, executionId)
        })
      } else if (typeof senderTabId === 'number') {
        this.portManager?.updateExecutionForTab(senderTabId, executionId)
      }

      await this.syncSidePanelVisibility()

      await execution.run(query, metadata)

      port.postMessage({
        type: MessageType.WORKFLOW_STATUS,
        payload: {
          status: 'success',
          executionId
        },
        id: message.id
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      Logging.log('ExecutionHandler', `Error executing query for ${executionId}: ${errorMessage}`, 'error')

      port.postMessage({
        type: MessageType.WORKFLOW_STATUS,
        payload: {
          status: 'error',
          error: errorMessage,
          executionId
        },
        id: message.id
      })
    }
  }

  /**
   * Handle CANCEL_TASK message
   */
  handleCancelTask(
    message: PortMessage,
    port: chrome.runtime.Port
  ): void {
    const payload = message.payload as CancelPayload
    const executionId = this.resolveExecutionId(payload, port)
    const hadExplicitId = typeof payload.executionId === 'string'

    Logging.log('ExecutionHandler', `Cancelling execution ${executionId}`)

    try {
      let cancelled = this.registry.cancel(executionId)

      if (!cancelled && !hadExplicitId) {
        this.registry.cancelAll()
        cancelled = true
        Logging.log('ExecutionHandler', 'No scoped execution found, cancelled all active executions', 'warning')
      }

      if (cancelled) {
        Logging.logMetric('task_cancelled', { executionId })
      }

      port.postMessage({
        type: MessageType.WORKFLOW_STATUS,
        payload: {
          status: 'success',
          message: cancelled ? 'Task cancelled' : 'No active task to cancel',
          executionId
        },
        id: message.id
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      Logging.log('ExecutionHandler', `Error cancelling execution ${executionId}: ${errorMessage}`, 'error')

      port.postMessage({
        type: MessageType.WORKFLOW_STATUS,
        payload: {
          status: 'error',
          error: errorMessage,
          executionId
        },
        id: message.id
      })
    }
  }

  /**
   * Handle RESET_CONVERSATION message
   */
  handleResetConversation(
    message: PortMessage,
    port: chrome.runtime.Port
  ): void {
    const payload = message.payload as ResetPayload
    const executionId = this.resolveExecutionId(payload, port)
    const hadExplicitId = typeof payload.executionId === 'string'

    Logging.log('ExecutionHandler', `Resetting execution ${executionId}`)

    try {
      let reset = this.registry.reset(executionId)

      if (!reset && !hadExplicitId) {
        this.registry.resetAll()
        reset = true
        Logging.log('ExecutionHandler', 'No scoped execution found, reset all active executions', 'warning')
      }

      if (reset) {
        Logging.logMetric('conversation_reset', { executionId })
      }

      port.postMessage({
        type: MessageType.WORKFLOW_STATUS,
        payload: {
          status: 'success',
          message: reset ? 'Conversation reset' : 'No active conversation to reset',
          executionId
        },
        id: message.id
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      Logging.log('ExecutionHandler', `Error resetting execution ${executionId}: ${errorMessage}`, 'error')

      port.postMessage({
        type: MessageType.WORKFLOW_STATUS,
        payload: {
          status: 'error',
          error: errorMessage,
          executionId
        },
        id: message.id
      })
    }
  }

  /**
   * Handle HUMAN_INPUT_RESPONSE message
   */
  handleHumanInputResponse(
    message: PortMessage,
    port: chrome.runtime.Port
  ): void {
    const payload = message.payload as HumanInputResponsePayload
    const candidateId = typeof payload.executionId === 'string' && payload.executionId.trim().length > 0
      ? payload.executionId.trim()
      : DEFAULT_EXECUTION_ID

    const channelId = this.registry.has(candidateId) || PubSub.hasChannel(candidateId)
      ? candidateId
      : DEFAULT_EXECUTION_ID

    const pubsub = PubSub.getChannel(channelId)
    pubsub.publishHumanInputResponse(payload)

    Logging.log('ExecutionHandler', `Forwarded human input response to ${channelId}`)
  }

  /**
   * Handle NEWTAB_EXECUTE_QUERY - message from newtab
   * Opens sidepanel for display and executes directly
   */
  async handleNewtabQuery(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    const { tabId, query, metadata } = message
    const numericTabId = typeof tabId === 'number' ? tabId : undefined

    const syntheticPayload: ExecutionAwarePayload = {
      executionId: metadata?.executionId,
      tabIds: numericTabId !== undefined ? [numericTabId] : undefined,
      metadata
    }
    const executionId = this.resolveExecutionId(syntheticPayload, undefined, tabId)
    const execution = this.registry.getOrCreate(executionId)

    Logging.log('ExecutionHandler',
      `Received query from newtab for tab ${tabId}: "${query}" (execution ${executionId})`)

    Logging.logMetric('query_initiated', {
      query,
      source: metadata?.source || 'newtab',
      mode: 'browse',
      executionId,
      executionMode: metadata?.executionMode || 'dynamic',
      tabId: numericTabId ?? null
    })

    try {
      if (typeof numericTabId === 'number') {
        this.portManager?.updateExecutionForTab(numericTabId, executionId)
        await this.updateSidePanelVisibility(numericTabId, true)
      }

      await this.syncSidePanelVisibility()

      await chrome.sidePanel.open({ tabId })
      await new Promise(resolve => setTimeout(resolve, 200))

      chrome.runtime.sendMessage({
        type: MessageType.EXECUTION_STARTING,
        source: 'newtab',
        executionId
      }).catch(() => {
        // Sidepanel might not be ready yet; ignore
      })

      if (execution.isRunning()) {
        Logging.log('ExecutionHandler', `Cancelling previous task for ${executionId}`)
        execution.cancel()
      }

      execution.updateOptions({
        mode: 'browse',
        tabId: numericTabId,
        tabIds: numericTabId !== undefined ? [numericTabId] : [],
        metadata,
        debug: false
      })

      await this.syncSidePanelVisibility()

      await execution.run(query, metadata)

      sendResponse({ ok: true, executionId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      Logging.log('ExecutionHandler',
        `Failed to handle newtab query for ${executionId}: ${errorMessage}`, 'error')
      sendResponse({ ok: false, error: errorMessage, executionId })
    }
  }

  async handleTabClosed(tabId: number): Promise<void> {
    const candidateIds = new Set<string>()
    const mappedExecutionId = this.portManager?.getExecutionForTab(tabId)
    if (mappedExecutionId) {
      candidateIds.add(mappedExecutionId)
    }
    candidateIds.add(`tab-${tabId}`)

    for (const executionId of candidateIds) {
      if (!executionId) {
        continue
      }

      if (this.registry.has(executionId)) {
        try {
          Logging.log('ExecutionHandler', `Disposing execution ${executionId} after tab ${tabId} closed`)
          await this.registry.dispose(executionId)
          Logging.logMetric('tab_execution_disposed', { tabId, executionId })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          Logging.log('ExecutionHandler', `Failed to dispose execution ${executionId}: ${errorMessage}`, 'warning')
          this.registry.cancel(executionId)
          PubSub.deleteChannel(executionId, true)
        }
      } else if (PubSub.hasChannel(executionId)) {
        Logging.log('ExecutionHandler', `Deleting pubsub channel for orphaned execution ${executionId}`)
        PubSub.deleteChannel(executionId, true)
      }
    }

    this.portManager?.cleanupTabPorts(tabId)
    await this.updateSidePanelVisibility(tabId, false)
    await this.syncSidePanelVisibility()
  }

}






