import { Logging } from '@/lib/utils/Logging'
import { MessageType } from '@/lib/types/messaging'
import { PubSub } from '@/lib/pubsub'
import { Subscription } from '@/lib/pubsub/types'

const DEFAULT_EXECUTION_ID = 'main'

interface PortInfo {
  port: chrome.runtime.Port
  executionId: string
  tabId?: number
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
  registerPort(port: chrome.runtime.Port): PortInfo {
    const metadata = this.parsePortMetadata(port.name)
    const nameTabId = metadata.tabId
    const senderTabId = port.sender?.tab?.id
    const resolvedTabId = typeof nameTabId === 'number' ? nameTabId : senderTabId

    const inferredExecutionId = metadata.executionId ??
      (typeof resolvedTabId === 'number' ? this.buildExecutionIdFromTab(resolvedTabId) : DEFAULT_EXECUTION_ID)

    const info: PortInfo = {
      port,
      executionId: inferredExecutionId,
      tabId: resolvedTabId,
      connectedAt: Date.now()
    }

    this.ports.set(port, info)

    if (typeof resolvedTabId === 'number') {
      this.tabExecution.set(resolvedTabId, inferredExecutionId)
    }

    if (port.name.startsWith('sidepanel')) {
      this.subscribeToChannel(info, inferredExecutionId)
    }

    this.notifyExecutionContext(info)

    Logging.log('PortManager', `Registered port ${port.name} (exec: ${inferredExecutionId})`)
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

  updateExecutionForTab(tabId: number, executionId: string): void {
    let updatedPorts = 0

    for (const info of this.ports.values()) {
      const isSidepanelPort = info.port.name.startsWith('sidepanel')
      const matchesTab = info.tabId === tabId
      const needsAssignment = isSidepanelPort && info.tabId === undefined
      const shouldUpdate = matchesTab || needsAssignment

      if (!shouldUpdate) {
        continue
      }

      Logging.log('PortManager', `Updating port ${info.port.name} to executionId ${executionId}`)
      this.subscribeToChannel(info, executionId)

      if (isSidepanelPort) {
        info.tabId = tabId
      }

      this.tabExecution.set(tabId, executionId)

      updatedPorts++
    }

    Logging.log('PortManager', `Updated ${updatedPorts} port(s) for tab ${tabId} -> execution ${executionId}`)
    this.debugPortState()
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
    if (info.subscription) {
      info.subscription.unsubscribe()
    }

    info.executionId = executionId

    if (typeof info.tabId === 'number') {
      this.tabExecution.set(info.tabId, executionId)
    }

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

  private notifyExecutionContext(info: PortInfo): void {
    if (!info.port.name.startsWith('sidepanel')) {
      return
    }

    try {
      const contextPayload = {
        executionId: info.executionId,
        tabId: info.tabId
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

