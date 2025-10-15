/**
 * HTML report template utilities
 * Modular, flexible design supporting LLM customization
 */

// Data visualization types
export type DataVisualization = 'table' | 'cards' | 'comparison-matrix' | 'list' | 'auto'

// Custom section positioning
export type SectionPosition = 'before-metrics' | 'after-metrics' | 'after-timeline' | 'after-actions' | 'after-results' | 'before-footer'

// Report types for preset templates
export type ReportType = 'default' | 'comparison' | 'research' | 'extraction' | 'analysis'

export interface ReportData {
  taskDescription: string  // The original task
  timestamp: string  // When the report was generated
  actionsPerformed: string[]  // List of actions taken
  dataExtracted?: Record<string, any>  // Structured data collected
  findings?: string  // Key insights or summary
  additionalSections?: ReportSection[]  // Custom sections added by LLM (legacy)
  executionDetails?: ExecutionDetail[]  // Detailed execution timeline
  metrics?: ExecutionMetrics  // Performance metrics

  // New: Enhanced customization options
  customSections?: CustomSection[]  // Custom sections with positioning
  layoutPreferences?: LayoutPreferences  // Layout customization
  customStyles?: string  // Custom CSS to inject
  reportType?: ReportType  // Preset template type
}

export interface ReportSection {
  title: string  // Section heading
  content: string  // HTML content for the section
}

export interface CustomSection {
  position: SectionPosition  // Where to insert this section
  title: string  // Section heading
  content: string  // HTML content (can include custom markup)
  priority?: number  // Order priority if multiple sections at same position (higher = first)
}

