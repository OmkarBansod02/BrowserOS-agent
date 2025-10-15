import { z } from "zod";

// Schemas for execution tracking
const ToolExecutionSchema = z.object({
  timestamp: z.string(),  // ISO timestamp
  tool: z.string(),  // Tool name
  parameters: z.record(z.any()).optional(),  // Tool parameters
  result: z.enum(['success', 'failed', 'retry']),  // Outcome
  duration: z.number(),  // Duration in ms
  error: z.string().optional(),  // Error message if failed
  retryCount: z.number().default(0),  // Number of retries
  output: z.any().optional()  // Tool output
});

const DataExtractedItemSchema = z.object({
  source: z.string(),  // Where data came from
  timestamp: z.string(),  // When extracted
  data: z.record(z.any()),  // The actual data
  type: z.string().optional()  // Type of data (price, product, etc.)
});

const ExecutionMetricsSchema = z.object({
  startTime: z.number(),  // Start timestamp
  endTime: z.number().optional(),  // End timestamp
  totalDuration: z.string().optional(),  // Human-readable duration
  toolsUsed: z.number().default(0),  // Total tool calls
  successCount: z.number().default(0),  // Successful calls
  failureCount: z.number().default(0),  // Failed calls
  retryCount: z.number().default(0),  // Total retries
  pagesVisited: z.number().default(0),  // Pages navigated
  dataExtracted: z.number().default(0),  // Data extraction count
  successRate: z.string().optional()  // Success percentage
});

export type ToolExecution = z.infer<typeof ToolExecutionSchema>;
export type DataExtractedItem = z.infer<typeof DataExtractedItemSchema>;
export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;

/**
 * Tracks execution details for report generation
 * Follows BrowserOS patterns for clean, modular code
 */
export class ExecutionTracker {
  private toolExecutions: ToolExecution[] = [];
  private dataExtracted: DataExtractedItem[] = [];
  private metrics: ExecutionMetrics;
  private actionsPerformed: string[] = [];
  private taskDescription: string = "";
  private findings: string[] = [];
  private challenges: string[] = [];

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      toolsUsed: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      pagesVisited: 0,
      dataExtracted: 0
    };
  }

  /**
   * Set the task description
   */
  setTaskDescription(description: string): void {
    this.taskDescription = description;
  }

  /**
   * Track a tool execution
   */
  trackToolExecution(
    toolName: string,
    parameters: Record<string, any> | undefined,
    startTime: number
  ): { complete: (result: 'success' | 'failed' | 'retry', error?: string, output?: any) => void } {
    const execution: Partial<ToolExecution> = {
      timestamp: new Date(startTime).toLocaleTimeString(),
      tool: toolName,
      parameters
    };

    return {
      complete: (result: 'success' | 'failed' | 'retry', error?: string, output?: any) => {
        const duration = Date.now() - startTime;

        const completeExecution: ToolExecution = {
          ...execution,
          result,
          duration,
          error,
          output,
          retryCount: 0
        } as ToolExecution;

        this.toolExecutions.push(completeExecution);
        this.metrics.toolsUsed++;

        // Update metrics
        if (result === 'success') {
          this.metrics.successCount++;
        } else if (result === 'failed') {
          this.metrics.failureCount++;
        } else if (result === 'retry') {
          this.metrics.retryCount++;
        }

        // Track specific tool types
        if (toolName === 'navigate' || toolName === 'tab_open') {
          this.metrics.pagesVisited++;
        }
        if (toolName === 'extract') {
          this.metrics.dataExtracted++;
        }
      }
    };
  }

  /**
   * Add an action performed (high-level description)
   */
  addAction(action: string): void {
    this.actionsPerformed.push(action);
  }

  /**
   * Add extracted data
   */
  addExtractedData(source: string, data: Record<string, any>, type?: string): void {
    this.dataExtracted.push({
      source,
      timestamp: new Date().toLocaleTimeString(),
      data,
      type
    });
  }

  /**
   * Add a finding or insight
   */
  addFinding(finding: string): void {
    this.findings.push(finding);
  }

  /**
   * Add a challenge encountered
   */
  addChallenge(challenge: string): void {
    this.challenges.push(challenge);
  }

  /**
   * Finalize metrics
   */
  finalize(): void {
    this.metrics.endTime = Date.now();
    const duration = this.metrics.endTime - this.metrics.startTime;

    // Format duration
    if (duration < 60000) {
      this.metrics.totalDuration = `${(duration / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(duration / 60000);
      const seconds = ((duration % 60000) / 1000).toFixed(0);
      this.metrics.totalDuration = `${minutes}m ${seconds}s`;
    }

    // Calculate success rate
    if (this.metrics.toolsUsed > 0) {
      const rate = (this.metrics.successCount / this.metrics.toolsUsed) * 100;
      this.metrics.successRate = `${rate.toFixed(1)}%`;
    } else {
      this.metrics.successRate = "N/A";
    }
  }

  /**
   * Get report data for report generation
   */
  getReportData(): {
    taskDescription: string;
    actionsPerformed: string[];
    dataExtracted: Record<string, any> | undefined;
    findings: string | undefined;
    executionDetails: ToolExecution[];
    metrics: ExecutionMetrics;
    challenges: string[];
  } {
    // Combine all extracted data intelligently
    let combinedData: Record<string, any> | undefined;

    if (this.dataExtracted.length > 0) {
      // If multiple sources, create comparison structure
      if (this.dataExtracted.length > 1) {
        combinedData = {
          comparison: this.dataExtracted.map(item => ({
            ...item.data,
            _source: item.source,
            _timestamp: item.timestamp
          }))
        };
      } else {
        // Single source, use data directly
        combinedData = this.dataExtracted[0].data;
      }
    }

    // Generate findings summary
    const findingsSummary = this.findings.length > 0
      ? this.findings.join('. ')
      : undefined;

    return {
      taskDescription: this.taskDescription,
      actionsPerformed: this.actionsPerformed,
      dataExtracted: combinedData,
      findings: findingsSummary,
      executionDetails: this.toolExecutions,
      metrics: this.metrics,
      challenges: this.challenges
    };
  }

  /**
   * Get execution summary for logging
   */
  getSummary(): string {
    return `Task: ${this.taskDescription}
Tools: ${this.metrics.toolsUsed} (${this.metrics.successRate} success)
Duration: ${this.metrics.totalDuration || 'N/A'}
Data extracted: ${this.metrics.dataExtracted} items
Actions: ${this.actionsPerformed.length}`;
  }
}