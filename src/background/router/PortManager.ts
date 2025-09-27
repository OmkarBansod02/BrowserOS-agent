import { Logging } from '@/lib/utils/Logging'
import { MessageType } from '@/lib/types/messaging'
import { PubSub } from '@/lib/pubsub'
import { Subscription } from '@/lib/pubsub/types'

const DEFAULT_EXECUTION_ID = 'main'

interface PortInfo {
  port: chrome.runtime.Port
  executionId: string
  tabId?: number
  windowId?: number
  connectedAt: number
  subscription?: Subscription
}

/**
 * Port manager capable of handling multiple sidepanel instances.
 * Each port can subscribe to a distinct PubSub channel based on executionId.
 */
export class PortManager {
  private readonly ports = new Map<chrome.runtime.Port, PortInfo>()
  private readonly tabExecution = new Map<number, string>()


  /**
   * Register a new port connection.
   */
  async registerPort(port: chrome.runtime.Port): Promise<PortInfo> {
    const metadata = this.parsePortMetadata(port.name)
    const nameTabId = metadata.tabId
    const senderTabId = port.sender?.tab?.id
    const resolvedTabId = typeof nameTabId === 'number' ? nameTabId : senderTabId
    let windowId = port.sender?.tab?.windowId

    // For sidepanel ports, we need to determine the window ID
    if (port.name.startsWith('sidepanel') && !windowId) {
      try {
        // Get the current active tab to determine window context
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (activeTab?.windowId) {
          windowId = activeTab.windowId
        }
      } catch (error) {
        Logging.log('PortManager', `Failed to get window ID for sidepanel: ${error}`, 'warning')
      }
    }

    const inferredExecutionId = metadata.executionId ??
      (typeof resolvedTabId === 'number' ? this.buildExecutionIdFromTab(resolvedTabId) : DEFAULT_EXECUTION_ID)

    const info: PortInfo = {
      port,
      executionId: inferredExecutionId,
      tabId: resolvedTabId,
      windowId,
      connectedAt: Date.now()
    }

    this.ports.set(port, info)

    if (typeof resolvedTabId === 'number') {
      this.tabExecution.set(resolvedTabId, inferredExecutionId)
    }

    // For sidepanel, find the active tab in its window and subscribe to its execution
    if (port.name.startsWith('sidepanel') && windowId) {
      try {
        const tabs = await chrome.tabs.query({ active: true, windowId })
        if (tabs.length > 0 && tabs[0].id) {
          const activeTabId = tabs[0].id
          const activeExecution = this.tabExecution.get(activeTabId)
          if (activeExecution) {
            // Active tab has a running execution
            info.tabId = activeTabId
            info.executionId = activeExecution
            this.subscribeToChannel(info, activeExecution)
          } else {
            // Active tab has no execution - don't subscribe to any channel
            info.tabId = activeTabId
            info.executionId = DEFAULT_EXECUTION_ID
            // Don't subscribe to any channel - the sidepanel should remain empty
            Logging.log('PortManager', `Sidepanel connected but active tab ${activeTabId} has no execution`)
          }
        } else {
          // No active tab found - shouldn't happen but handle gracefully
          info.executionId = DEFAULT_EXECUTION_ID
          Logging.log('PortManager', `Sidepanel connected but no active tab found in window ${windowId}`)
        }
      } catch (error) {
        Logging.log('PortManager', `Failed to get active tab for sidepanel: ${error}`, 'warning')
        info.executionId = DEFAULT_EXECUTION_ID
      }
    } else if (!port.name.startsWith('sidepanel')) {
      // Non-sidepanel ports get subscribed to their inferred execution
      this.subscribeToChannel(info, inferredExecutionId)
    }

    this.notifyExecutionContext(info)

    Logging.log('PortManager', `Registered port ${port.name} (exec: ${info.executionId}, window: ${windowId})`)
    return info
  }

  /**
   * Update the execution channel associated with a port.
   */
  setPortExecution(port: chrome.runtime.Port, executionId: string, tabId?: number): void {
    const info = this.ports.get(port)
    if (!info) {
      Logging.log('PortManager', 'Attempted to update execution for unknown port', 'warning')
      return
    }

    if (typeof tabId === 'number') {
      info.tabId = tabId
    } else if (info.tabId === undefined) {
      const derivedTabId = this.parsePortMetadata(port.name).tabId ?? port.sender?.tab?.id
      if (typeof derivedTabId === 'number') {
        info.tabId = derivedTabId
      }
    }

    if (typeof info.tabId === 'number') {
      this.tabExecution.set(info.tabId, executionId)
    }

    const needsResubscribe = info.executionId !== executionId || !info.subscription

    if (needsResubscribe) {
      this.subscribeToChannel(info, executionId)
      Logging.log('PortManager', `Updated port ${port.name} -> execution ${executionId}`)
      return
    }

    // Even if we're already subscribed, make sure the sidepanel knows the latest context
    this.notifyExecutionContext(info)
  }