export interface LayoutPreferences {
  dataVisualization?: DataVisualization  // How to display extracted data
  showTimeline?: boolean  // Whether to show execution timeline
  highlightMetrics?: boolean  // Emphasize performance metrics
  compactMode?: boolean  // Use more compact spacing
  sectionsToHide?: ('metrics' | 'timeline' | 'actions' | 'findings')[]  // Sections to skip
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

// Professional report CSS - clean, modern design
const BASE_CSS = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.7;
    color: #1f2937;
    background: #f9fafb;
    padding: 0;
    margin: 0;
  }

  .report-container {
    max-width: 1000px;
    margin: 0 auto;
    background: #ffffff;
    min-height: 100vh;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .report-header {
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: white;
    padding: 3rem 3rem 2rem 3rem;
    border-bottom: 4px solid #1e3a8a;
  }

  h1 {
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 0.75rem;
    color: white;
    letter-spacing: -0.025em;
  }

  .subtitle {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 0;
    font-weight: 400;
  }

  .report-content {
    padding: 3rem;
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-top: 3rem;
    margin-bottom: 1.25rem;
    color: #111827;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e5e7eb;
    letter-spacing: -0.025em;
  }

  h2:first-child {
    margin-top: 0;
  }

  h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 2rem;
    margin-bottom: 1rem;
    color: #374151;
  }

  .task-box {
    background: #f0f9ff;
    padding: 1.5rem;
    border-radius: 0.5rem;
    border-left: 4px solid #3b82f6;
    margin-bottom: 2rem;
    font-size: 1.05rem;
    line-height: 1.8;
  }

  .section-content {
    margin-bottom: 2rem;
  }

  ul {
    list-style: none;
    padding: 0;
    background: #fafafa;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  li {
    padding: 0.75rem 0;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.95rem;
    line-height: 1.6;
  }

  li:last-child {
    border-bottom: none;
  }

  li:before {
    content: "▸";
    color: #3b82f6;
    font-weight: bold;
    display: inline-block;
    width: 1.5em;
    margin-right: 0.5rem;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 1.5rem 0;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  th, td {
    padding: 1rem 1.25rem;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }

  th {
    background: linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%);
    font-weight: 600;
    font-size: 0.9rem;
    color: #111827;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    border-bottom: 2px solid #d1d5db;
  }

  td {
    font-size: 0.95rem;
    color: #374151;
    background: white;
  }

  tr:hover td {
    background: #f9fafb;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .summary-box {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 2px solid #86efac;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin: 2rem 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .summary-box strong {
    color: #065f46;
    font-size: 1.1rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .summary-box p {
    color: #047857;
    line-height: 1.7;
    margin-top: 0.5rem;
  }

  .footer {
    background: #f9fafb;
    margin-top: 0;
    padding: 2rem 3rem;
    border-top: 2px solid #e5e7eb;
    text-align: center;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .footer a {
    color: #3b82f6;
    text-decoration: none;
    font-weight: 500;
  }

  .footer a:hover {
    text-decoration: underline;
  }

  .execution-timeline {
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin: 1.5rem 0;
  }

  .timeline-item {
    display: flex;
    gap: 1.25rem;
    padding: 1rem 0;
    border-bottom: 1px solid #e5e7eb;
  }

  .timeline-item:last-child {
    border-bottom: none;
  }

  .timeline-time {
    font-size: 0.8rem;
    color: #6b7280;
    min-width: 90px;
    font-weight: 500;
  }

  .timeline-content {
    flex: 1;
  }

  .timeline-tool {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
    font-size: 0.875rem;
    background: #dbeafe;
    color: #1e40af;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    display: inline-block;
    margin-right: 0.5rem;
    font-weight: 500;
  }

  .timeline-status {
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    display: inline-block;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .status-success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #86efac;
  }

  .status-failed {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .status-retry {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1.25rem;
    margin: 1.5rem 0;
  }

  .metric-card {
    background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
    padding: 1.5rem;
    border-radius: 0.5rem;
    text-align: center;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: #1e40af;
    margin-bottom: 0.5rem;
  }

  .metric-label {
    font-size: 0.8rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .tool-params {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 0.5rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
    background: #f9fafb;
    padding: 0.5rem;
    border-radius: 0.25rem;
  }

  .error-message {
    color: #dc2626;
    font-size: 0.8rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #fee2e2;
    border-left: 3px solid #dc2626;
    border-radius: 0.25rem;
  }

  .data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.25rem;
    margin: 1.5rem 0;
  }

  .data-card {
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.25rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .data-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  }

  .data-card-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    margin-bottom: 0.75rem;
  }

  .data-card-value {
    font-size: 1.125rem;
    color: #111827;
    line-height: 1.6;
  }

  pre {
    background: #1f2937;
    color: #f3f4f6;
    padding: 1rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  @media print {
    body {
      padding: 0;
      background: white;
    }
    .report-container {
      box-shadow: none;
    }
    .metric-card:hover {
      transform: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
  }
`;

/**
 * Get custom sections at a specific position
 */
function getCustomSectionsAt(sections: CustomSection[] | undefined, position: SectionPosition): string {
  if (!sections || sections.length === 0) return '';

  const sectionsAtPosition = sections
    .filter(s => s.position === position)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  if (sectionsAtPosition.length === 0) return '';

  return sectionsAtPosition.map(section => `
    <h2>${escapeHtml(section.title)}</h2>
    <div class="section-content">
      ${section.content}
    </div>
  `).join('\n');
}

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
    metrics,
    customSections,
    layoutPreferences,
    customStyles,
    reportType
  } = data;

  // Check layout preferences
  const layout = layoutPreferences || {};
  const shouldShowMetrics = !layout.sectionsToHide?.includes('metrics');
  const shouldShowTimeline = layout.showTimeline !== false && !layout.sectionsToHide?.includes('timeline');
  const shouldShowActions = !layout.sectionsToHide?.includes('actions');
  const shouldShowFindings = !layout.sectionsToHide?.includes('findings');

  // Build metrics section
  const metricsHtml = metrics && shouldShowMetrics ? generateMetricsSection(metrics, layout.highlightMetrics) : '';

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
  <div class="report-container">
    <div class="report-header">
      <h1>Task Execution Report</h1>
      <div class="subtitle">Generated on ${timestamp}</div>
    </div>

    <div class="report-content">
      <h2>Task Description</h2>
      <div class="task-box">${escapeHtml(taskDescription)}</div>

      ${metricsHtml}

      ${timelineHtml ? `
        <h2>Execution Timeline</h2>
        <div class="section-content">
          ${timelineHtml}
        </div>
      ` : ''}

      <h2>Actions Performed</h2>
      <div class="section-content">
        ${actionsHtml}
      </div>

      ${dataHtml ? `
        <h2>Data Extracted</h2>
        <div class="section-content">
          ${dataHtml}
        </div>
      ` : ''}
      ${noDataMessage ? `<div class="section-content">${noDataMessage}</div>` : ''}

      ${findingsHtml ? `
        <h2>Key Findings</h2>
        <div class="section-content">
          ${findingsHtml}
        </div>
      ` : ''}

      ${additionalHtml}
    </div>

    <div class="footer">
      Generated by <a href="https://github.com/BrowserOS-Agent/browseros" target="_blank">BrowserOS Agent</a> •
      Automated Web Intelligence Platform
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for extracted data section
 * Handles various data structures intelligently
 */
function generateDataSection(data: Record<string, any>): string {
  // Check if data is an array (table-like) - handles both objects and primitives
  if (Array.isArray(data) && data.length > 0) {
    return generateTableFromArray(data);
  }

  // Check for common data patterns
  const keys = Object.keys(data);

  // Pattern 1: Single array field (e.g., {items: [...]} or {products: [...]} or {comparison: [...]})
  if (keys.length === 1) {
    const firstKey = keys[0];
    if (Array.isArray(data[firstKey]) && data[firstKey].length > 0) {
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

  // Check if array contains primitive values (strings, numbers, booleans) vs objects
  const firstItem = data[0];
  const isPrimitive = typeof firstItem !== 'object' || firstItem === null;

  // Handle arrays of primitive values (strings, numbers, etc.)
  if (isPrimitive) {
    const rows = data.map((item, index) => {
      return `<tr><td>${index + 1}</td><td>${escapeHtml(String(item))}</td></tr>`;
    }).join('\n');

    return `
      <table class="data-table">
        <thead>
          <tr><th>#</th><th>Value</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  // Handle arrays of objects (existing logic)
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
