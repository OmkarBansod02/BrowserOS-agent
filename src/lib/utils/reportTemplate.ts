/**
 * HTML report template utilities
 * Simple, clean design matching BrowserOS aesthetic
 */

export interface ReportData {
  taskDescription: string  // The original task
  timestamp: string  // When the report was generated
  actionsPerformed: string[]  // List of actions taken
  dataExtracted?: Record<string, any>  // Structured data collected
  findings?: string  // Key insights or summary
  additionalSections?: ReportSection[]  // Custom sections added by LLM
  executionDetails?: ExecutionDetail[]  // Detailed execution timeline
  metrics?: ExecutionMetrics  // Performance metrics
}

export interface ReportSection {
  title: string  // Section heading
  content: string  // HTML content for the section
}

export interface ExecutionDetail {
  timestamp: string  // When this step occurred
  action: string  // What action was taken
  tool: string  // Tool used (navigate, click, extract, etc.)
  parameters?: Record<string, any>  // Tool parameters
  result: 'success' | 'failed' | 'retry'  // Outcome
  duration?: string  // Time taken
  error?: string  // Error message if failed
  retryCount?: number  // Number of retries
}

export interface ExecutionMetrics {
  totalDuration: string  // Total execution time
  toolsUsed: number  // Number of tool calls
  successRate: string  // Percentage of successful actions
  retries: number  // Total retry attempts
  pagesVisited: number  // Number of pages navigated
}

