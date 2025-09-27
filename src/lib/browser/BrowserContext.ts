import { z } from 'zod';
import BrowserPage from './BrowserPage';
import { Logging } from '../utils/Logging';
import { profileAsync } from '@/lib/utils/Profiler';
import { ResourceMonitor } from '../utils/ResourceMonitor';

// ============= Browser Context Configuration =============

// Browser context window size schema
export const BrowserContextWindowSizeSchema = z.object({
  width: z.number().int().positive(),  // Window width in pixels
  height: z.number().int().positive()  // Window height in pixels
})

export type BrowserContextWindowSize = z.infer<typeof BrowserContextWindowSizeSchema>

// Browser context configuration schema
export const BrowserContextConfigSchema = z.object({
  maximumWaitPageLoadTime: z.number().default(5.0),  // Maximum time to wait for page load
  waitBetweenActions: z.number().default(0.1),  // Time to wait between multiple actions
  homePageUrl: z.string().default('https://www.google.com')  // Home page url
})

export type BrowserContextConfig = z.infer<typeof BrowserContextConfigSchema>

// Default configuration
export const DEFAULT_BROWSER_CONTEXT_CONFIG: BrowserContextConfig = BrowserContextConfigSchema.parse({})

// Tab info schema
export const TabInfoSchema = z.object({
  id: z.number().int().positive(),  // Tab ID
  url: z.string(),  // Tab URL
  title: z.string()  // Tab title
})

export type TabInfo = z.infer<typeof TabInfoSchema>

// Browser state schema for V2
export const BrowserStateSchema = z.object({
  // Current tab info
  tabId: z.number(),  // Current tab ID
  url: z.string(),  // Current page URL
  title: z.string(),  // Current page title
  
  // All tabs info
  tabs: z.array(TabInfoSchema),  // All open tabs
  
  // Interactive elements as structured data
  clickableElements: z.array(z.object({
    nodeId: z.number(),  // Chrome BrowserOS node ID
    text: z.string(),  // Element text (axName or tag)
    tag: z.string()  // HTML tag name
  })),  // Clickable elements with nodeId, text, and tag
  
  typeableElements: z.array(z.object({
    nodeId: z.number(),  // Chrome BrowserOS node ID
    text: z.string(),  // Element text (axName or tag)
    tag: z.string()  // HTML tag name
  })),  // Typeable elements with nodeId, text, and tag
  
  // Pre-formatted strings for display
  clickableElementsString: z.string(),  // Formatted string of clickable elements
  typeableElementsString: z.string(),  // Formatted string of typeable elements
  
  // Hierarchical structure from BrowserOS API
  hierarchicalStructure: z.string().nullable().optional(),  // Hierarchical text representation with context
})

export type BrowserState = z.infer<typeof BrowserStateSchema>

// Error classes
export class BrowserError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'BrowserError'
  }
}

export class URLNotAllowedError extends BrowserError {
  constructor(message?: string) {
    super(message)
    this.name = 'URLNotAllowedError'
  }
}

/**
 * Simplified BrowserContext that uses BrowserPageV2
 *
 * Key differences from V1:
 * - No Puppeteer dependencies
 * - No tab attachment/detachment logic (pages are always "attached")
 * - Simplified state management
 * - Direct Chrome API usage
 * - Singleton pattern for shared instance across executions
 */
// Cache management constants
const MAX_PAGE_CACHE_SIZE = 20;  // Maximum number of pages to cache
const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes TTL for cached pages
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;  // Clean up cache every minute

export class BrowserContext {
  private static _instance: BrowserContext | null = null;
  private _config: BrowserContextConfig;
  private _userSelectedTabIds: number[] | null = null;
  // REMOVED: private _executionLockedTabId - replaced with per-execution locks
  private _executionLocks: Map<string, number> = new Map();  // executionId -> locked tabId
  private _executionTabMap: Map<string, number> = new Map();  // executionId -> tabId mapping

