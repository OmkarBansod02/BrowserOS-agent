/**
 * HTML report template utilities
 * Component-based system: simple for small models, flexible for big models
 */

// Component types that LLM can use to build reports
export type ComponentType =
  | 'summary'      // High-level summary box
  | 'metrics'      // Performance metrics grid
  | 'timeline'     // Execution timeline
  | 'actions'      // List of actions
  | 'data-table'   // Tabular data
  | 'data-cards'   // Key-value cards
  | 'findings'     // Key insights/summary
  | 'custom'       // Custom HTML content

export interface ReportComponent {
  type: ComponentType  // Component type
  title?: string  // Optional section title
  content: any  // Component data (varies by type)
  order?: number  // Display order (lower = earlier, default = order of array)
  style?: 'default' | 'compact' | 'highlighted'  // Optional style variant
}

export interface ReportData {
  taskDescription: string  // The original task
  timestamp: string  // When the report was generated

  // Component-based structure (LLM builds report from these)
  components?: ReportComponent[]  // Flexible component list

  // Legacy fields (backward compatibility)
  actionsPerformed?: string[]
  dataExtracted?: Record<string, any> | any[]
  findings?: string
  additionalSections?: ReportSection[]
  executionDetails?: ExecutionDetail[]
  metrics?: ExecutionMetrics
}

// Legacy interfaces for backward compatibility
export interface ReportSection {
  title: string
  content: string
}

export interface ExecutionDetail {
  timestamp: string
  action: string
  tool: string
  parameters?: Record<string, any>
  result: 'success' | 'failed' | 'retry'
  duration?: string
  error?: string
  retryCount?: number
}

export interface ExecutionMetrics {
  totalDuration: string
  toolsUsed: number
  successRate: string
  retries: number
  pagesVisited: number
}

// Clean, minimal CSS - professional report aesthetic
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
    overflow: hidden;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #f3f4f6;
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

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover {
    background: #f9fafb;
  }

  .summary-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-left: 3px solid #22c55e;
    border-radius: 0.375rem;
    padding: 1rem;
    margin: 1rem 0;
  }

  .summary-box strong {
    color: #166534;
    display: block;
    margin-bottom: 0.5rem;
  }

  .summary-box.highlighted {
    background: #eff6ff;
    border-color: #93c5fd;
    border-left-color: #3b82f6;
  }

  .summary-box.highlighted strong {
    color: #1e40af;
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
    margin: 1rem 0;
  }

  .execution-timeline.compact {
    padding: 0.5rem;
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
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.875rem;
    background: #e5e7eb;
    color: #374151;
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
    margin: 1rem 0;
  }

  .metrics-grid.compact {
    gap: 0.5rem;
  }

  .metric-card {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.375rem;
    text-align: center;
    border: 1px solid #e5e7eb;
  }

  .metric-card.highlighted {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
    margin-bottom: 0.25rem;
  }

  .metric-label {
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
  }

  .data-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
  }

  .data-card-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .data-card-value {
    font-size: 0.875rem;
    color: #111827;
    word-break: break-word;
  }

  .tool-params {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.25rem;
    font-family: 'SF Mono', Monaco, monospace;
    background: #f9fafb;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .error-message {
    color: #dc2626;
    font-size: 0.75rem;
    margin-top: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: #fee2e2;
    border-radius: 0.25rem;
  }

  pre {
    background: #f9fafb;
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.875rem;
    border: 1px solid #e5e7eb;
  }

  code {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.875rem;
  }

  @media print {
    body {
      padding: 0;
    }
  }
`;

/**
 * Generate complete HTML report from data
 * Supports both component-based (new) and legacy (old) formats
 */
export function generateReport(data: ReportData): string {
  const { taskDescription, timestamp } = data;

  let componentsHtml: string;

  // Component-based mode (new)
  if (data.components && data.components.length > 0) {
    componentsHtml = generateFromComponents(data.components);
  }
  // Legacy mode (backward compatibility)
  else {
    componentsHtml = generateFromLegacyData(data);
  }

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
  <div class="subtitle">${escapeHtml(timestamp)}</div>

  <h2>Task</h2>
  <div class="task-box">${escapeHtml(taskDescription)}</div>

  ${componentsHtml}

  <div class="footer">
    Generated by <a href="https://github.com/BrowserOS-Agent/browseros" target="_blank">BrowserOS Agent</a>
  </div>
</body>
</html>`;
}

/**
 * Generate report content from components (new approach)
 */
