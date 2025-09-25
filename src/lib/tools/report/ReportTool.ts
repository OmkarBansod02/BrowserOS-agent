import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolSuccess, toolError } from '@/lib/tools/Tool.interface'
import { Logging } from '@/lib/utils/Logging'
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages'

// Constants
const DEFAULT_REPORT_TITLE = 'Nxtscape Task Execution Report'
const REPORT_DIR_NAME = 'nxtscape-reports'

// Report data structures
const ExecutionStepSchema = z.object({
  stepNumber: z.number(),  // Step number in sequence
  toolName: z.string(),  // Tool that was executed
  action: z.string(),  // What action was performed
  input: z.any(),  // Tool input parameters
  result: z.any(),  // Tool result output
  timestamp: z.date(),  // When the step was executed
  duration: z.number().optional(),  // How long the step took in ms
  screenshot: z.string().optional(),  // Base64 screenshot if available
})

const ExtractedDataSchema = z.object({
  source: z.string(),  // Source website or context
  url: z.string().optional(),  // URL if applicable
  timestamp: z.date(),  // When data was extracted
  dataType: z.string(),  // Type of data (e.g., "product_price")
  data: z.any(),  // The actual extracted data
})

const ReportMetadataSchema = z.object({
  taskId: z.string(),  // Unique task identifier
  taskDescription: z.string(),  // What the user asked for
  startTime: z.date(),  // When execution started
  endTime: z.date(),  // When execution ended
  duration: z.number(),  // Total duration in ms
  status: z.enum(['success', 'partial', 'failed']),  // Overall execution status
})

const ReportSummarySchema = z.object({
  totalSteps: z.number(),  // Total number of steps executed
  toolsUsed: z.array(z.string()),  // List of unique tools used
  sitesVisited: z.array(z.string()),  // List of unique sites visited
  dataPoints: z.number(),  // Number of data points extracted
  keyFindings: z.array(z.string()),  // Key findings from the task
})

const ExecutionReportSchema = z.object({
  metadata: ReportMetadataSchema,
  executionSteps: z.array(ExecutionStepSchema),
  extractedData: z.array(ExtractedDataSchema),
  summary: ReportSummarySchema,
})

type ExecutionReport = z.infer<typeof ExecutionReportSchema>

// Tool input schema
const ReportToolSchema = z.object({
  includeScreenshots: z.boolean().default(false).describe('Include screenshots in the report'),  // Whether to include screenshots
  openInBrowser: z.boolean().default(true).describe('Open the report in a new browser tab'),  // Whether to open report automatically
})

export function createReportTool(context: ExecutionContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'report_tool',
    description: 'Generate a comprehensive HTML report of task execution. USE THIS for: price comparisons, data extraction tasks, multi-site research, or when user requests a report. Creates a beautiful report with timeline, extracted data, and findings that opens in a new tab.',
    schema: ReportToolSchema,
    func: async (input) => {
      try {
        // Collect execution data from context
        const reportData = collectReportData(context)

        // Generate HTML content
        const htmlContent = generateHTML(reportData)

        // Save report to file
        const filePath = await saveReport(htmlContent, reportData.metadata.taskId)

        // Open in browser if requested
        if (input.openInBrowser) {
          await openInBrowser(context, filePath)
        }

        return toolSuccess(`Report generated successfully: ${filePath}`)
      } catch (error) {
        Logging.log('ReportTool', `Failed to generate report: ${error}`, 'error')
        return toolError(`Failed to generate report: ${error}`)
      }
    },
  })
}

