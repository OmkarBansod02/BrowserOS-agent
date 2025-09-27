import { MessageType } from '@/lib/types/messaging'
import { PortMessage } from '@/lib/runtime/PortMessaging'
import { Logging } from '@/lib/utils/Logging'
import { isDevelopmentMode } from '@/config'

// Import router and managers
import { MessageRouter } from './router/MessageRouter'
import { PortManager } from './router/PortManager'
import { sidePanelVisibilityService } from './services/SidePanelVisibilityService'

// Import handlers
import { ExecutionHandler } from './handlers/ExecutionHandler'
import { ProvidersHandler } from './handlers/ProvidersHandler'
import { MCPHandler } from './handlers/MCPHandler'
import { PlanHandler } from './handlers/PlanHandler'

/**
 * Background script for the Nxtscape extension
 * 
 * This is now a thin orchestration layer that:
 * 1. Sets up message routing
 * 2. Registers handlers for different message types
 * 3. Manages port connections
 */

// Initialize logging
Logging.initialize({ debugMode: isDevelopmentMode() })

// Create router and port manager
const messageRouter = new MessageRouter()
const portManager = new PortManager()

// Create handler instances
const executionHandler = new ExecutionHandler(portManager)
const providersHandler = new ProvidersHandler()
const mcpHandler = new MCPHandler()
const planHandler = new PlanHandler()

// Panel state tracking at window level (Chrome limitation)
type PanelState = {
  isOpen: boolean
  isToggling: boolean
  lastActiveTabId?: number  // Track last active tab in window
}

// Track panel state per window instead of per tab
const windowPanelStates = new Map<number, PanelState>()
// Also keep tab states for fallback
const tabPanelStates = new Map<number, PanelState>()

function ensureWindowPanelState(windowId: number): PanelState {
  let state = windowPanelStates.get(windowId)
  if (!state) {
    state = { isOpen: false, isToggling: false }
    windowPanelStates.set(windowId, state)
  }
  return state
}

function ensureTabPanelState(tabId: number): PanelState {
  let state = tabPanelStates.get(tabId)
  if (!state) {
    state = { isOpen: false, isToggling: false }
    tabPanelStates.set(tabId, state)
  }
  return state
}

/**
 * Register all message handlers with the router
 */