  // Enhanced page cache with timestamp tracking
  private _pageCache: Map<number, BrowserPage> = new Map();
  private _pageCacheTimestamps: Map<number, number> = new Map();  // tabId -> last access time
  private _cacheCleanupInterval: NodeJS.Timeout | null = null;

  protected constructor(config: Partial<BrowserContextConfig> = {}) {
    this._config = { ...DEFAULT_BROWSER_CONTEXT_CONFIG, ...config };
    this._startCacheCleanupInterval();
  }

  /**
   * Start periodic cache cleanup
   */
  private _startCacheCleanupInterval(): void {
    // Clear any existing interval
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
    }

    // Start new interval
    this._cacheCleanupInterval = setInterval(() => {
      this._cleanupStalePages();
    }, CACHE_CLEANUP_INTERVAL_MS);

    Logging.log('BrowserContext', 'Started cache cleanup interval');
  }

  /**
   * Stop cache cleanup interval
   */
  private _stopCacheCleanupInterval(): void {
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
      this._cacheCleanupInterval = null;
      Logging.log('BrowserContext', 'Stopped cache cleanup interval');
    }
  }

  /**
   * Clean up stale pages from cache
   */
  private async _cleanupStalePages(): Promise<void> {
    const now = Date.now();
    const tabIdsToRemove: number[] = [];

    // Find stale pages
    for (const [tabId, timestamp] of this._pageCacheTimestamps.entries()) {
      if (now - timestamp > PAGE_CACHE_TTL_MS) {
        tabIdsToRemove.push(tabId);
      }
    }

    // Also check if tab still exists
    try {
      const activeTabs = await chrome.tabs.query({});
      const activeTabIds = new Set(activeTabs.map(t => t.id).filter((id): id is number => id !== undefined));

      for (const tabId of this._pageCache.keys()) {
        if (!activeTabIds.has(tabId)) {
          tabIdsToRemove.push(tabId);
        }
      }
    } catch (error) {
      Logging.log('BrowserContext', `Error checking active tabs: ${error}`, 'warning');
    }

    // Remove stale pages
    for (const tabId of tabIdsToRemove) {
      await this._removeCachedPage(tabId);
    }

    if (tabIdsToRemove.length > 0) {
      Logging.log('BrowserContext', `Cleaned up ${tabIdsToRemove.length} stale pages from cache`);
    }

    // Enforce cache size limit
    await this._enforceCacheSizeLimit();
  }

  /**
   * Enforce maximum cache size
   */
  private async _enforceCacheSizeLimit(): Promise<void> {
    if (this._pageCache.size <= MAX_PAGE_CACHE_SIZE) {
      return;
    }

    // Sort by timestamp and remove oldest
    const sortedEntries = Array.from(this._pageCacheTimestamps.entries())
      .sort((a, b) => a[1] - b[1]);

    const toRemove = sortedEntries.slice(0, this._pageCache.size - MAX_PAGE_CACHE_SIZE);

    for (const [tabId] of toRemove) {
      await this._removeCachedPage(tabId);
    }

    Logging.log('BrowserContext', `Enforced cache size limit, removed ${toRemove.length} pages`);
  }

  /**
   * Remove a page from cache and dispose it
   */
  private async _removeCachedPage(tabId: number): Promise<void> {
    const page = this._pageCache.get(tabId);
    if (page) {
      try {
        await page.dispose();
      } catch (error) {
        Logging.log('BrowserContext', `Error disposing page ${tabId}: ${error}`, 'warning');
      }
    }

    this._pageCache.delete(tabId);
    this._pageCacheTimestamps.delete(tabId);

    // Also remove from execution locks if present
    for (const [executionId, lockedTabId] of this._executionLocks.entries()) {
      if (lockedTabId === tabId) {
        this._executionLocks.delete(executionId);
      }
    }

    Logging.log('BrowserContext', `Removed page ${tabId} from cache`);
  }

  /**
   * Get singleton instance of BrowserContext
   */
  public static getInstance(config?: Partial<BrowserContextConfig>): BrowserContext {
    if (!BrowserContext._instance) {
      BrowserContext._instance = new BrowserContext(config);
      Logging.log('BrowserContext', 'Created singleton BrowserContext instance');
    }
    return BrowserContext._instance;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  public static async resetInstance(): Promise<void> {
    if (BrowserContext._instance) {
      // Dispose all cached pages
      for (const page of BrowserContext._instance._pageCache.values()) {
        try {
          await page.dispose();
        } catch (error) {
          Logging.log('BrowserContext', `Error disposing page during reset: ${error}`, 'warning');
        }
      }

      BrowserContext._instance._stopCacheCleanupInterval();
      BrowserContext._instance._pageCache.clear();
      BrowserContext._instance._pageCacheTimestamps.clear();
      BrowserContext._instance._executionTabMap.clear();
      BrowserContext._instance._executionLocks.clear();
      BrowserContext._instance = null;
      Logging.log('BrowserContext', 'Reset singleton BrowserContext instance');
    }
  }

  public getConfig(): BrowserContextConfig {
    return this._config;
  }

  public updateConfig(config: Partial<BrowserContextConfig>): void {
    this._config = { ...this._config, ...config };
  }

  // ============= Core Page Operations =============

  /**
   * Get or create a Page instance for a tab
   */
  private async _getOrCreatePage(tab: chrome.tabs.Tab): Promise<BrowserPage> {
    if (!tab.id) {
      throw new Error('Tab ID is not available');
    }

    // Update timestamp for cache management
    this._pageCacheTimestamps.set(tab.id, Date.now());

    // Check cache
    const existingPage = this._pageCache.get(tab.id);
    if (existingPage) {
      return existingPage;
    }

    // Enforce cache size before adding new page
    await this._enforceCacheSizeLimit();

    // Create new page
    const page = new BrowserPage(tab.id, tab.url || 'Unknown URL', tab.title || 'Unknown Title');
    this._pageCache.set(tab.id, page);
    this._pageCacheTimestamps.set(tab.id, Date.now());

    Logging.log('BrowserContextV2', `Created page for tab ${tab.id} (cache size: ${this._pageCache.size})`);
    return page;
  }

  /**
   * Get the current page
   * @param executionId - Optional execution ID for getting execution-specific page
   */
  public async getCurrentPage(executionId?: string): Promise<BrowserPage> {
    return profileAsync('BrowserContext.getCurrentPage', async () => {
    const targetTab = await this.getTargetTab(executionId);

    if (!targetTab.id) {
      throw new Error('Target tab has no ID');
    }

    const page = await this._getOrCreatePage(targetTab);

    // Note: Locking should be done explicitly by caller with execution ID

    return page;
    });
  }

  // ============= Tab Management =============

  /**
   * Switch to a different tab
   */
  public async switchTab(tabId: number): Promise<BrowserPage> {
    return profileAsync(`BrowserContext.switchTab[${tabId}]`, async () => {
    Logging.log('BrowserContextV2', `Switching to tab ${tabId}`);

    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);

    const page = await this._getOrCreatePage(tab);
    // Note: Locking should be done explicitly by caller with execution ID

    return page;
    });
  }

  /**
   * Get tab information
   */
  public async getTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({});
    const tabInfos: TabInfo[] = [];

    for (const tab of tabs) {
      if (tab.id && tab.url && tab.title) {
        tabInfos.push({
          id: tab.id,
          url: tab.url,
          title: tab.title,
        });
      }
    }
    return tabInfos;
  }

  // ============= Navigation Operations =============

  /**
   * Navigate to a URL
   * @param url - The URL to navigate to
   * @param executionId - Optional execution ID for proper tab isolation
   */
  public async navigateTo(url: string, executionId?: string): Promise<void> {
    const page = await this.getCurrentPage(executionId);
    await page.navigateTo(url);
  }
  
  /**
   * Open a new tab with URL
   */
  public async openTab(url: string): Promise<BrowserPage> {
    return profileAsync('BrowserContext.openTab', async () => {
    // Check resource limits before opening new tab
    if (!ResourceMonitor.canAllocateResources()) {
      throw new Error('Resource limit reached - too many tabs or executions active');
    }

    // Create the new tab
    const tab = await chrome.tabs.create({ url, active: true });
    if (!tab.id) {
      throw new Error('No tab ID available');
    }

    // Register with resource monitor
    ResourceMonitor.registerTab(tab.id);

    // Wait a bit for tab to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get updated tab information
    const updatedTab = await chrome.tabs.get(tab.id);
    const page = await this._getOrCreatePage(updatedTab);
    // Note: Locking should be done explicitly by caller with execution ID

    return page;
    });
  }
  
  /**
   * Close a tab
   */
  public async closeTab(tabId: number): Promise<void> {
    // First properly dispose the page and remove from cache
    await this._removeCachedPage(tabId);

    // Unregister from resource monitor
    ResourceMonitor.unregisterTab(tabId);

    // Close the tab
    try {
      await chrome.tabs.remove(tabId);
    } catch (error) {
      Logging.log('BrowserContext', `Error closing tab ${tabId}: ${error}`, 'warning');
    }

    // Remove from execution locks if any execution was locked to this tab
    for (const [execId, lockedTabId] of this._executionLocks.entries()) {
      if (lockedTabId === tabId) {
        this._executionLocks.delete(execId);
        Logging.log('BrowserContext', `Removed execution lock for ${execId} after closing tab ${tabId}`);
      }
    }

    // Remove from execution map
    for (const [execId, mappedTabId] of this._executionTabMap.entries()) {
      if (mappedTabId === tabId) {
        this._executionTabMap.delete(execId);
      }
    }

    // Remove from user selected tabs if present
    if (this._userSelectedTabIds && this._userSelectedTabIds.includes(tabId)) {
      this._userSelectedTabIds = this._userSelectedTabIds.filter(id => id !== tabId);
    }
  }

  // ============= State Operations =============

  /**
   * Get detailed browser state description for agents
   */
  public async getBrowserStateString(simplified: boolean = false, executionId?: string): Promise<string> {
    return profileAsync('BrowserContext.getBrowserStateString', async () => {
    try {
      // Use the structured getBrowserState API - pass simplified flag
      const browserState = await this.getBrowserState(simplified, executionId);
      
      // Format current tab
      const currentTab = `{id: ${browserState.tabId}, url: ${browserState.url}, title: ${browserState.title}}`;
      
      if (simplified) {
        // SIMPLIFIED FORMAT - minimal output with just interactive elements
        const elements: string[] = [];
        
        // Combine clickable and typeable with clear labels
        if (browserState.clickableElementsString) {
          elements.push('Clickable:\n' + browserState.clickableElementsString);
        }
        if (browserState.typeableElementsString) {
          elements.push('Inputs:\n' + browserState.typeableElementsString);
        }
        
        const elementsText = elements.join('\n\n') || 'No interactive elements found';
        
        return `BROWSER STATE:
Current tab: ${currentTab}

Elements:
${elementsText}`;
        
      } else {
        // FULL FORMAT - existing detailed implementation
        // Format other tabs
        const otherTabs = browserState.tabs
          .filter(tab => tab.id !== browserState.tabId)
          .map(tab => `- {id: ${tab.id}, url: ${tab.url}, title: ${tab.title}}`);

        // Get current date/time
        const timeStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

        // Combine clickable and typeable elements
        let elementsText = '';
        const parts: string[] = [];
        if (browserState.clickableElementsString) {
          parts.push('Clickable elements:\n' + browserState.clickableElementsString);
        }
        if (browserState.typeableElementsString) {
          parts.push('Input fields:\n' + browserState.typeableElementsString);
        }
        elementsText = parts.join('\n\n') || 'No interactive elements found';

        // Build state description
        const stateDescription = `
BROWSER STATE:
Current tab: ${currentTab}
Other available tabs:
  ${otherTabs.join('\n  ')}
Current date and time: ${timeStr}

Interactive elements from the current page (numbers in [brackets] are nodeIds):
${elementsText}
`;

        return stateDescription;
      }
    } catch (error) {
      Logging.log('BrowserContextV2', `Failed to get detailed browser state: ${error}`, 'warning');
      const currentPage = await this.getCurrentPage(executionId);
      const url = await currentPage.url();
      const title = await currentPage.title();
      return `BROWSER STATE:\nCurrent page: ${url} - ${title}`;
    }
    });
  }

  // ============= Multi-Tab Operations =============

  /**
   * Get pages for specific tab IDs
   */
  public async getPages(tabIds?: number[], executionId?: string): Promise<BrowserPage[]> {
    try {
      // If no tab IDs provided, return current page
      if (!tabIds || tabIds.length === 0) {
        const currentPage = await this.getCurrentPage(executionId);
        return [currentPage];
      }

      // Get pages for specified tabs
      const pages: BrowserPage[] = [];
      
      for (const tabId of tabIds) {
        try {
          const tab = await chrome.tabs.get(tabId);
          const page = await this._getOrCreatePage(tab);
          pages.push(page);
        } catch (error) {
          Logging.log('BrowserContextV2', `Failed to get page for tab ${tabId}: ${error}`, 'warning');
        }
      }
      
      if (pages.length === 0) {
        throw new Error(`Failed to get any of the selected tabs (${tabIds.join(', ')})`);
      }
      
      return pages;
    } catch (error) {
      Logging.log('BrowserContextV2', `Error getting pages: ${error}`, 'error');
      return [];
    }
  }

  /**
   * Get all tab IDs from the current window
   */
  public async getAllTabIds(): Promise<Set<number>> {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return new Set(tabs.map(tab => tab.id).filter((id): id is number => id !== undefined));
    } catch (error) {
      Logging.log('BrowserContextV2', `Failed to get tab IDs: ${error}`, 'warning');
      return new Set();
    }
  }

  // ============= Execution Lock Management =============

  /**
   * Get the active tab with fallback logic
   * @param allowCreate - Whether to create a new tab if none exist (default: true)
   */
  private async _getActiveTab(allowCreate: boolean = true): Promise<chrome.tabs.Tab> {
    let activeTab: chrome.tabs.Tab | undefined;

    // First: Try to get the active tab from the current window
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // If no active tab in current window, try the last active (focused) window
    if (!activeTab?.id) {
      const windows = await chrome.windows.getAll({ populate: false });
      const lastActiveWindow = windows.find(w => w.focused) || windows.find(w => w.state === 'normal');

      if (lastActiveWindow) {
        [activeTab] = await chrome.tabs.query({ active: true, windowId: lastActiveWindow.id });
      }
    }

    // If still no active tab (or it's inaccessible), get any tab from the current window
    if (!activeTab?.id) {
      const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
      activeTab = currentWindowTabs[0]; // Just take the first tab, even if it's chrome://
    }

    // Last resort: get any tab from any window
    if (!activeTab?.id) {
      const allTabs = await chrome.tabs.query({});
      activeTab = allTabs[0];
    }

    // CRITICAL FIX: Only create new tab if explicitly allowed
    // This prevents unwanted tab creation during execution context operations
    if (!activeTab?.id) {
      if (allowCreate) {
        Logging.log('BrowserContextV2', 'No existing tabs found, creating a new tab');
        activeTab = await chrome.tabs.create({ url: this._config.homePageUrl, active: true });
      } else {
        throw new Error('No tabs available and tab creation is not allowed in this context');
      }
    }

    if (!activeTab?.id) {
      throw new Error('Unable to find or create a tab');
    }

    return activeTab;
  }

  /**
   * Get the target tab for operations
   */
  private async getTargetTab(executionId?: string): Promise<chrome.tabs.Tab> {
    // FIRST: Check if we have a locked tab for this execution
    if (executionId && this._executionLocks.has(executionId)) {
      const lockedTabId = this._executionLocks.get(executionId)!;
      try {
        const tab = await chrome.tabs.get(lockedTabId);
        if (tab) {
          Logging.log('BrowserContextV2', `Using locked tab ${lockedTabId} for execution ${executionId}`);
          return tab;
        }
      } catch (error) {
        Logging.log('BrowserContextV2', `Execution-locked tab ${lockedTabId} for execution ${executionId} no longer exists`, 'warning');
        this._executionLocks.delete(executionId);
        this._executionTabMap.delete(executionId);
        // CRITICAL FIX: Don't fall back - throw error for lost tab context
        throw new Error(`Execution ${executionId} lost tab context: Tab ${lockedTabId} no longer exists`);
      }
    }

    // SECOND: Check execution-tab mapping as fallback
    if (executionId && this._executionTabMap.has(executionId)) {
      const mappedTabId = this._executionTabMap.get(executionId)!;
      try {
        const tab = await chrome.tabs.get(mappedTabId);
        if (tab) {
          Logging.log('BrowserContextV2', `Using mapped tab ${mappedTabId} for execution ${executionId}`);
          // Re-lock to this tab
          this._executionLocks.set(executionId, mappedTabId);
          return tab;
        }
      } catch (error) {
        Logging.log('BrowserContextV2', `Mapped tab ${mappedTabId} for execution ${executionId} no longer exists`, 'warning');
        this._executionTabMap.delete(executionId);
        // CRITICAL FIX: Don't fall back - throw error for lost tab context
        throw new Error(`Execution ${executionId} lost tab context: Tab ${mappedTabId} no longer exists`);
      }
    }

    // THIRD: If execution ID provided but no tab found, this is an error
    if (executionId) {
      Logging.log('BrowserContextV2', `ERROR: No tab locked for execution ${executionId}. Must lock a tab before operations.`, 'error');
      throw new Error(`No tab locked for execution ${executionId}. Must lock a tab first.`);
    }

    // Only fall back to active tab if NO execution context (backward compatibility)
    Logging.log('BrowserContextV2', 'No execution context provided, falling back to active tab');
    return this._getActiveTab(false); // Pass false to prevent creating new tabs from execution context
  }

  /**
   * Lock execution to a specific tab
   * @param tabId - The tab to lock to
   * @param executionId - The execution ID (required for proper isolation)
   */
  public lockExecutionToTab(tabId: number, executionId: string): void {
    // Store per-execution lock
    this._executionLocks.set(executionId, tabId);
    this._executionTabMap.set(executionId, tabId);
    Logging.log('BrowserContextV2', `Execution ${executionId} locked to tab ${tabId}`);
  }
  
  /**
   * Unlock execution
   * @param executionId - The execution ID to unlock (required)
   */
  public async unlockExecution(executionId?: string): Promise<void> {
    if (!executionId) {
      Logging.log('BrowserContextV2', 'Warning: unlockExecution called without executionId', 'warning');
      return;
    }

    const previousLockedTab = this._executionLocks.get(executionId);
    this._executionLocks.delete(executionId);
    Logging.log('BrowserContextV2', `Execution ${executionId} unlocked${previousLockedTab ? ` (was locked to tab ${previousLockedTab})` : ''}`);
  }

  // ============= Window Management =============

  public async getCurrentWindow(executionId?: string): Promise<chrome.windows.Window> {
    try {
      const tab = await this.getTargetTab(executionId);
      if (tab && tab.windowId) {
        const window = await chrome.windows.get(tab.windowId);
        if (window) {
          return window;
        }
      }
    } catch (error) {
      Logging.log('BrowserContextV2', `Failed to get window from target tab: ${error}`, 'warning');
    }
    
    // Fall back to current window
    try {
      const window = await chrome.windows.getCurrent();
      if (window) {
        return window;
      }
    } catch (error) {
      Logging.log('BrowserContextV2', `Failed to get current window: ${error}`, 'error');
    }

    throw new Error('No window found');
  }

  /**
   * Get structured browser state (V2 clean API)
   * @returns BrowserState object with current page info and interactive elements
   */
  public async getBrowserState(simplified: boolean = false, executionId?: string): Promise<BrowserState> {
    return profileAsync('BrowserContext.getBrowserState', async () => {
    try {
      const currentPage = await this.getCurrentPage(executionId);
      const tabs = await this.getTabs();
      
      // Get current page info
      const url = await currentPage.url();
      const title = await currentPage.title();
      const tabId = currentPage.tabId;

      // Get formatted strings from the page - pass simplified flag
      const clickableElementsString = await currentPage.getClickableElementsString(simplified);
      const typeableElementsString = await currentPage.getTypeableElementsString(simplified);
      
      // Get structured elements from the page
      const clickableElements = await currentPage.getClickableElements();
      const typeableElements = await currentPage.getTypeableElements();
      
      // Get hierarchical structure - skip if simplified
      const hierarchicalStructure = simplified ? null : await currentPage.getHierarchicalStructure();
      
      
      // Build structured state
      const state: BrowserState = {
        // Current tab info
        tabId,
        url,
        title,
        
        // All tabs
        tabs,
        
        // Interactive elements
        clickableElements,
        typeableElements,
        
        // Pre-formatted strings
        clickableElementsString,
        typeableElementsString,
        
        // Hierarchical structure
        hierarchicalStructure,
      };
      
      return state;
    } catch (error) {
      Logging.log('BrowserContextV2', `Failed to get state: ${error}`, 'warning');
      
      // Return minimal state on error
      const minimalState: BrowserState = {
        tabId: 0,
        url: 'about:blank',
        title: 'New Tab',
        tabs: [],
        clickableElements: [],
        typeableElements: [],
        clickableElementsString: '',
        typeableElementsString: '',
        hierarchicalStructure: null
      };
      
      return minimalState;
    }
    });
  }


  // ============= Cleanup Operations =============

  /**
   * Clean up execution-specific resources (not the shared page cache)
   */
  public async cleanup(): Promise<void> {
    try {
      Logging.log('BrowserContextV2', 'Cleaning up execution-specific state');

      // Only clear execution-specific state, keep page cache for other executions
      // Note: _executionLocks are NOT cleared here - they're managed per execution
      this._userSelectedTabIds = null;
      // Don't clear _pageCache, _executionTabMap, or _executionLocks - they're shared across executions

      Logging.log('BrowserContextV2', 'Execution-specific state cleaned up successfully');
    } catch (error) {
      Logging.log('BrowserContextV2', `Error during cleanup: ${error}`, 'error');
    }
  }

  /**
   * Full cleanup for shutdown (clears everything including cache)
   */
  public async fullCleanup(): Promise<void> {
    try {
      Logging.log('BrowserContextV2', 'Performing full browser context cleanup');

      // Stop the cleanup interval
      this._stopCacheCleanupInterval();

      // Dispose all cached pages properly
      for (const page of this._pageCache.values()) {
        try {
          await page.dispose();
        } catch (error) {
          Logging.log('BrowserContextV2', `Error disposing page during cleanup: ${error}`, 'warning');
        }
      }

      // Clear all state including shared cache
      this._pageCache.clear();
      this._pageCacheTimestamps.clear();
      this._executionTabMap.clear();
      this._executionLocks.clear();
      this._userSelectedTabIds = null;

      Logging.log('BrowserContextV2', 'Full browser context cleanup completed');
    } catch (error) {
      Logging.log('BrowserContextV2', `Error during full cleanup: ${error}`, 'error');
    }
  }
}

export default BrowserContext;