function generateFromComponents(components: ReportComponent[]): string {
  // Sort by order if specified
  const sortedComponents = [...components].sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });

  return sortedComponents.map(component => {
    const title = component.title ? `<h2>${escapeHtml(component.title)}</h2>` : '';
    const style = component.style || 'default';

    switch (component.type) {
      case 'summary':
        return `${title}${generateSummaryComponent(component.content, style)}`;

      case 'metrics':
        return `${title}${generateMetricsComponent(component.content, style)}`;

      case 'timeline':
        return `${title}${generateTimelineComponent(component.content, style)}`;

      case 'actions':
        return `${title}${generateActionsComponent(component.content)}`;

      case 'data-table':
        return `${title}${generateDataTableComponent(component.content)}`;

      case 'data-cards':
        return `${title}${generateDataCardsComponent(component.content)}`;

      case 'findings':
        return `${title}${generateFindingsComponent(component.content, style)}`;

      case 'custom':
        return `${title}<div class="custom-content">${component.content}</div>`;

      default:
        return '';
    }
  }).join('\n');
}

/**
 * Generate report content from legacy data (backward compatibility)
 */
function generateFromLegacyData(data: ReportData): string {
  const sections: string[] = [];

  // Metrics
  if (data.metrics) {
    sections.push(`<h2>Performance Metrics</h2>${generateMetricsComponent(data.metrics, 'default')}`);
  }

  // Execution Timeline
  if (data.executionDetails && data.executionDetails.length > 0) {
    sections.push(`<h2>Execution Timeline</h2>${generateTimelineComponent(data.executionDetails, 'default')}`);
  }

  // Actions Summary
  if (data.actionsPerformed && data.actionsPerformed.length > 0) {
    sections.push(`<h2>Actions Summary</h2>${generateActionsComponent(data.actionsPerformed)}`);
  }

  // Data Extracted
  if (data.dataExtracted) {
    sections.push(`<h2>Results</h2>${generateDataSection(data.dataExtracted)}`);
  }

  // Findings
  if (data.findings) {
    sections.push(`<h2>Summary</h2>${generateFindingsComponent(data.findings, 'default')}`);
  }

  // Additional Sections
  if (data.additionalSections && data.additionalSections.length > 0) {
    data.additionalSections.forEach(section => {
      sections.push(`<h2>${escapeHtml(section.title)}</h2>${section.content}`);
    });
  }

  return sections.join('\n');
}

// ========== Component Generators ==========

function generateSummaryComponent(content: string, style: string): string {
  const styleClass = style === 'highlighted' ? ' highlighted' : '';
  return `<div class="summary-box${styleClass}"><strong>Summary</strong>${escapeHtml(content)}</div>`;
}

function generateMetricsComponent(metrics: ExecutionMetrics, style: string): string {
  const styleClass = style === 'compact' ? ' compact' : '';
  const cardClass = style === 'highlighted' ? ' highlighted' : '';

  return `
    <div class="metrics-grid${styleClass}">
      <div class="metric-card${cardClass}">
        <div class="metric-value">${escapeHtml(metrics.totalDuration)}</div>
        <div class="metric-label">Total Duration</div>
      </div>
      <div class="metric-card${cardClass}">
        <div class="metric-value">${metrics.toolsUsed}</div>
        <div class="metric-label">Tools Used</div>
      </div>
      <div class="metric-card${cardClass}">
        <div class="metric-value">${escapeHtml(metrics.successRate)}</div>
        <div class="metric-label">Success Rate</div>
      </div>
      <div class="metric-card${cardClass}">
        <div class="metric-value">${metrics.pagesVisited}</div>
        <div class="metric-label">Pages Visited</div>
      </div>
      ${metrics.retries > 0 ? `
        <div class="metric-card${cardClass}">
          <div class="metric-value">${metrics.retries}</div>
          <div class="metric-label">Retries</div>
        </div>
      ` : ''}
    </div>
  `;
}