function registerHandlers(): void {
  // Execution handlers
  messageRouter.registerHandler(
    MessageType.EXECUTE_QUERY,
    (msg, port) => executionHandler.handleExecuteQuery(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.CANCEL_TASK,
    (msg, port) => executionHandler.handleCancelTask(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.RESET_CONVERSATION,
    (msg, port) => executionHandler.handleResetConversation(msg, port)
  )

  messageRouter.registerHandler(
    MessageType.HUMAN_INPUT_RESPONSE,
    (msg, port) => executionHandler.handleHumanInputResponse(msg, port)
  )
  
  // Provider handlers
  messageRouter.registerHandler(
    MessageType.GET_LLM_PROVIDERS,
    (msg, port) => providersHandler.handleGetProviders(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.SAVE_LLM_PROVIDERS,
    (msg, port) => providersHandler.handleSaveProviders(msg, port)
  )
  
  // MCP handlers
  messageRouter.registerHandler(
    MessageType.GET_MCP_SERVERS,
    (msg, port) => mcpHandler.handleGetMCPServers(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.CONNECT_MCP_SERVER,
    (msg, port) => mcpHandler.handleConnectMCPServer(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.DISCONNECT_MCP_SERVER,
    (msg, port) => mcpHandler.handleDisconnectMCPServer(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.CALL_MCP_TOOL,
    (msg, port) => mcpHandler.handleCallMCPTool(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.MCP_INSTALL_SERVER,
    (msg, port) => mcpHandler.handleInstallServer(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.MCP_DELETE_SERVER,
    (msg, port) => mcpHandler.handleDeleteServer(msg, port)
  )
  
  messageRouter.registerHandler(
    MessageType.MCP_GET_INSTALLED_SERVERS,
    (msg, port) => mcpHandler.handleGetInstalledServers(msg, port)
  )
  
  
  // Plan generation handlers (for AI plan generation in newtab)
  messageRouter.registerHandler(
    MessageType.GENERATE_PLAN,
    (msg, port) => planHandler.handleGeneratePlan(msg, port)
  )

  messageRouter.registerHandler(
    MessageType.REFINE_PLAN,
    (msg, port) => planHandler.handleRefinePlan(msg, port)
  )
  
  // Log handler
  messageRouter.registerHandler(
    MessageType.LOG_MESSAGE,
    (msg, port) => {
      const logMsg = msg.payload as any
      Logging.log(logMsg.source || 'Unknown', logMsg.message, logMsg.level || 'info')
    }
  )
  
  // Metrics handler
  messageRouter.registerHandler(
    MessageType.LOG_METRIC,
    (msg, port) => {
      const { event, properties } = msg.payload as any
      Logging.logMetric(event, properties)
    }
  )
  
  // Heartbeat handler - acknowledge heartbeats to keep connection alive
  messageRouter.registerHandler(
    MessageType.HEARTBEAT,
    (msg, port) => {
      // Send heartbeat acknowledgment back
      port.postMessage({
        type: MessageType.HEARTBEAT_ACK,
        payload: { timestamp: Date.now() },
        id: msg.id
      })
    }
  )

  // Handle sync request from sidepanel
  messageRouter.registerHandler(
    MessageType.SYNC_REQUEST,
    async (msg, port) => {
      const portInfo = portManager.getPortInfo(port)
      if (portInfo) {
        // For sidepanel ports, ensure we have the correct active tab context
        if (port.name.startsWith('sidepanel') && portInfo.windowId) {
          try {
            const tabs = await chrome.tabs.query({ active: true, windowId: portInfo.windowId })
            if (tabs.length > 0 && tabs[0].id) {
              const activeTabId = tabs[0].id
              const activeExecution = portManager.getExecutionForTab(activeTabId) ||
                                     sidePanelVisibilityService.getExecutionForTab(activeTabId)

              // Update port info with current active tab context
              portInfo.tabId = activeTabId
              if (activeExecution) {
                portInfo.executionId = activeExecution
              }

              // Send the execution context (null is OK - UI will handle it)
              port.postMessage({
                type: MessageType.EXECUTION_CONTEXT,
                payload: {
                  executionId: activeExecution || null,
                  tabId: activeTabId
                },
                id: msg.id
              })

              Logging.log('Background', `SYNC_REQUEST: Sent context for tab ${activeTabId}, execution: ${activeExecution || 'none'}`)
              return
            }
          } catch (error) {
            Logging.log('Background', `SYNC_REQUEST: Failed to get active tab: ${error}`, 'warning')
          }
        }

        // Fallback: send the current port info
        port.postMessage({
          type: MessageType.EXECUTION_CONTEXT,
          payload: {
            executionId: portInfo.executionId === 'main' ? null : portInfo.executionId,
            tabId: portInfo.tabId
          },
          id: msg.id
        })
        Logging.log('Background', `Processed SYNC_REQUEST for port ${port.name}`)
      }
    }
  )
  
  // Panel close handler
  messageRouter.registerHandler(
    MessageType.CLOSE_PANEL,
    async (msg, port) => {
      try {
        const portInfo = portManager.getPortInfo(port)
        const tabId = portInfo?.tabId

        if (typeof tabId === 'number') {
          await chrome.sidePanel.setOptions({ tabId, enabled: false })
          tabPanelStates.delete(tabId)

          // Update window state
          try {
            const tab = await chrome.tabs.get(tabId)
            if (tab.windowId) {
              const windowState = windowPanelStates.get(tab.windowId)
              if (windowState && windowState.lastActiveTabId === tabId) {
                windowState.isOpen = false
              }
            }
          } catch (e) {}

          Logging.log('Background', `Side panel closed for tab ${tabId}`)
          Logging.logMetric('side_panel_closed', { source: 'close_message', tabId })
        } else {
          Logging.log('Background', 'Side panel close requested but tab is unknown', 'warning')
          Logging.logMetric('side_panel_closed', { source: 'close_message', tabId: 'unknown' })
        }

        port.postMessage({
          type: MessageType.WORKFLOW_STATUS,
          payload: {
            status: 'success',
            message: 'Panel closing',
            tabId
          },
          id: msg.id
        })
      } catch (error) {
        Logging.log('Background', `Error closing panel: ${error}`, 'error')
      }
    }
  )
  
  Logging.log('Background', 'All message handlers registered')
}

/**
 * Handle port connections
 */
async function handlePortConnection(port: chrome.runtime.Port): Promise<void> {
  const portInfo = await portManager.registerPort(port)
  
  // Handle sidepanel connections
  if (port.name.startsWith('sidepanel')) {
    if (typeof portInfo.tabId === 'number') {
      const tabState = ensureTabPanelState(portInfo.tabId)
      tabState.isOpen = true
      tabState.isToggling = false

      // Also update window state if possible
      chrome.tabs.get(portInfo.tabId).then(tab => {
        if (tab.windowId) {
          const windowState = ensureWindowPanelState(tab.windowId)
          windowState.isOpen = true
          windowState.lastActiveTabId = portInfo.tabId
        }
      }).catch(() => {})

      Logging.log('Background', `Side panel connected for tab ${portInfo.tabId}`)
      Logging.logMetric('side_panel_opened', { source: 'port_connection', tabId: portInfo.tabId })
    } else {
      Logging.log('Background', 'Side panel connected (tab unknown)')
      Logging.logMetric('side_panel_opened', { source: 'port_connection', tabId: 'unknown' })
    }
  }
  
  // Register with logging system
  Logging.registerPort(port.name, port)
  
  // Set up message listener
  port.onMessage.addListener((message: PortMessage) => {
    messageRouter.routeMessage(message, port)
  })
  
  // Set up disconnect listener
  port.onDisconnect.addListener(() => {
    const existingInfo = portManager.getPortInfo(port)
    portManager.unregisterPort(port)

    if (port.name.startsWith('sidepanel')) {
      if (existingInfo?.tabId !== undefined) {
        tabPanelStates.delete(existingInfo.tabId)

        // Update window state if this was the last active tab
        chrome.tabs.get(existingInfo.tabId).then(tab => {
          if (tab.windowId) {
            const windowState = windowPanelStates.get(tab.windowId)
            if (windowState && windowState.lastActiveTabId === existingInfo.tabId) {
              windowState.isOpen = false
            }
          }
        }).catch(() => {})

        Logging.log('Background', `Side panel disconnected for tab ${existingInfo.tabId}`)
        Logging.logMetric('side_panel_closed', { source: 'port_disconnection', tabId: existingInfo.tabId })
      } else {
        Logging.log('Background', 'Side panel disconnected (tab unknown)')
        Logging.logMetric('side_panel_closed', { source: 'port_disconnection', tabId: 'unknown' })
      }
    }

    Logging.unregisterPort(port.name)
  })
}

/**
 * Toggle the side panel
 */
/**
 * Notify sidepanel of the currently active tab
 */
async function notifySidePanelOfActiveTab(tabId: number, windowId?: number): Promise<void> {
  try {
    // Get execution for the newly active tab
    const executionId = sidePanelVisibilityService.getExecutionForTab(tabId)
      ?? portManager.getExecutionForTab(tabId);

    // If no windowId provided, get it from the tab
    let targetWindowId = windowId;
    if (!targetWindowId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        targetWindowId = tab.windowId;
      } catch (error) {
        Logging.log('Background', `Failed to get window ID for tab ${tabId}: ${error}`, 'error');
        return;
      }
    }

    if (!executionId) {
      Logging.log('Background', `No running execution for active tab ${tabId}, clearing context`, 'info');
      // Notify sidepanel ports for this window to clear their context
      portManager.notifyWindowSidePanels(targetWindowId, tabId, null);
      return;
    }

    Logging.log('Background', `Tab switch detected: tabId=${tabId}, windowId=${targetWindowId}, executionId=${executionId}`);

    // Update only the sidepanel ports for this specific window
    portManager.notifyWindowSidePanels(targetWindowId, tabId, executionId);

    Logging.log('Background', `Updated sidepanel context for tab ${tabId} in window ${targetWindowId} with executionId ${executionId}`);
  } catch (error) {
    Logging.log('Background', `Error notifying sidepanel of active tab: ${error}`, 'error');
  }
}

async function toggleSidePanel(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.windowId) {
      Logging.log('Background', `No window ID for tab ${tabId}`, 'error')
      return
    }

    // Track both window and tab state
    const windowState = ensureWindowPanelState(tab.windowId)
    const tabState = ensureTabPanelState(tabId)

    if (windowState.isToggling) return
    windowState.isToggling = true

    try {
      // Note: Chrome's sidePanel behavior is window-centric
      // Setting per-tab options has limitations
      if (windowState.isOpen) {
        // Try to close for specific tab first
        try {
          await chrome.sidePanel.setOptions({ tabId, enabled: false })
          tabState.isOpen = false
        } catch (e) {
          // Fall back to window-level if tab-specific fails
          Logging.log('Background', `Tab-specific close failed, using window approach: ${e}`, 'warning')
        }
        windowState.isOpen = false
        Logging.log('Background', `Panel toggled off for window ${tab.windowId} (tab ${tabId})`)
      } else {
        // Enable and open for the tab
        await chrome.sidePanel.setOptions({ tabId, enabled: true })
        await chrome.sidePanel.open({ tabId })
        windowState.isOpen = true
        tabState.isOpen = true
        windowState.lastActiveTabId = tabId
        Logging.log('Background', `Panel toggled on for window ${tab.windowId} (tab ${tabId})`)
        Logging.logMetric('side_panel_toggled', { tabId, windowId: tab.windowId })
      }
    } catch (error) {
      Logging.log('Background', `Error toggling side panel: ${error}`, 'error')

      // Fallback to window-level operation
      if (!windowState.isOpen) {
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId })
          windowState.isOpen = true
          windowState.lastActiveTabId = tabId
          Logging.log('Background', `Fallback opened panel for window ${tab.windowId}`)
        } catch (fallbackError) {
          Logging.log('Background', `Fallback failed: ${fallbackError}`, 'error')
        }
      }
    } finally {
      setTimeout(() => {
        windowState.isToggling = false
      }, 300)
    }
  } catch (error) {
    Logging.log('Background', `Failed to get tab info for ${tabId}: ${error}`, 'error')
  }
}

/**
 * Initialize the extension
 */
function initialize(): void {
  Logging.log('Background', 'Nxtscape extension initializing')
  Logging.logMetric('extension_initialized')
  
  // Register all handlers
  registerHandlers()
  
  // Set up port connection listener
  chrome.runtime.onConnect.addListener(handlePortConnection)
  
  // Set up extension icon click handler
  chrome.action.onClicked.addListener(async (tab) => {
    Logging.log('Background', 'Extension icon clicked')
    if (tab.id) {
      await toggleSidePanel(tab.id)
      // Notify sidepanel of the active tab context
      await notifySidePanelOfActiveTab(tab.id)
    }
  })

  // Listen for tab activation changes
  chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    Logging.log('Background', `Tab activated: ${tabId} in window ${windowId}`)
    // Pass windowId to properly scope the sidepanel update
    await notifySidePanelOfActiveTab(tabId, windowId)
    if (typeof windowId === 'number') {
      await sidePanelVisibilityService.syncWindow(windowId)
    }
  })
  
  // Set up keyboard shortcut handler
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-panel') {
      Logging.log('Background', 'Toggle panel shortcut triggered (Cmd+E/Ctrl+E)')
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.id) {
        await toggleSidePanel(activeTab.id)
        // Notify sidepanel of the active tab context
        await notifySidePanelOfActiveTab(activeTab.id)
      }
    }
  })
  
  // Clean up on tab removal
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabPanelStates.delete(tabId)
    sidePanelVisibilityService.removeTab(tabId)
    Logging.log('Background', `Tab ${tabId} removed`)
    void executionHandler.handleTabClosed(tabId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      Logging.log('Background', `Failed to cleanup tab ${tabId}: ${message}`, 'warning')
    })
  })

  // Clean up window states when windows are closed
  chrome.windows.onRemoved.addListener((windowId) => {
    windowPanelStates.delete(windowId)
    Logging.log('Background', `Window ${windowId} removed`)
  })

  
  // Handle messages from newtab
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'NEWTAB_EXECUTE_QUERY') {
      executionHandler.handleNewtabQuery(message, sendResponse)
      return true  // Keep message channel open for async response
    }
  })
  
  Logging.log('Background', 'Nxtscape extension initialized successfully')
}

// Initialize the extension
initialize()

