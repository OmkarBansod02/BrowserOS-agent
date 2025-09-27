import { z } from "zod";
import { BrowserContext } from "@/lib/browser/BrowserContext";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";
import { MessageManager } from "@/lib/runtime/MessageManager";
import { BrowserAgent } from "@/lib/agent/BrowserAgent";
import { NewAgent } from "@/lib/agent/NewAgent";
import { NewAgent27 } from "@/lib/agent/Agent27";
import { ChatAgent } from "@/lib/agent/ChatAgent";
import { langChainProvider } from "@/lib/llm/LangChainProvider";
import { Logging } from "@/lib/utils/Logging";
import { PubSubChannel } from "@/lib/pubsub/PubSubChannel";
import { PubSub } from "@/lib/pubsub";
import { ExecutionMetadata } from "@/lib/types/messaging";
import { getFeatureFlags } from "@/lib/utils/featureFlags";
import { ResourceMonitor } from "@/lib/utils/ResourceMonitor";
// Evals2: session, scoring, and logging
import { ENABLE_EVALS2 } from "@/config";
import { BraintrustEventManager } from "@/evals2/BraintrustEventManager";
import { EvalsScorer } from "@/evals2/EvalScorer";
import { braintrustLogger } from "@/evals2/BraintrustLogger";

// Execution options schema (executionId provided externally)
export const ExecutionOptionsSchema = z.object({
  mode: z.enum(["chat", "browse"]), // Execution mode
  tabId: z.number().optional(), // Target tab ID
  tabIds: z.array(z.number()).optional(), // Multiple tab context
  metadata: z.any().optional(), // Additional execution metadata
  debug: z.boolean().default(false), // Debug mode flag
});

export type ExecutionOptions = z.infer<typeof ExecutionOptionsSchema>;

/**
 * Execution instance scoped to a single execution ID.
 * Manages a persistent conversation (MessageManager) and browser context per execution.
 * Fresh ExecutionContext and agents are created per run.
 */
export class Execution {
  readonly id: string;
  private browserContext: BrowserContext | null = null;
  private messageManager: MessageManager | null = null;
  private pubsub: PubSubChannel | null = null;
  private options: ExecutionOptions;
  private currentAbortController: AbortController | null = null;

  constructor(executionId: string) {
    this.id = executionId;
    this.pubsub = PubSub.getChannel(executionId);
    // Initialize with default options
    this.options = {
      mode: "browse",
      tabIds: [],
      debug: false
    };
    Logging.log(
      "Execution",
      `Created execution instance ${executionId}`,
    );
  }

  /**
   * Get the singleton instance of Execution
   */
  /**
   * Update execution options before running
   * @param options - Partial options to update
   */
  updateOptions(options: Partial<ExecutionOptions>): void {
    const providedTabIds = Array.isArray(options.tabIds)
      ? options.tabIds.filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      : undefined;

    const nextTabIds = providedTabIds ?? this.options.tabIds ?? [];

    const explicitTabId = typeof options.tabId === "number" ? options.tabId : undefined;
    const derivedTabId = explicitTabId ?? nextTabIds[0] ?? this.options.tabId;

    this.options = {
      ...this.options,
      ...options,
      tabIds: nextTabIds,
      tabId: derivedTabId,
    };

    Logging.log(
      "Execution",
      `Updated options: mode=${this.options.mode}, tabId=${this.options.tabId ?? "none"}, tabIds=${this.options.tabIds?.length || 0}`,
    );
  }

  /**
   * Ensure persistent resources are initialized
   * Gets singleton browser context and creates message manager if needed
   */
  private async _ensureInitialized(): Promise<void> {
    if (!this.browserContext) {
      // Use singleton BrowserContext instead of creating new instance
      this.browserContext = BrowserContext.getInstance();
    }

    if (!this.messageManager) {
      const modelCapabilities = await langChainProvider.getModelCapabilities();
      this.messageManager = new MessageManager(modelCapabilities.maxTokens);
    }

    // Initialize feature flags (cached after first call)
    await getFeatureFlags().initialize();
  }

