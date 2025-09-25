import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createReportTool } from './ReportTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import BrowserContext from '@/lib/browser/BrowserContext'
import { AIMessage, ToolMessage } from '@langchain/core/messages'

describe('ReportTool', () => {
  let mockContext: ExecutionContext
  let mockMessageManager: MessageManager
  let mockBrowserContext: BrowserContext

  beforeEach(() => {
    // Create mock browser context
    mockBrowserContext = {
      getCurrentUrl: vi.fn().mockReturnValue('https://example.com'),
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue(undefined),
        tabId: 123
      })
    } as any

    // Create real message manager
    mockMessageManager = new MessageManager()

    // Create mock execution context
    mockContext = {
      executionId: 'test-execution-123',
      messageManager: mockMessageManager,
      browserContext: mockBrowserContext,
      getCurrentTask: vi.fn().mockReturnValue('Compare prices of iPhone 17'),
      getExecutionMetrics: vi.fn().mockReturnValue({
        toolCalls: 5,
        observations: 3,
        errors: 0,
        startTime: Date.now() - 30000,
        endTime: Date.now(),
        toolFrequency: new Map([
          ['navigation_tool', 3],
          ['extract_tool', 2]
        ])
      })
    } as any
  })

  it('tests that the ReportTool can be created with required context', () => {
    const tool = createReportTool(mockContext)
    expect(tool).toBeDefined()
    expect(tool.name).toBe('report_tool')
    expect(tool.description).toContain('HTML report')
  })

  it('tests that the ReportTool handles errors gracefully', async () => {
    // Make getCurrentTask throw an error
    mockContext.getCurrentTask = vi.fn().mockImplementation(() => {
      throw new Error('Failed to get task')
    })

    const tool = createReportTool(mockContext)
    const result = await tool.func({
      includeScreenshots: false,
      openInBrowser: false
    })

    const parsedResult = JSON.parse(result)
    expect(parsedResult.ok).toBe(false)
    expect(parsedResult.output).toContain('Failed to generate report')
  })

  it('tests that the ReportTool collects execution data from messages', async () => {
    // Add some messages with tool calls
    const aiMessage = new AIMessage({
      content: 'Navigating to website',
      tool_calls: [
        {
          id: 'call_1',
          name: 'navigation_tool',
          args: { url: 'https://amazon.com' }
        }
      ]
    })

    const toolMessage = new ToolMessage({
      content: JSON.stringify({ ok: true, output: 'Navigation successful' }),
      tool_call_id: 'call_1'
    })

    mockMessageManager.add(aiMessage)
    mockMessageManager.add(toolMessage)

    const tool = createReportTool(mockContext)
    const result = await tool.func({
      includeScreenshots: false,
      openInBrowser: false
    })

    const parsedResult = JSON.parse(result)
    expect(parsedResult.ok).toBe(true)
    expect(parsedResult.output).toContain('Report generated successfully')
  })
})