  /**
   * Unregister a port (on disconnect).
   */
  unregisterPort(port: chrome.runtime.Port): void {
    const info = this.ports.get(port)
    if (!info) {
      return
    }

    if (info.subscription) {
      info.subscription.unsubscribe()
      info.subscription = undefined
    }

    this.ports.delete(port)

    if (typeof info.tabId === 'number') {
      const stillTracked = Array.from(this.ports.values()).some(candidate => candidate.tabId === info.tabId)
      if (!stillTracked) {
        this.tabExecution.delete(info.tabId)
      }
    }

    Logging.log('PortManager', `Unregistered port ${port.name} (exec: ${info.executionId})`)
  }

  /**
   * Clean up all ports (e.g., on shutdown).
   */
  cleanup(): void {
    for (const info of this.ports.values()) {
      if (info.subscription) {
        info.subscription.unsubscribe()
      }
    }
    this.ports.clear()
    this.tabExecution.clear()
  }

  getPortInfo(port: chrome.runtime.Port): PortInfo | undefined {
    return this.ports.get(port)
  }

  getExecutionForTab(tabId: number): string | undefined {
    return this.tabExecution.get(tabId)
  }

  /**
   * Set the execution for a specific tab (without requiring a port)
   */
  setTabExecution(tabId: number, executionId: string): void {
    this.tabExecution.set(tabId, executionId)
    Logging.log('PortManager', `Set tab ${tabId} -> execution ${executionId}`)
  }

  getTrackedTabs(): number[] {
    return Array.from(this.tabExecution.keys())
  }

  cleanupTabPorts(tabId: number): void {
    Logging.log('PortManager', `Cleaning up ports for tab ${tabId}`)
    this.tabExecution.delete(tabId)

    for (const [port, info] of Array.from(this.ports.entries())) {
      if (info.tabId !== tabId) {
        continue
      }

      if (info.subscription) {
        info.subscription.unsubscribe()
        info.subscription = undefined
      }

      this.ports.delete(port)

      try {
        port.disconnect()
      } catch (error) {
        Logging.log('PortManager', `Failed to disconnect port ${port.name} during cleanup: ${error}`, 'warning')
      }
    }
  }

  /**
   * @deprecated Use notifyWindowSidePanels instead for proper window-scoped updates
   */
  updateExecutionForTab(tabId: number, executionId: string): void {
    // This method is deprecated - use notifyWindowSidePanels for correct behavior
    Logging.log('PortManager', `DEPRECATED: updateExecutionForTab called for tab ${tabId}`, 'warning')

    // Store the tab execution mapping
    this.tabExecution.set(tabId, executionId)

    // Only update ports that are explicitly associated with this tab (not sidepanel ports)
    for (const info of this.ports.values()) {
      if (info.tabId === tabId && !info.port.name.startsWith('sidepanel')) {
        this.subscribeToChannel(info, executionId)
      }
    }
  }

  /**
   * Debug method to log current port state
   */
  private debugPortState(): void {
    Logging.log('PortManager', 'Current port state:')
    for (const info of this.ports.values()) {
      Logging.log('PortManager', `  Port: ${info.port.name}, TabId: ${info.tabId}, ExecutionId: ${info.executionId}`)
    }
  }

  /**
   * Subscribe a port to the specified execution channel.
   */
  private subscribeToChannel(info: PortInfo, executionId: string): void {
    // Unsubscribe from previous channel if different
    if (info.subscription && info.executionId !== executionId) {
      Logging.log('PortManager', `Unsubscribing port ${info.port.name} from execution ${info.executionId}`)
      info.subscription.unsubscribe()
      info.subscription = undefined
    }

    // Update execution ID
    const previousExecutionId = info.executionId
    info.executionId = executionId

    if (typeof info.tabId === 'number') {
      this.tabExecution.set(info.tabId, executionId)
    }

    // Subscribe to new channel if not already subscribed
    if (!info.subscription || previousExecutionId !== executionId) {
      const channel = PubSub.getChannel(executionId)
      info.subscription = channel.subscribe((event) => {
        try {
          info.port.postMessage({
            type: MessageType.AGENT_STREAM_UPDATE,
            payload: {
              executionId,
              event
            }
          })
        } catch (error) {
          Logging.log('PortManager', `Failed to forward event to ${executionId}: ${error}`, 'warning')
        }
      })
      Logging.log('PortManager', `Subscribed port ${info.port.name} to execution ${executionId}`)
    }

    this.notifyExecutionContext(info)
  }