  /**
   * Run the execution with the given query
   * @param query - The user's query to execute
   * @param metadata - Optional execution metadata
   */
  async run(query: string, metadata?: ExecutionMetadata): Promise<void> {
    // Cancel any current execution
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    // Check resource availability
    if (!ResourceMonitor.registerExecution(this.id)) {
      throw new Error('Too many concurrent executions. Please wait for other tasks to complete.');
    }

    // Ensure persistent resources exist
    await this._ensureInitialized();

    // Create fresh abort controller for this run
    this.currentAbortController = new AbortController();
    const startTime = Date.now();

    try {
      // Get a tab for execution - LOCK FIRST before any operations
      let targetTabId = this.options.tabId;

      if (!targetTabId) {
        // DON'T use getCurrentPage without a locked tab!
        // Instead, get the active tab directly and lock it
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        if (!activeTab?.id) {
          throw new Error("No active tab found for execution");
        }

        targetTabId = activeTab.id;
        Logging.log("Execution", `No tab specified, using active tab ${targetTabId} for execution ${this.id}`);
      }

      // Lock the tab FIRST, before any other operations
      if (this.browserContext && targetTabId) {
        this.browserContext.lockExecutionToTab(targetTabId, this.id);
        Logging.log("Execution", `Execution ${this.id} locked to tab ${targetTabId}`);
      } else {
        throw new Error("Browser context is not initialized or no target tab available");
      }

      // Get model capabilities for vision support and context size
      const modelCapabilities = await langChainProvider.getModelCapabilities();

      // Determine if limited context mode should be enabled (< 32k tokens)
      const limitedContextMode = modelCapabilities.maxTokens < 32_000;

      if (limitedContextMode) {
        Logging.log(
          "Execution",
          `Limited context mode enabled (maxTokens: ${modelCapabilities.maxTokens})`,
          "info"
        );
      }

      // Create fresh execution context with new abort signal
      const executionContext = new ExecutionContext({
        executionId: this.id,
        browserContext: this.browserContext!,
        messageManager: this.messageManager!,
        pubsub: this.pubsub,
        abortSignal: this.currentAbortController.signal,
        debugMode: this.options.debug || false,
        supportsVision: modelCapabilities.supportsImages,
        limitedContextMode: limitedContextMode,
        maxTokens: modelCapabilities.maxTokens,
      });

      // Set selected tab IDs for context
      executionContext.setSelectedTabIds(this.options.tabIds || []);
      executionContext.startExecution(this.options.tabId || 0);

      // Evals2: start a session and attach parent span to context
      let parentSpanId: string | undefined;
      const evalsEventMgr = BraintrustEventManager.getInstance();
      if (ENABLE_EVALS2 && evalsEventMgr.isEnabled()) {
        try {
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const { parent } = await evalsEventMgr.startSession({
            sessionId,
            task: query,
            timestamp: Date.now(),
            agentVersion: 'v1'
          });
          parentSpanId = parent;
          if (parentSpanId) {
            executionContext.parentSpanId = parentSpanId;
          }
        } catch (e) {
          // Non-fatal: continue without evals session
        }
      }

      if (!getFeatureFlags().isEnabled('NEW_AGENT') && this.options.mode !== 'chat') {
        executionContext.getPubSub().publishMessage({
          msgId: "old_agent_notice",
          content: `⚠️ **Note**: You are using the older version of agent.

Upgrade to the latest BrowserOS version from [GitHub Releases](https://github.com/browseros-ai/BrowserOS/releases) to access the new and improved agent!`,
          role: "assistant",
          ts: Date.now(),
        });
      }

      // Create fresh agent
      const agent =
        this.options.mode === "chat"
          ? new ChatAgent(executionContext)
          : getFeatureFlags().isEnabled('NEW_AGENT')
            ? new NewAgent(executionContext)
            : new BrowserAgent(executionContext);

      // Execute
      await agent.execute(query, metadata || this.options.metadata);

      // Evals2: post-execution scoring + upload
      if (ENABLE_EVALS2 && evalsEventMgr.isEnabled()) {
        try {
          const scorer = new EvalsScorer();
          const messages = executionContext.messageManager!.getMessages();
          const durationMs = Date.now() - startTime;
          let score;
          try {
            score = await scorer.scoreFromMessages(
              messages,
              query,
              executionContext.toolMetrics,
              durationMs
            );
          } catch (err) {
            // Fallback to heuristic scoring if LLM scoring unavailable (e.g., no Gemini key)
            (scorer as any).llm = null;
            score = await scorer.scoreFromMessages(
              messages,
              query,
              executionContext.toolMetrics,
              durationMs
            );
          }

          // Basic metadata for Braintrust
          const provider = langChainProvider.getCurrentProvider();
          const contextMetrics = {
            messageCount: messages.length,
            totalCharacters: messages.reduce((sum, m) => {
              const c: any = (m as any).content;
              if (typeof c === 'string') return sum + c.length;
              if (Array.isArray(c)) return sum + JSON.stringify(c).length;
              return sum;
            }, 0),
            estimatedTokens: 0
          };

          await braintrustLogger.logTaskScore(
            query,
            score,
            durationMs,
            {
              agent: this.options.mode === 'chat' ? 'ChatAgent' : (getFeatureFlags().isEnabled('NEW_AGENT') ? 'NewAgent' : 'BrowserAgent'),
              provider: provider?.name,
              model: provider?.modelId,
            },
            parentSpanId,
            contextMetrics
          );

          // Track session-level average and end session
          evalsEventMgr.addTaskScore(score.weightedTotal);
          await evalsEventMgr.endSession('completed');
        } catch (e) {
          // Non-fatal
          console.debug('Evals2 scoring/logging skipped:', e);
        }
      }

      Logging.log(
        "Execution",
        `Completed execution in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const wasCancelled =
        error instanceof Error && error.name === "AbortError";

      if (!wasCancelled) {
        this.pubsub?.publishMessage({
          msgId: `error_`,
          content: `❌ Error: ${errorMessage}`,
          role: "error",
          ts: Date.now(),
        });
      }

      throw error;
    } finally {
      // Clear abort controller after run completes
      this.currentAbortController = null;

      // Unregister execution from resource monitor
      ResourceMonitor.unregisterExecution(this.id);

      // Unlock browser context after each run - pass execution ID
      if (this.browserContext) {
        await this.browserContext.unlockExecution(this.id);
      }
    }
  }

  /**
   * Cancel the current execution
   * Preserves message history for continuation
   */
  cancel(): void {
    if (!this.currentAbortController) {
      Logging.log("Execution", `No active execution to cancel`);
      return;
    }

    // Send pause message to the user
    if (this.pubsub) {
      this.pubsub.publishMessage({
        msgId: "pause_message_id",
        content:
          "✋ Task paused. To continue this task, just type your next request OR use 🔄 to start a new task!",
        role: "assistant",
        ts: Date.now(),
      });
    }

    // Abort the current execution with reason
    const abortReason = {
      userInitiated: true,
      message: "User cancelled execution",
    };
    this.currentAbortController.abort(abortReason);
    this.currentAbortController = null;

    Logging.log("Execution", `Cancelled execution`);
  }

  /**
   * Reset conversation history for a fresh start
   * Cancels current execution and clears message history
   */
  reset(): void {
    // Cancel current execution if running
    if (this.currentAbortController) {
      const abortReason = {
        userInitiated: true,
        message: "User cancelled execution",
      };
      this.currentAbortController.abort(abortReason);
      this.currentAbortController = null;
    }

    // Clear message history
    this.messageManager?.clear();

    // Clear PubSub buffer
    this.pubsub?.clearBuffer();

    Logging.log("Execution", `Reset execution`);
  }

  /**
   * Dispose of the execution completely
   * Note: BrowserContext is singleton, so we don't dispose it, just unlock
   */
  async dispose(): Promise<void> {
    // Cancel if still running
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    // Unregister from resource monitor
    ResourceMonitor.unregisterExecution(this.id);

    // Unlock browser context but don't dispose (it's a shared singleton)
    if (this.browserContext) {
      // Pass execution ID for proper cleanup
      await this.browserContext.unlockExecution(this.id);
      // Just remove our reference, don't cleanup the shared instance
      this.browserContext = null;
    }

    // Clear other references
    this.messageManager = null;
    this.pubsub = null;

    Logging.log("Execution", `Disposed execution ${this.id}`);
  }

  getPrimaryTabId(): number | undefined {
    return typeof this.options.tabId === "number" ? this.options.tabId : undefined;
  }

  getTabIds(): number[] {
    return Array.isArray(this.options.tabIds) ? [...this.options.tabIds] : [];
  }

  /**
   * Check if execution is running
   */
  isRunning(): boolean {
    return this.currentAbortController !== null;
  }

  /**
   * Get execution status info
   */
  getStatus(): {
    id: string;
    isRunning: boolean;
    mode: "chat" | "browse";
  } {
    return {
      id: this.id,
      isRunning: this.isRunning(),
      mode: this.options.mode,
    };
  }
}