// Collect execution data from the context
function collectReportData(context: ExecutionContext): ExecutionReport {
  const messages = context.messageManager.getMessages()
  const metrics = context.getExecutionMetrics()
  const task = context.getCurrentTask() || 'Unknown Task'

  // Parse execution steps from messages
  const executionSteps: z.infer<typeof ExecutionStepSchema>[] = []
  const extractedData: z.infer<typeof ExtractedDataSchema>[] = []
  const sitesVisited = new Set<string>()
  let stepNumber = 0

  // Process messages to extract execution data
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]

    // Track AI messages with tool calls
    if (message instanceof AIMessage && message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        stepNumber++

        // Find corresponding tool result message
        const resultMessage = messages[i + 1] instanceof ToolMessage ? messages[i + 1] : null
        let result = null
        let duration = 0

        if (resultMessage) {
          try {
            // Parse tool result
            const parsedResult = JSON.parse(resultMessage.content as string)
            result = parsedResult.output || parsedResult

            // Extract URLs from navigation/navigate tool
            if ((toolCall.name === 'navigation_tool' || toolCall.name === 'navigate_tool') && toolCall.args?.url) {
              try {
                const url = new URL(toolCall.args.url)
                sitesVisited.add(url.hostname)
              } catch (e) {
                // Invalid URL, skip
              }
            }

            // Extract data from extract_tool
            if (toolCall.name === 'extract_tool' && parsedResult.ok && parsedResult.output) {
              extractedData.push({
                source: toolCall.args?.source || 'Unknown',
                url: undefined,  // URL will be tracked by extract tool itself
                timestamp: new Date(),
                dataType: 'extracted_content',
                data: parsedResult.output,
              })
            }
          } catch (e) {
            result = resultMessage.content
          }
        }

        executionSteps.push({
          stepNumber,
          toolName: toolCall.name,
          action: getActionDescription(toolCall.name, toolCall.args),
          input: toolCall.args,
          result,
          timestamp: new Date(),
          duration: metrics.toolFrequency.get(toolCall.name) ? 1000 : undefined,  // Placeholder duration
        })
      }
    }
  }

  // Generate key findings based on extracted data
  const keyFindings: string[] = []
  if (extractedData.length > 0) {
    keyFindings.push(`Extracted ${extractedData.length} data points`)
  }
  if (sitesVisited.size > 0) {
    keyFindings.push(`Visited ${sitesVisited.size} unique websites`)
  }
  if (executionSteps.length > 0) {
    keyFindings.push(`Executed ${executionSteps.length} automation steps`)
  }

  // Build report structure
  const report: ExecutionReport = {
    metadata: {
      taskId: context.executionId,
      taskDescription: task,
      startTime: new Date(metrics.startTime),
      endTime: metrics.endTime ? new Date(metrics.endTime) : new Date(),
      duration: metrics.endTime ? metrics.endTime - metrics.startTime : Date.now() - metrics.startTime,
      status: metrics.errors > 0 ? 'partial' : 'success',
    },
    executionSteps,
    extractedData,
    summary: {
      totalSteps: executionSteps.length,
      toolsUsed: Array.from(new Set(executionSteps.map(s => s.toolName))),
      sitesVisited: Array.from(sitesVisited),
      dataPoints: extractedData.length,
      keyFindings,
    },
  }

  return report
}

// Generate action description based on tool name and args
function getActionDescription(toolName: string, args: any): string {
  switch (toolName) {
    case 'navigation_tool':
      return `Navigate to ${args?.url || 'URL'}`
    case 'interact_tool':
      return `${args?.action || 'Interact with'} element: ${args?.selector || 'element'}`
    case 'extract_tool':
      return `Extract ${args?.dataType || 'data'} from page`
    case 'scroll_tool':
      return `Scroll ${args?.direction || 'page'}`
    case 'screenshot_tool':
      return 'Capture screenshot'
    case 'search_tool':
      return `Search for: ${args?.query || 'query'}`
    case 'tab_operations_tool':
      return `Tab operation: ${args?.operation || 'manage tabs'}`
    default:
      return `Execute ${toolName}`
  }
}

