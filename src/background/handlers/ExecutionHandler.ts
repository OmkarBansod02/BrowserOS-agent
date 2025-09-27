import { MessageType, ExecuteQueryMessage, CancelTaskMessage, ResetConversationMessage } from '@/lib/types/messaging'
import { PortMessage } from '@/lib/runtime/PortMessaging'
import { Logging } from '@/lib/utils/Logging'
import { PubSub } from '@/lib/pubsub'
import { PortManager } from '../router/PortManager'
import { ExecutionRegistry } from './ExecutionRegistry'
import { sidePanelVisibilityService } from '../services/SidePanelVisibilityService'

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

    let lockedTabId = primaryTabId

    try {
      if (execution.isRunning()) {
        Logging.log('ExecutionHandler', `Cancelling previous task for ${executionId}`)
        execution.cancel()
        // Wait longer to ensure cancellation is fully processed and resources are freed
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      execution.updateOptions({
        mode: chatMode ? 'chat' : 'browse',
        tabId: primaryTabId,
        tabIds: normalizedTabIds,
        metadata,
        debug: false
      })

      lockedTabId = execution.getPrimaryTabId() ?? primaryTabId
      await sidePanelVisibilityService.markRunning(lockedTabId, executionId)

      // CRITICAL: Register the execution with the port manager for the specific tab
      // This ensures the tab-execution mapping is established before notifying sidepanels
      if (typeof lockedTabId === 'number') {
        this.portManager?.setTabExecution(lockedTabId, executionId)

        // Now notify the sidepanel in the correct window about the new execution
        try {
          const tab = await chrome.tabs.get(lockedTabId)
          if (tab.windowId) {
            this.portManager?.notifyWindowSidePanels(tab.windowId, lockedTabId, executionId)
          }
        } catch (error) {
          Logging.log('ExecutionHandler', `Failed to get window for tab ${lockedTabId}: ${error}`, 'warning')
        }
      }

      const shouldFocusTab = Boolean(metadata && (metadata as any).focusTab)
      if (shouldFocusTab && typeof lockedTabId === 'number') {
        try {
          await chrome.tabs.update(lockedTabId, { active: true })
        } catch (error) {
          const focusErrorMessage = error instanceof Error ? error.message : String(error)
          Logging.log('ExecutionHandler', `Failed to focus tab ${lockedTabId}: ${focusErrorMessage}`, 'warning')
        }
      }

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
    } finally {
      const finalTabId = execution.getPrimaryTabId() ?? lockedTabId
      await sidePanelVisibilityService.markStopped(finalTabId, executionId)

      // Notify sidepanel that execution has stopped
      if (typeof finalTabId === 'number') {
        try {
          const tab = await chrome.tabs.get(finalTabId)
          if (tab.windowId) {
            this.portManager?.notifyWindowSidePanels(tab.windowId, finalTabId, null)
          }
        } catch (error) {
          // Tab might have been closed, ignore
        }
      }
    }
  }

  /**
   * Handle CANCEL_TASK message
   */
  async handleCancelTask(
    message: PortMessage,
    port: chrome.runtime.Port
  ): Promise<void> {
    const payload = message.payload as CancelPayload
    const executionId = this.resolveExecutionId(payload, port)

    Logging.log('ExecutionHandler', `Cancelling execution ${executionId}`)

    try {
      const cancelled = this.registry.cancel(executionId)

      if (cancelled) {
        Logging.logMetric('task_cancelled', { executionId })
        const tabForExecution = sidePanelVisibilityService.findTabForExecution(executionId)
        if (typeof tabForExecution === 'number') {
          void sidePanelVisibilityService.markStopped(tabForExecution, executionId)

          // Notify sidepanel that execution has stopped
          try {
            const tab = await chrome.tabs.get(tabForExecution)
            if (tab.windowId) {
              this.portManager?.notifyWindowSidePanels(tab.windowId, tabForExecution, null)
            }
          } catch (error) {
            // Tab might have been closed, ignore
          }
        }
      } else {
        Logging.log('ExecutionHandler', `No active execution to cancel for ${executionId}`)
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
  async handleResetConversation(
    message: PortMessage,
    port: chrome.runtime.Port
  ): Promise<void> {
    const payload = message.payload as ResetPayload
    const executionId = this.resolveExecutionId(payload, port)

    Logging.log('ExecutionHandler', `Resetting execution ${executionId}`)

    try {
      const reset = this.registry.reset(executionId)

      if (reset) {
        Logging.logMetric('conversation_reset', { executionId })
      } else {
        Logging.log('ExecutionHandler', `No active conversation to reset for ${executionId}`)
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

    let lockedTabId = numericTabId

    try {
      // Notify the sidepanel in the correct window about the new execution
      if (typeof numericTabId === 'number') {
        try {
          const tab = await chrome.tabs.get(numericTabId)
          if (tab.windowId) {
            this.portManager?.notifyWindowSidePanels(tab.windowId, numericTabId, executionId)
          }
        } catch (error) {
          Logging.log('ExecutionHandler', `Failed to get window for tab ${numericTabId}: ${error}`, 'warning')
        }
      }

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

      lockedTabId = execution.getPrimaryTabId() ?? numericTabId
      await sidePanelVisibilityService.markRunning(lockedTabId, executionId)

      // CRITICAL: Register the execution with the port manager for the specific tab
      // This ensures the tab-execution mapping is established before notifying sidepanels
      if (typeof lockedTabId === 'number') {
        this.portManager?.setTabExecution(lockedTabId, executionId)
      }

      const shouldFocusTab = Boolean(metadata && (metadata as any).focusTab)
      if (shouldFocusTab && typeof lockedTabId === 'number') {
        try {
          await chrome.tabs.update(lockedTabId, { active: true })
        } catch (focusError) {
          const focusErrorMessage = focusError instanceof Error ? focusError.message : String(focusError)
          Logging.log('ExecutionHandler', `Failed to focus tab ${lockedTabId}: ${focusErrorMessage}`, 'warning')
        }
      }

      await execution.run(query, metadata)

      sendResponse({ ok: true, executionId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      Logging.log('ExecutionHandler',
        `Failed to handle newtab query for ${executionId}: ${errorMessage}`, 'error')
      sendResponse({ ok: false, error: errorMessage, executionId })
    } finally {
      const finalTabId = execution.getPrimaryTabId() ?? lockedTabId
      await sidePanelVisibilityService.markStopped(finalTabId, executionId)

      // Notify sidepanel that execution has stopped
      if (typeof finalTabId === 'number') {
        try {
          const tab = await chrome.tabs.get(finalTabId)
          if (tab.windowId) {
            this.portManager?.notifyWindowSidePanels(tab.windowId, finalTabId, null)
          }
        } catch (error) {
          // Tab might have been closed, ignore
        }
      }
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
    await sidePanelVisibilityService.markStopped(tabId)
    sidePanelVisibilityService.removeTab(tabId)
  }

}