function generateTimelineComponent(details: ExecutionDetail[], style: string): string {
  const styleClass = style === 'compact' ? ' compact' : '';

  const timelineItems = details.map(detail => {
    const statusClass = `status-${detail.result}`;
    const paramsHtml = detail.parameters
      ? `<div class="tool-params">${escapeHtml(JSON.stringify(detail.parameters))}</div>`
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
            <span class="timeline-status ${statusClass}">${escapeHtml(detail.result)}${retryHtml}</span>
            ${detail.duration ? `<span style="margin-left: 0.5rem; font-size: 0.75rem; color: #6b7280;">(${escapeHtml(detail.duration)})</span>` : ''}
          </div>
          <div style="margin-top: 0.25rem;">${escapeHtml(detail.action)}</div>
          ${paramsHtml}
          ${errorHtml}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="execution-timeline${styleClass}">${timelineItems}</div>`;
}

function generateActionsComponent(actions: string[]): string {
  if (actions.length === 0) {
    return '<p style="color: #6b7280;">No actions were performed.</p>';
  }

  return `<ul>${actions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}</ul>`;
}

function generateDataTableComponent(data: any[]): string {
  return generateTableFromArray(data);
}

function generateDataCardsComponent(data: Record<string, any>): string {
  return generateGridCards(data);
}

function generateFindingsComponent(content: string, style: string): string {
  const styleClass = style === 'highlighted' ? ' highlighted' : '';
  return `<div class="summary-box${styleClass}"><strong>Key Findings</strong>${escapeHtml(content)}</div>`;
}

// ========== Data Handling Functions ==========

function generateDataSection(data: Record<string, any> | any[]): string {
  // Array of objects -> table
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === 'object') {
      return generateTableFromArray(data);
    }
    // Array of primitives -> simple list
    return `<ul>${data.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`;
  }

  // Type guard: data is now Record<string, any>
  if (typeof data !== 'object' || data === null) {
    return '<p style="color: #6b7280;">No data available.</p>';
  }

  const keys = Object.keys(data);
  const dataRecord = data as Record<string, any>;

  // Single array field -> table
  if (keys.length === 1 && Array.isArray(dataRecord[keys[0]]) && dataRecord[keys[0]].length > 0) {
    return generateTableFromArray(dataRecord[keys[0]]);
  }

  // Multiple arrays -> separate tables
  const arrayFields = keys.filter(key => Array.isArray(dataRecord[key]) && dataRecord[key].length > 0);
  if (arrayFields.length > 0) {
    const tables = arrayFields.map(key => {
      const title = formatFieldName(key);
      return `<h3 style="margin-top: 1.5rem; font-size: 1rem; font-weight: 600;">${escapeHtml(title)}</h3>
              ${generateTableFromArray(dataRecord[key])}`;
    }).join('\n');

    const nonArrayFields = keys.filter(key => !Array.isArray(dataRecord[key]));
    if (nonArrayFields.length > 0) {
      const nonArrayData = Object.fromEntries(nonArrayFields.map(key => [key, dataRecord[key]]));
      return tables + '\n' + generateGridCards(nonArrayData);
    }

    return tables;
  }

  // Simple key-value pairs -> cards
  return generateGridCards(dataRecord);
}

function generateTableFromArray(data: any[]): string {
  if (data.length === 0) {
    return '<p style="color: #6b7280;">No data available.</p>';
  }

  // Primitives -> simple 2-column table
  if (typeof data[0] !== 'object') {
    const rows = data.map((item, index) => {
      return `<tr><td>${index + 1}</td><td>${escapeHtml(String(item))}</td></tr>`;
    }).join('\n');

    return `
      <table>
        <thead>
          <tr><th>#</th><th>Value</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  // Objects -> full table
  const keys = Object.keys(data[0]);
  const headers = keys.map(key => `<th>${escapeHtml(formatFieldName(key))}</th>`).join('');
  const rows = data.map(item => {
    const cells = keys.map(key => {
      const value = item[key];
      const displayValue = value === null || value === undefined ? '-' : String(value);
      return `<td>${escapeHtml(displayValue)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `
    <table>
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function generateGridCards(data: Record<string, any>): string {
  const cards = Object.entries(data).map(([key, value]) => {
    let displayValue: string;

    if (value === null || value === undefined) {
      displayValue = '<span style="color: #6b7280;">-</span>';
    } else if (typeof value === 'object') {
      displayValue = `<pre><code>${escapeHtml(JSON.stringify(value, null, 2))}</code></pre>`;
    } else {
      displayValue = `<div class="data-card-value">${escapeHtml(String(value))}</div>`;
    }

    return `
      <div class="data-card">
        <div class="data-card-title">${escapeHtml(formatFieldName(key))}</div>
        ${displayValue}
      </div>
    `;
  }).join('\n');

  return `<div class="data-grid">${cards}</div>`;
}

// ========== Utility Functions ==========

function formatFieldName(name: string): string {
  // Convert camelCase or snake_case to Title Case
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

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
