import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";
import { PubSubChannel } from "@/lib/pubsub/PubSubChannel";
import {
  generateReport,
  ReportData,
  ReportSection,
  ExecutionDetail,
  ExecutionMetrics,
  ReportComponent,
} from "@/lib/utils/reportTemplate";
import { Logging } from "@/lib/utils/Logging";

// Component schema for flexible report building
const ReportComponentSchema = z.object({
  type: z.enum(['summary', 'metrics', 'timeline', 'actions', 'data-table', 'data-cards', 'findings', 'custom'])
    .describe("Component type determines how content is rendered"),
  title: z.string().optional()
    .describe("Optional section title (H2 heading)"),
  content: z.any()
    .describe("Component data - structure varies by type (e.g., array for data-table, string for summary)"),
  order: z.number().optional()
    .describe("Display order - lower numbers appear first (default: order in array)"),
  style: z.enum(['default', 'compact', 'highlighted']).optional()
    .describe("Style variant for the component")
});

const ReportInputSchema = z.object({
  taskDescription: z
    .string()
    .describe("Description of the task that was executed"),

  // Component-based structure (NEW - LLM builds report from components)
  components: z
    .array(ReportComponentSchema)
    .min(1)  // Gemini compatibility fix - forces inline schema instead of $ref
    .optional()
    .describe("Build report from components - each component renders a section. Use this for full control over report structure."),

  // Legacy fields (backward compatibility - still supported)
  actionsPerformed: z
    .array(z.string())
    .min(1)  // Gemini compatibility fix
    .optional()
    .describe("List of actions taken during execution (legacy)"),
  dataExtracted: z
    .any()  // Simplified for Gemini - accepts any JSON-serializable data
    .optional()
    .describe("Structured data extracted or collected (legacy) - can be object, array, or any JSON value"),
  findings: z
    .string()
    .optional()
    .describe("Summary of key findings or insights (legacy)"),
  additionalSections: z
    .array(
      z.object({
        title: z.string().describe("Section heading"),
        content: z.string().describe("HTML content for the section"),
      })
    )
    .min(1)  // Gemini compatibility fix
    .optional()
    .describe("Additional custom sections (legacy)"),
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
    .min(1)  // Gemini compatibility fix
    .optional()
    .describe("Detailed execution timeline (legacy)"),
  metrics: z
    .object({
      totalDuration: z.string().describe("Total execution time"),
      toolsUsed: z.number().describe("Number of tool calls"),
      successRate: z.string().describe("Percentage of successful actions"),
      retries: z.number().describe("Total retry attempts"),
      pagesVisited: z.number().describe("Number of pages navigated"),
    })
    .optional()
    .describe("Performance metrics for the execution (legacy)"),
});

type ReportInput = z.infer<typeof ReportInputSchema>;

export function ReportTool(
  context: ExecutionContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "report",
    description: `Generate a clean HTML report documenting task execution, similar to Claude Code's README.md.

**When to use:**
- Task extracted structured data (comparisons, research, data collection)
- User explicitly asks for a report
- Task involved multiple steps worth documenting

**Two ways to build reports:**

1. **Component-based (Flexible)** - Build custom report structure:
   components: [
     { type: 'summary', content: 'Brief task summary' },
     { type: 'metrics', content: { totalDuration, toolsUsed, successRate, retries, pagesVisited } },
     { type: 'timeline', content: [{ timestamp, action, tool, result, duration }] },
     { type: 'data-table', title: 'Results', content: [{ col1, col2, ... }] },
     { type: 'findings', content: 'Key takeaway or insight' }
   ]

2. **Legacy (Simple)** - Use pre-structured fields:
   actionsPerformed: ['Action 1', 'Action 2'],
   dataExtracted: { ... },
   findings: 'Summary',
   executionDetails: [...],
   metrics: { ... }

**Component types:**
- summary: Text summary box
- metrics: Performance metrics grid
- timeline: Execution timeline with tool calls
- actions: Bulleted action list
- data-table: Tabular data display
- data-cards: Key-value pair cards
- findings: Key insights box
- custom: Custom HTML content

**Example (component-based):**
report({
  taskDescription: "Compare iPhone prices",
  components: [
    { type: 'metrics', content: { totalDuration: '45s', toolsUsed: 12, successRate: '91%', retries: 1, pagesVisited: 3 } },
    { type: 'data-table', title: 'Price Comparison', content: [
      { store: 'Amazon', price: '$799' },
      { store: 'Walmart', price: '$749' }
    ]},
    { type: 'findings', content: 'Walmart has the lowest price at $749' }
  ]
})

Report opens in a new browser tab.`,
    schema: ReportInputSchema,
    func: async (args: ReportInput) => {
      try {
        context.incrementMetric("toolCalls");

        // Emit thinking message
        context.getPubSub().publishMessage(
          PubSubChannel.createMessage("Generating report...", "thinking")
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
          components: args.components as ReportComponent[] | undefined,
          // Legacy fields for backward compatibility
          actionsPerformed: args.actionsPerformed,
          dataExtracted: args.dataExtracted as ReportData["dataExtracted"],
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
          PubSubChannel.createMessage("Report generated and opened in a new tab", "thinking")
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