// Generate HTML report
function generateHTML(data: ExecutionReport): string {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const formatDate = (date: Date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${DEFAULT_REPORT_TITLE} - ${data.metadata.taskDescription}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            position: relative;
        }

        .header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        .header .task-description {
            font-size: 1.1rem;
            opacity: 0.9;
            margin-bottom: 1rem;
        }

        .header .metadata {
            display: flex;
            gap: 2rem;
            flex-wrap: wrap;
            font-size: 0.9rem;
        }

        .status-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.5px;
        }

        .status-success {
            background: rgba(52, 211, 153, 0.2);
            color: #065f46;
        }

        .status-partial {
            background: rgba(251, 191, 36, 0.2);
            color: #92400e;
        }

        .status-failed {
            background: rgba(239, 68, 68, 0.2);
            color: #991b1b;
        }

        .content {
            padding: 2rem;
        }

        .summary-section {
            background: #f9fafb;
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-top: 1rem;
        }

        .summary-card {
            background: white;
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }

        .summary-card .value {
            font-size: 2rem;
            font-weight: 700;
            color: #667eea;
        }

        .summary-card .label {
            color: #6b7280;
            font-size: 0.875rem;
            margin-top: 0.25rem;
        }

        .section {
            margin-bottom: 2rem;
        }

        .section h2 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            color: #111827;
        }

        .timeline {
            position: relative;
            padding-left: 2rem;
        }

        .timeline::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #e5e7eb;
        }

        .timeline-item {
            position: relative;
            padding-bottom: 1.5rem;
        }

        .timeline-item::before {
            content: '';
            position: absolute;
            left: -2.25rem;
            top: 0.5rem;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #667eea;
            border: 2px solid white;
            box-shadow: 0 0 0 3px #e5e7eb;
        }

        .timeline-content {
            background: #f9fafb;
            border-radius: 8px;
            padding: 1rem;
            border: 1px solid #e5e7eb;
        }

        .timeline-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.5rem;
        }

        .timeline-title {
            font-weight: 600;
            color: #111827;
        }

        .timeline-time {
            font-size: 0.75rem;
            color: #6b7280;
        }

        .timeline-description {
            color: #4b5563;
            font-size: 0.875rem;
            margin-bottom: 0.5rem;
        }

        .timeline-details {
            background: white;
            border-radius: 4px;
            padding: 0.5rem;
            margin-top: 0.5rem;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.75rem;
            color: #6b7280;
            max-height: 200px;
            overflow-y: auto;
        }

        .data-grid {
            display: grid;
            gap: 1rem;
        }

        .data-card {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 1rem;
        }

        .data-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid #e5e7eb;
        }

        .data-source {
            font-weight: 600;
            color: #111827;
        }

        .data-type {
            background: #ede9fe;
            color: #5b21b6;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 500;
        }

        .data-content {
            background: white;
            border-radius: 4px;
            padding: 0.75rem;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.875rem;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .key-findings {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
            border-radius: 8px;
            padding: 1rem;
            border-left: 4px solid #667eea;
        }

        .key-findings ul {
            list-style: none;
            padding-left: 0;
        }

        .key-findings li {
            padding: 0.5rem 0;
            padding-left: 1.5rem;
            position: relative;
        }

        .key-findings li::before {
            content: '✓';
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: bold;
        }

        .footer {
            text-align: center;
            padding: 1.5rem;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 0.875rem;
        }

        .footer a {
            color: #667eea;
            text-decoration: none;
        }

        .footer a:hover {
            text-decoration: underline;
        }

        @media print {
            body {
                background: white;
                padding: 0;
            }

            .container {
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header Section -->
        <div class="header">
            <h1>📊 ${DEFAULT_REPORT_TITLE}</h1>
            <div class="task-description">${data.metadata.taskDescription}</div>
            <div class="metadata">
                <div>
                    <strong>Status:</strong>
                    <span class="status-badge status-${data.metadata.status}">${data.metadata.status}</span>
                </div>
                <div><strong>Started:</strong> ${formatDate(data.metadata.startTime)}</div>
                <div><strong>Ended:</strong> ${formatDate(data.metadata.endTime)}</div>
                <div><strong>Duration:</strong> ${formatDuration(data.metadata.duration)}</div>
                <div><strong>Task ID:</strong> ${data.metadata.taskId}</div>
            </div>
        </div>

        <!-- Content Section -->
        <div class="content">
            <!-- Summary Section -->
            <div class="summary-section">
                <h2>📈 Execution Summary</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="value">${data.summary.totalSteps}</div>
                        <div class="label">Total Steps</div>
                    </div>
                    <div class="summary-card">
                        <div class="value">${data.summary.toolsUsed.length}</div>
                        <div class="label">Tools Used</div>
                    </div>
                    <div class="summary-card">
                        <div class="value">${data.summary.sitesVisited.length}</div>
                        <div class="label">Sites Visited</div>
                    </div>
                    <div class="summary-card">
                        <div class="value">${data.summary.dataPoints}</div>
                        <div class="label">Data Points</div>
                    </div>
                </div>
            </div>

            <!-- Key Findings -->
            ${data.summary.keyFindings.length > 0 ? `
            <div class="section">
                <h2>🎯 Key Findings</h2>
                <div class="key-findings">
                    <ul>
                        ${data.summary.keyFindings.map(finding => `<li>${finding}</li>`).join('')}
                    </ul>
                </div>
            </div>
            ` : ''}

            <!-- Execution Timeline -->
            <div class="section">
                <h2>⚡ Execution Timeline</h2>
                <div class="timeline">
                    ${data.executionSteps.map((step, index) => `
                    <div class="timeline-item">
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <div class="timeline-title">Step ${step.stepNumber}: ${step.toolName}</div>
                                <div class="timeline-time">${formatDate(step.timestamp)}</div>
                            </div>
                            <div class="timeline-description">${step.action}</div>
                            ${step.result ? `
                            <div class="timeline-details">
                                <strong>Result:</strong> ${typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>

            <!-- Extracted Data -->
            ${data.extractedData.length > 0 ? `
            <div class="section">
                <h2>💎 Extracted Data</h2>
                <div class="data-grid">
                    ${data.extractedData.map((item, index) => `
                    <div class="data-card">
                        <div class="data-card-header">
                            <div class="data-source">${item.source}</div>
                            <div class="data-type">${item.dataType}</div>
                        </div>
                        ${item.url ? `<div style="color: #6b7280; font-size: 0.875rem; margin-bottom: 0.5rem;">📍 ${item.url}</div>` : ''}
                        <div class="data-content">${typeof item.data === 'string' ? item.data : JSON.stringify(item.data, null, 2)}</div>
                    </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Sites Visited -->
            ${data.summary.sitesVisited.length > 0 ? `
            <div class="section">
                <h2>🌐 Sites Visited</h2>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${data.summary.sitesVisited.map(site => `
                    <span style="background: #f3f4f6; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem;">
                        ${site}
                    </span>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>

        <!-- Footer -->
        <div class="footer">
            Generated by <a href="https://github.com/nxtscape/BrowserOS-agent" target="_blank">Nxtscape Browser Agent</a>
            • ${formatDate(new Date())}
        </div>
    </div>
</body>
</html>`
}

// Save report to file
async function saveReport(htmlContent: string, taskId: string): Promise<string> {
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const filename = `report-${taskId}-${timestamp}.html`

  // For Chrome extension, we'll create a blob URL and return it
  const blob = new Blob([htmlContent], { type: 'text/html' })
  const blobUrl = URL.createObjectURL(blob)

  Logging.log('ReportTool', `Report generated with ID: ${filename}`, 'info')

  return blobUrl
}

// Open report in browser
async function openInBrowser(context: ExecutionContext, blobUrl: string): Promise<void> {
  try {
    // Open blob URL in new tab using Chrome API
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      await chrome.tabs.create({ url: blobUrl })
      Logging.log('ReportTool', `Report opened in new tab`, 'info')
    } else {
      // Fallback: try to use window.open
      window.open(blobUrl, '_blank')
      Logging.log('ReportTool', `Report opened via window.open`, 'info')
    }
  } catch (error) {
    Logging.log('ReportTool', `Failed to open report in browser: ${error}`, 'warning')
  }
}