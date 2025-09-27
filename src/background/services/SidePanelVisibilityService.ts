import { Logging } from '@/lib/utils/Logging'

/**
 * Centralizes side panel visibility so that we only show the agent in tabs
 * where an execution is actively running.
 */
class SidePanelVisibilityService {
  /** Map of tabId -> executionId currently running in that tab */
  private runningByTab = new Map<number, string>()

  /**
   * Mark a tab as running an execution. Enables the side panel and opens it.
   */
  async markRunning(tabId: number | undefined, executionId: string): Promise<void> {
    if (typeof tabId !== 'number' || tabId < 0) {
      Logging.log(
        'SidePanelVisibility',
        `markRunning skipped: invalid tabId for execution ${executionId}`,
        'warning'
      )
      return
    }

    this.runningByTab.set(tabId, executionId)

    try {
      await chrome.sidePanel.setOptions({ tabId, enabled: true })
      await chrome.sidePanel.open({ tabId })
      Logging.log('SidePanelVisibility', `Enabled sidepanel for tab ${tabId} (${executionId})`)
    } catch (error) {
      Logging.log(
        'SidePanelVisibility',
        `Failed to enable sidepanel for tab ${tabId}: ${error instanceof Error ? error.message : error}`,
        'warning'
      )
    }
  }

  /**
   * Mark a tab as no longer running. Disables the side panel for the tab.
   */
  async markStopped(tabId: number | undefined, expectedExecutionId?: string): Promise<void> {
    if (typeof tabId !== 'number' || tabId < 0) {
      Logging.log('SidePanelVisibility', 'markStopped skipped: invalid tabId', 'warning')
      return
    }

    // Only clear if the execution matches (or no expectation provided).
    const current = this.runningByTab.get(tabId)
    if (expectedExecutionId && current && current !== expectedExecutionId) {
      Logging.log(
        'SidePanelVisibility',
        `markStopped ignored for tab ${tabId}: execution mismatch (${expectedExecutionId} != ${current})`,
        'info'
      )
      return
    }

    this.runningByTab.delete(tabId)

    try {
      await chrome.sidePanel.setOptions({ tabId, enabled: false })
      Logging.log('SidePanelVisibility', `Disabled sidepanel for tab ${tabId}`)
    } catch (error) {
      Logging.log(
        'SidePanelVisibility',
        `Failed to disable sidepanel for tab ${tabId}: ${error instanceof Error ? error.message : error}`,
        'warning'
      )
    }
  }

  /**
   * Ensure the sidepanel enablement matches the running executions in a window.
   */
  async syncWindow(windowId: number): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ windowId })
      await Promise.all(
        tabs.map(async (tab) => {
          if (tab.id === undefined) return
          const isRunning = this.runningByTab.has(tab.id)
          try {
            await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: isRunning })
          } catch (error) {
            Logging.log(
              'SidePanelVisibility',
              `syncWindow failed for tab ${tab.id}: ${error instanceof Error ? error.message : error}`,
              'warning'
            )
          }
        })
      )
    } catch (error) {
      Logging.log(
        'SidePanelVisibility',
        `syncWindow failed for window ${windowId}: ${error instanceof Error ? error.message : error}`,
        'warning'
      )
    }
  }

  /**
   * Cleanup when a tab is removed.
   */
  removeTab(tabId: number): void {
    this.runningByTab.delete(tabId)
  }

  /**
   * Debug helper: get executionId for a tab.
   */
  getExecutionForTab(tabId: number): string | undefined {
    return this.runningByTab.get(tabId)
  }
  /**
   * Find the tab currently running the specified execution, if any.
   */
  findTabForExecution(executionId: string): number | undefined {
    for (const [tabId, mappedExecution] of this.runningByTab.entries()) {
      if (mappedExecution === executionId) {
        return tabId
      }
    }
    return undefined
  }
}

export const sidePanelVisibilityService = new SidePanelVisibilityService()

