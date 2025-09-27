import { Logging } from './Logging'

// Resource limits
const MAX_ACTIVE_TABS = 10
const MAX_CONCURRENT_EXECUTIONS = 5
const WARNING_THRESHOLD_PERCENTAGE = 80  // Warn at 80% of limits

/**
 * ResourceMonitor - Tracks resource usage and prevents crashes
 */
export class ResourceMonitor {
  private static _activeTabs = new Set<number>()
  private static _activeExecutions = new Set<string>()
  private static _lastWarningTime = 0
  private static _warningInterval = 30000  // 30 seconds between warnings

  /**
   * Register an active tab
   */
  public static registerTab(tabId: number): boolean {
    if (this._activeTabs.size >= MAX_ACTIVE_TABS) {
      Logging.log('ResourceMonitor', `Tab limit reached (${MAX_ACTIVE_TABS}). Cannot register tab ${tabId}`, 'error')
      this._warnIfNeeded()
      return false
    }

    this._activeTabs.add(tabId)
    Logging.log('ResourceMonitor', `Registered tab ${tabId}. Active tabs: ${this._activeTabs.size}/${MAX_ACTIVE_TABS}`)

    // Warn if approaching limit
    if (this._activeTabs.size >= MAX_ACTIVE_TABS * WARNING_THRESHOLD_PERCENTAGE / 100) {
      this._warnIfNeeded()
    }

    return true
  }

  /**
   * Unregister a tab
   */
  public static unregisterTab(tabId: number): void {
    if (this._activeTabs.has(tabId)) {
      this._activeTabs.delete(tabId)
      Logging.log('ResourceMonitor', `Unregistered tab ${tabId}. Active tabs: ${this._activeTabs.size}/${MAX_ACTIVE_TABS}`)
    }
  }

  /**
   * Register an active execution
   */
  public static registerExecution(executionId: string): boolean {
    if (this._activeExecutions.size >= MAX_CONCURRENT_EXECUTIONS) {
      Logging.log('ResourceMonitor', `Execution limit reached (${MAX_CONCURRENT_EXECUTIONS}). Cannot register execution ${executionId}`, 'error')
      this._warnIfNeeded()
      return false
    }

    this._activeExecutions.add(executionId)
    Logging.log('ResourceMonitor', `Registered execution ${executionId}. Active executions: ${this._activeExecutions.size}/${MAX_CONCURRENT_EXECUTIONS}`)

    // Warn if approaching limit
    if (this._activeExecutions.size >= MAX_CONCURRENT_EXECUTIONS * WARNING_THRESHOLD_PERCENTAGE / 100) {
      this._warnIfNeeded()
    }

    return true
  }

  /**
   * Unregister an execution
   */
  public static unregisterExecution(executionId: string): void {
    if (this._activeExecutions.has(executionId)) {
      this._activeExecutions.delete(executionId)
      Logging.log('ResourceMonitor', `Unregistered execution ${executionId}. Active executions: ${this._activeExecutions.size}/${MAX_CONCURRENT_EXECUTIONS}`)
    }
  }

  /**
   * Get current resource usage
   */
  public static getResourceUsage(): {
    tabs: { active: number; max: number; percentage: number }
    executions: { active: number; max: number; percentage: number }
    warnings: string[]
  } {
    const tabPercentage = (this._activeTabs.size / MAX_ACTIVE_TABS) * 100
    const executionPercentage = (this._activeExecutions.size / MAX_CONCURRENT_EXECUTIONS) * 100
    const warnings: string[] = []

    if (tabPercentage >= WARNING_THRESHOLD_PERCENTAGE) {
      warnings.push(`Tab usage high: ${this._activeTabs.size}/${MAX_ACTIVE_TABS} (${tabPercentage.toFixed(0)}%)`)
    }

    if (executionPercentage >= WARNING_THRESHOLD_PERCENTAGE) {
      warnings.push(`Execution usage high: ${this._activeExecutions.size}/${MAX_CONCURRENT_EXECUTIONS} (${executionPercentage.toFixed(0)}%)`)
    }

    return {
      tabs: {
        active: this._activeTabs.size,
        max: MAX_ACTIVE_TABS,
        percentage: tabPercentage
      },
      executions: {
        active: this._activeExecutions.size,
        max: MAX_CONCURRENT_EXECUTIONS,
        percentage: executionPercentage
      },
      warnings
    }
  }

  /**
   * Check if resources are available
   */
  public static canAllocateResources(): boolean {
    return (
      this._activeTabs.size < MAX_ACTIVE_TABS &&
      this._activeExecutions.size < MAX_CONCURRENT_EXECUTIONS
    )
  }

  /**
   * Clean up stale resources
   */
  public static async cleanupStaleResources(): Promise<void> {
    try {
      // Check which tabs are still active
      const activeTabs = await chrome.tabs.query({})
      const activeTabIds = new Set(activeTabs.map(t => t.id).filter((id): id is number => id !== undefined))

      // Remove tabs that no longer exist
      const staleTabCount = this._activeTabs.size
      this._activeTabs = new Set(Array.from(this._activeTabs).filter(id => activeTabIds.has(id)))

      if (staleTabCount !== this._activeTabs.size) {
        Logging.log('ResourceMonitor', `Cleaned up ${staleTabCount - this._activeTabs.size} stale tabs`)
      }
    } catch (error) {
      Logging.log('ResourceMonitor', `Error cleaning up stale resources: ${error}`, 'warning')
    }
  }

  /**
   * Reset all tracking
   */
  public static reset(): void {
    this._activeTabs.clear()
    this._activeExecutions.clear()
    Logging.log('ResourceMonitor', 'Reset all resource tracking')
  }

  /**
   * Warn user if needed (rate-limited)
   */
  private static _warnIfNeeded(): void {
    const now = Date.now()
    if (now - this._lastWarningTime < this._warningInterval) {
      return
    }

    this._lastWarningTime = now
    const usage = this.getResourceUsage()

    if (usage.warnings.length > 0) {
      // Log warnings
      for (const warning of usage.warnings) {
        Logging.log('ResourceMonitor', `⚠️ ${warning}`, 'warning')
      }

      // Could also show a notification or update UI here
      console.warn('[ResourceMonitor] High resource usage detected:', usage)
    }
  }

  /**
   * Start periodic cleanup
   */
  public static startPeriodicCleanup(intervalMs: number = 60000): void {
    setInterval(() => {
      this.cleanupStaleResources()
    }, intervalMs)

    Logging.log('ResourceMonitor', `Started periodic cleanup every ${intervalMs}ms`)
  }
}

// Auto-start periodic cleanup
ResourceMonitor.startPeriodicCleanup()