  private parsePortMetadata(name: string): { tabId?: number; executionId?: string } {
    if (!name || !name.startsWith('sidepanel')) {
      return {}
    }

    const segments = name.split('|').slice(1)
    let tabId: number | undefined
    let executionId: string | undefined

    for (const segment of segments) {
      if (!segment) {
        continue
      }
      if (segment.startsWith('tab-')) {
        const candidate = Number(segment.slice(4))
        if (Number.isFinite(candidate)) {
          tabId = candidate
        }
        continue
      }
      if (segment.startsWith('exec-')) {
        executionId = segment.slice(5) || undefined
        continue
      }
      if (!executionId) {
        executionId = segment
      }
    }

    return { tabId, executionId }
  }

  private buildExecutionIdFromTab(tabId: number): string {
    return `tab-${tabId}`
  }

  notifyExecutionContextForTab(tabId: number, executionId: string | null): void {
    for (const info of this.ports.values()) {
      if (info.tabId !== tabId) {
        continue
      }

      if (executionId === null) {
        if (info.subscription) {
          info.subscription.unsubscribe()
          info.subscription = undefined
        }
        info.executionId = DEFAULT_EXECUTION_ID
      } else {
        info.executionId = executionId
      }

      this.notifyExecutionContext(info, executionId)
    }

    if (executionId === null) {
      this.tabExecution.delete(tabId)
    } else {
      this.tabExecution.set(tabId, executionId)
    }
  }

  /**
   * Notify all sidepanel ports in a specific window about the active tab's execution.
   * IMPORTANT: Chrome sidepanel is window-level, so we need to update ALL sidepanels
   * in the window to show the active tab's content.
   */
  notifyWindowSidePanels(windowId: number, activeTabId: number, executionId: string | null): void {
    let updatedCount = 0;

    for (const info of this.ports.values()) {
      // Only update sidepanel ports in the target window
      const isSidepanelPort = info.port.name.startsWith('sidepanel');
      const isInTargetWindow = info.windowId === windowId;

      if (!isSidepanelPort || !isInTargetWindow) {
        continue;
      }

      // CRITICAL: Update the sidepanel to track the active tab
      // Since Chrome has only ONE sidepanel per window, we need to switch its context
      info.tabId = activeTabId;

      if (executionId === null) {
        // No execution in the active tab - unsubscribe and clear
        if (info.subscription) {
          info.subscription.unsubscribe();
          info.subscription = undefined;
        }
        info.executionId = DEFAULT_EXECUTION_ID;
        this.notifyExecutionContext(info, null, activeTabId);
      } else {
        // Subscribe to the active tab's execution
        // Always resubscribe to ensure proper channel binding
        this.subscribeToChannel(info, executionId);
      }

      updatedCount++;
    }

    // Update tab execution mapping
    if (executionId !== null) {
      this.tabExecution.set(activeTabId, executionId);
    } else {
      this.tabExecution.delete(activeTabId);
    }

    Logging.log(
      'PortManager',
      `Updated ${updatedCount} sidepanel port(s) in window ${windowId} to track tab ${activeTabId} with execution ${executionId || 'none'}`
    );
  }

  private notifyExecutionContext(info: PortInfo, executionIdOverride: string | null | undefined = undefined, tabIdOverride?: number): void {
    if (!info.port.name.startsWith('sidepanel')) {
      return
    }

    const executionId = executionIdOverride !== undefined ? executionIdOverride : info.executionId

    try {
      const contextPayload = {
        executionId,
        tabId: tabIdOverride ?? info.tabId ?? null
      }
      Logging.log('PortManager', `Sending EXECUTION_CONTEXT to ${info.port.name}: ${JSON.stringify(contextPayload)}`)

      info.port.postMessage({
        type: MessageType.EXECUTION_CONTEXT,
        payload: contextPayload
      })
    } catch (error) {
      Logging.log('PortManager', `Failed to notify execution context: ${error}`, 'warning')
    }
  }
}