// Minimal CSS - matches BrowserOS clean aesthetic
const BASE_CSS = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #111827;
    background: #ffffff;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  h1 {
    font-size: 1.875rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    color: #111827;
  }

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 2rem;
    margin-bottom: 1rem;
    color: #111827;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 0.5rem;
  }

  .subtitle {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 2rem;
  }

  .task-box {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.375rem;
    border-left: 3px solid #2563eb;
    margin-bottom: 1.5rem;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  li:last-child {
    border-bottom: none;
  }

  li:before {
    content: "•";
    color: #2563eb;
    font-weight: bold;
    display: inline-block;
    width: 1em;
    margin-right: 0.5rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border: 1px solid #e5e7eb;
  }

  th {
    background: #f9fafb;
    font-weight: 600;
    font-size: 0.875rem;
    color: #111827;
  }

  td {
    font-size: 0.875rem;
    color: #374151;
  }

  tr:hover {
    background: #f9fafb;
  }

  .summary-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 0.375rem;
    padding: 1rem;
    margin-top: 1rem;
  }

  .summary-box strong {
    color: #166534;
  }

  .footer {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .footer a {
    color: #2563eb;
    text-decoration: none;
  }

  .footer a:hover {
    text-decoration: underline;
  }

  .execution-timeline {
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
    margin-top: 1rem;
  }

  .timeline-item {
    display: flex;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .timeline-item:last-child {
    border-bottom: none;
  }

  .timeline-time {
    font-size: 0.75rem;
    color: #6b7280;
    min-width: 80px;
  }

  .timeline-content {
    flex: 1;
  }

  .timeline-tool {
    font-family: monospace;
    font-size: 0.875rem;
    background: #e5e7eb;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    display: inline-block;
    margin-right: 0.5rem;
  }

  .timeline-status {
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    display: inline-block;
  }

  .status-success {
    background: #d1fae5;
    color: #065f46;
  }

  .status-failed {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-retry {
    background: #fef3c7;
    color: #92400e;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .metric-card {
    background: #f9fafb;
    padding: 0.75rem;
    border-radius: 0.375rem;
    text-align: center;
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
  }

  .metric-label {
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
  }

  .tool-params {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.25rem;
    font-family: monospace;
  }

  .error-message {
    color: #dc2626;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  @media print {
    body {
      padding: 0;
    }
  }
`;

/**
 * Generate complete HTML report from data
 */
export function generateReport(data: ReportData): string {
  const {
    taskDescription,
    timestamp,
    actionsPerformed,
    dataExtracted,
    findings,
    additionalSections,
    executionDetails,
    metrics
  } = data;

  // Build metrics section
  const metricsHtml = metrics ? generateMetricsSection(metrics) : '';

  // Build execution timeline
  const timelineHtml = executionDetails && executionDetails.length > 0
    ? generateTimelineSection(executionDetails)
    : '';

  // Build actions list
  const actionsHtml = actionsPerformed.length > 0
    ? `<ul>${actionsPerformed.map(action => `<li>${escapeHtml(action)}</li>`).join('')}</ul>`
    : '<p style="color: #6b7280;">No actions were performed.</p>';

  // Build data section
  const dataHtml = dataExtracted
    ? generateDataSection(dataExtracted)
    : '';

  // Build findings section
  const findingsHtml = findings
    ? `<div class="summary-box"><strong>Summary:</strong><br>${escapeHtml(findings)}</div>`
    : '';

  // Build additional sections
  const additionalHtml = additionalSections && additionalSections.length > 0
    ? additionalSections.map(section => `
        <h2>${escapeHtml(section.title)}</h2>
        ${section.content}
      `).join('\n')
    : '';

  // Show "No data" message only if there's no data AND no additional sections
  const hasData = dataExtracted || (additionalSections && additionalSections.length > 0);
  const noDataMessage = !hasData ? '<p style="color: #6b7280;">No data was extracted.</p>' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report: ${escapeHtml(taskDescription.substring(0, 50))}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <h1>Task Report</h1>
  <div class="subtitle">${timestamp}</div>

  <h2>Task</h2>
  <div class="task-box">${escapeHtml(taskDescription)}</div>

  ${metricsHtml}

  ${timelineHtml ? `
    <h2>Execution Timeline</h2>
    ${timelineHtml}
  ` : ''}

  <h2>Actions Summary</h2>
  ${actionsHtml}

  ${dataHtml ? `<h2>Results</h2>${dataHtml}` : ''}
  ${noDataMessage}

  ${findingsHtml ? `<h2>Summary</h2>${findingsHtml}` : ''}

  ${additionalHtml}

  <div class="footer">
    Generated by <a href="https://github.com/BrowserOS-Agent/browseros" target="_blank">BrowserOS Agent</a>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for extracted data section
 * Handles various data structures intelligently
 */
function generateDataSection(data: Record<string, any>): string {
  // Check if data is an array of objects (table-like)
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    return generateTableFromArray(data);
  }

  // Check for common data patterns
  const keys = Object.keys(data);

  // Pattern 1: Single array field (e.g., {items: [...]} or {products: [...]} or {comparison: [...]})
  if (keys.length === 1) {
    const firstKey = keys[0];
    if (Array.isArray(data[firstKey]) && data[firstKey].length > 0 && typeof data[firstKey][0] === 'object') {
      return generateTableFromArray(data[firstKey]);
    }
  }

  // Pattern 2: Multiple arrays (show each as separate table)
  const arrayFields = keys.filter(key => Array.isArray(data[key]) && data[key].length > 0);
  if (arrayFields.length > 0) {
    const tables = arrayFields.map(key => {
      const title = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      return `<h3 style="margin-top: 1.5rem; font-size: 1rem; font-weight: 600;">${escapeHtml(title)}</h3>
              ${generateTableFromArray(data[key])}`;
    }).join('\n');

    // Add any non-array fields as cards
    const nonArrayFields = keys.filter(key => !Array.isArray(data[key]));
    if (nonArrayFields.length > 0) {
      const nonArrayData = Object.fromEntries(nonArrayFields.map(key => [key, data[key]]));
      return tables + '\n' + generateGridCards(nonArrayData);
    }

    return tables;
  }

  // For simple key-value pairs, use grid cards
  return generateGridCards(data);
}

/**
 * Generate table HTML from array of objects
 */
function generateTableFromArray(data: any[]): string {
  if (data.length === 0) return '<p style="color: var(--muted);">No data available.</p>';

  const keys = Object.keys(data[0]);
  const headers = keys.map(key => `<th>${escapeHtml(key)}</th>`).join('\n');
  const rows = data.map(item => {
    const cells = keys.map(key => `<td>${escapeHtml(String(item[key] ?? '-'))}</td>`).join('\n');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `
    <table class="data-table">
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Generate grid cards for key-value data
 */
function generateGridCards(data: Record<string, any>): string {
  const cards = Object.entries(data).map(([key, value]) => {
    const displayValue = typeof value === 'object'
      ? `<pre>${JSON.stringify(value, null, 2)}</pre>`
      : `<div class="data-card-value">${escapeHtml(String(value))}</div>`;

    return `
      <div class="data-card">
        <div class="data-card-title">${escapeHtml(key)}</div>
        ${displayValue}
      </div>
    `;
  }).join('\n');

  return `<div class="data-grid">${cards}</div>`;
}

/**
 * Generate metrics section HTML
 */
function generateMetricsSection(metrics: ExecutionMetrics): string {
  return `
    <h2>Performance Metrics</h2>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${metrics.totalDuration}</div>
        <div class="metric-label">Total Duration</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${metrics.toolsUsed}</div>
        <div class="metric-label">Tools Used</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${metrics.successRate}</div>
        <div class="metric-label">Success Rate</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${metrics.pagesVisited}</div>
        <div class="metric-label">Pages Visited</div>
      </div>
      ${metrics.retries > 0 ? `
        <div class="metric-card">
          <div class="metric-value">${metrics.retries}</div>
          <div class="metric-label">Retries</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Generate execution timeline HTML
 */
function generateTimelineSection(details: ExecutionDetail[]): string {
  const timelineItems = details.map(detail => {
    const statusClass = `status-${detail.result}`;
    const paramsHtml = detail.parameters
      ? `<div class="tool-params">Parameters: ${escapeHtml(JSON.stringify(detail.parameters, null, 2))}</div>`
      : '';
    const errorHtml = detail.error
      ? `<div class="error-message">Error: ${escapeHtml(detail.error)}</div>`
      : '';
    const retryHtml = detail.retryCount && detail.retryCount > 0
      ? ` (Retry ${detail.retryCount})`
      : '';

    return `
      <div class="timeline-item">
        <div class="timeline-time">${escapeHtml(detail.timestamp)}</div>
        <div class="timeline-content">
          <div>
            <span class="timeline-tool">${escapeHtml(detail.tool)}</span>
            <span class="timeline-status ${statusClass}">${detail.result}${retryHtml}</span>
            ${detail.duration ? `<span style="margin-left: 0.5rem; font-size: 0.75rem; color: #6b7280;">(${detail.duration})</span>` : ''}
          </div>
          <div style="margin-top: 0.25rem;">${escapeHtml(detail.action)}</div>
          ${paramsHtml}
          ${errorHtml}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="execution-timeline">${timelineItems}</div>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
