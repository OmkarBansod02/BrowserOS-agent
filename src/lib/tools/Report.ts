import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";
import { PubSubChannel } from "@/lib/pubsub/PubSubChannel";
import { generateReport, ReportData, ReportSection, ExecutionDetail, ExecutionMetrics } from "@/lib/utils/reportTemplate";
import { Logging } from "@/lib/utils/Logging";

const ReportInputSchema = z.object({
  taskDescription: z
    .string()
    .describe("Description of the task that was executed"),
  actionsPerformed: z
    .array(z.string())
    .describe("List of actions taken during execution"),
  dataExtracted: z
    .record(z.any())
    .optional()
    .describe("Structured data extracted or collected (as JSON object)"),
  findings: z
    .string()
    .optional()
    .describe("Summary of key findings or insights"),
  additionalSections: z
    .array(
      z.object({
        title: z.string().describe("Section heading"),
        content: z.string().describe("HTML content for the section"),
      })
    )
    .optional()
    .describe("Additional custom sections to include in the report"),
  executionDetails: z
    .array(
      z.object({
        timestamp: z.string().describe("When this step occurred"),
        action: z.string().describe("What action was taken"),
        tool: z.string().describe("Tool used (navigate, click, extract, etc.)"),
        parameters: z.record(z.any()).optional().describe("Tool parameters"),
        result: z.enum(['success', 'failed', 'retry']).describe("Outcome"),
        duration: z.string().optional().describe("Time taken"),
        error: z.string().optional().describe("Error message if failed"),
        retryCount: z.number().optional().describe("Number of retries"),
      })
    )
    .optional()
    .describe("Detailed execution timeline showing what happened under the hood"),
  metrics: z
    .object({
      totalDuration: z.string().describe("Total execution time"),
      toolsUsed: z.number().describe("Number of tool calls"),
      successRate: z.string().describe("Percentage of successful actions"),
      retries: z.number().describe("Total retry attempts"),
      pagesVisited: z.number().describe("Number of pages navigated"),
    })
    .optional()
    .describe("Performance metrics for the execution"),
});

type ReportInput = z.infer<typeof ReportInputSchema>;

export function ReportTool(
  context: ExecutionContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "report",
    description: `Generate a comprehensive HTML report showing task execution details and data collected.

This tool creates a detailed report similar to how Claude Code uses README.md, showing:
- What the agent did (actions performed)
- HOW it did it (execution timeline with tool calls)
- Data extracted and findings
- Performance metrics and any retries/errors

Use this tool to:
- Document task execution with full transparency
- Show detailed timeline of tool calls and parameters
- Present extracted data in tables and visualizations
- Provide metrics on performance and success rates

The report includes:
1. Performance Metrics - Duration, tools used, success rate
2. Execution Timeline - Step-by-step breakdown with timestamps
3. Actions Summary - High-level actions taken
4. Results - Data extracted in tables/cards
5. Summary - Key findings and insights

Example: For "Compare iPhone prices", the report will show:
- Metrics: 45s duration, 12 tools used, 91% success rate
- Timeline: Each navigation, extraction, retry with timestamps
- Data: Price comparison table
- Findings: "Walmart has lowest price at $528"

The report opens automatically in a new browser tab.`,
    schema: ReportInputSchema,
    func: async (args: ReportInput) => {
      try {
        context.incrementMetric("toolCalls");

        // Emit thinking message
        context.getPubSub().publishMessage(
          PubSubChannel.createMessage("📊 Generating report...", "thinking")
        );

        // Get current timestamp
        const timestamp = new Date().toLocaleString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        // Prepare report data
        const reportData: ReportData = {
          taskDescription: args.taskDescription,
          timestamp,
          actionsPerformed: args.actionsPerformed,
          dataExtracted: args.dataExtracted,
          findings: args.findings,
          additionalSections: args.additionalSections as ReportSection[] | undefined,
          executionDetails: args.executionDetails as ExecutionDetail[] | undefined,
          metrics: args.metrics as ExecutionMetrics | undefined,
        };

        // Generate HTML report
        const htmlContent = generateReport(reportData);

        Logging.log(
          "ReportTool",
          `Generated report for task: ${args.taskDescription}`,
          "info"
        );

        // Convert HTML to base64 data URL
        const base64Html = btoa(unescape(encodeURIComponent(htmlContent)));
        const dataUrl = `data:text/html;base64,${base64Html}`;

        // Open the report in a new tab using data URL
        const tab = await chrome.tabs.create({
          url: dataUrl,
          active: true
        });

        if (!tab.id) {
          throw new Error('Failed to create new tab for report');
        }

        Logging.log(
          "ReportTool",
          `Report successfully opened in tab ${tab.id}`,
          "info"
        );

        // Emit success message
        context.getPubSub().publishMessage(
          PubSubChannel.createMessage(
            "✅ Report generated and opened in new tab",
            "thinking"
          )
        );

        return JSON.stringify({
          ok: true,
          output: {
            message: "Report generated successfully and opened in new tab",
            tabId: tab.id,
            taskDescription: args.taskDescription,
            timestamp,
          },
        });
      } catch (error) {
        context.incrementMetric("errors");
        Logging.log(
          "ReportTool",
          `Failed to generate report: ${error}`,
          "error"
        );
        return JSON.stringify({
          ok: false,
          error: `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  });
}
