import { describe, it, expect, vi } from 'vitest'
import { createExtractTool } from './ExtractTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const MAIN_SECTION_TEXT_LINES = [
  'Product 1 - Premium Widget',
  'Price: $49.99',
  'Product 2 - Standard Widget',
  'Price: $29.99',
  'Product 3 - Budget Widget',
  'Price: $14.99',
  'Product 4 - Deluxe Gadget',
  'Price: $99.99',
  'Product 5 - Mini Gadget',
  'Price: $39.99'
]
const MAIN_SECTION_TEXT = MAIN_SECTION_TEXT_LINES.join('\n')
const NAV_TEXT = 'Home | Products | About | Contact'

const createLink = (text: string, url: string, isExternal = true) => ({
  text,
  url,
  isExternal
})

const NAVIGATION_LINKS = [
  createLink('Home', '/', false),
  createLink('Products', '/products', false),
  createLink('About', '/about', false),
  createLink('Contact', '/contact', false)
]

const PRODUCT_LINKS = [
  createLink('Premium Widget', 'https://sample.com/products/widget-premium'),
  createLink('Standard Widget', 'https://sample.com/products/widget-standard'),
  createLink('Budget Widget', 'https://sample.com/products/widget-budget'),
  createLink('Deluxe Gadget', 'https://sample.com/products/gadget-deluxe'),
  createLink('Mini Gadget', 'https://sample.com/products/gadget-mini')
]

const SAMPLE_ACCESSIBILITY_TREE = {
  rootId: 1,
  nodes: {
    '1': { id: 1, role: 'document', childIds: [2, 4, 6] },
    '2': { id: 2, role: 'header', childIds: [3] },
    '3': { id: 3, role: 'heading', name: 'Example Shop', childIds: [], attributes: { level: 1 } },
    '4': { id: 4, role: 'navigation', childIds: [5] },
    '5': { id: 5, role: 'link', name: 'Products', childIds: [] },
    '6': { id: 6, role: 'main', childIds: [7, 8, 9] },
    '7': { id: 7, role: 'heading', name: 'Featured Products', childIds: [], attributes: { level: 2 } },
    '8': { id: 8, role: 'staticText', name: 'Product 1 - Premium Widget', childIds: [] },
    '9': { id: 9, role: 'staticText', name: 'Price: $49.99', childIds: [] }
  }
}

const SAMPLE_TEXT_SNAPSHOT = {
  type: 'text',
  context: 'full',
  timestamp: 0,
  processingTimeMs: 4,
  sections: [
    {
      type: 'navigation',
      textResult: { text: NAV_TEXT, characterCount: NAV_TEXT.length },
      linksResult: { links: [] }
    },
    {
      type: 'main',
      textResult: { text: MAIN_SECTION_TEXT, characterCount: MAIN_SECTION_TEXT.length },
      linksResult: { links: [] }
    },
    {
      type: 'footer',
      textResult: { text: 'Copyright 2024 Example Shop', characterCount: 29 },
      linksResult: { links: [] }
    }
  ]
}

const SAMPLE_LINKS_SNAPSHOT = {
  type: 'links',
  context: 'full',
  timestamp: 0,
  processingTimeMs: 3,
  sections: [
    {
      type: 'navigation',
      linksResult: { links: NAVIGATION_LINKS },
      textResult: { text: NAV_TEXT, characterCount: NAV_TEXT.length }
    },
    {
      type: 'main',
      linksResult: { links: PRODUCT_LINKS },
      textResult: { text: MAIN_SECTION_TEXT, characterCount: MAIN_SECTION_TEXT.length }
    }
  ]
}

function createMockPage() {
  const page = {
    getLinksSnapshot: vi.fn().mockResolvedValue(clone(SAMPLE_LINKS_SNAPSHOT)),
    getTextSnapshot: vi.fn().mockResolvedValue(clone(SAMPLE_TEXT_SNAPSHOT)),
    getAccessibilityTree: vi.fn().mockResolvedValue(clone(SAMPLE_ACCESSIBILITY_TREE)),
    url: vi.fn(() => 'https://example.com/products'),
    title: vi.fn().mockResolvedValue('Example Shop - Products')
  }
  return page
}

describe('ExtractTool Integration Test', () => {
  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should extract product links from a page',
    async () => {
      const messageManager = new MessageManager()
      const browserContext = new BrowserContext()
      const abortController = new AbortController()
      const executionContext = new ExecutionContext({
        browserContext,
        messageManager,
        abortController,
        debugMode: false
      })

      const mockPage = createMockPage()
      browserContext.getPages = vi.fn().mockResolvedValue([mockPage as any])

      const extractTool = createExtractTool(executionContext)

      const result = await extractTool.func({
        task: 'Extract all product links from this page',
        tab_id: 1,
        extract_type: 'links'
      })

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(true)
      expect(parsed.output).toBeDefined()
      expect(typeof parsed.output.content).toBe('string')
      expect(typeof parsed.output.reasoning).toBe('string')
      expect(parsed.output.content).toContain('Premium Widget')
      expect(parsed.output.content).toContain('widget-premium')
      expect(parsed.output.content).toContain('## Main Content')
      expect(parsed.output.content).toContain('[Deluxe Gadget](https://sample.com/products/gadget-deluxe)')
      expect(mockPage.getAccessibilityTree).toHaveBeenCalled()
      expect(mockPage.getLinksSnapshot).toHaveBeenCalled()
      expect(mockPage.getTextSnapshot).toHaveBeenCalled()

      console.log('[extract-tool] links extraction test passed')
    },
    30000
  )

  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should extract prices from a page',
    async () => {
      const messageManager = new MessageManager()
      const browserContext = new BrowserContext()
      const abortController = new AbortController()
      const executionContext = new ExecutionContext({
        browserContext,
        messageManager,
        abortController,
        debugMode: false
      })

      const mockPage = createMockPage()
      browserContext.getPages = vi.fn().mockResolvedValue([mockPage as any])

      const extractTool = createExtractTool(executionContext)

      const result = await extractTool.func({
        task: 'Extract all product prices from this page',
        tab_id: 1,
        extract_type: 'text'
      })

      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(true)
      expect(parsed.output).toBeDefined()
      expect(parsed.output.content).toContain('$49.99')
      expect(parsed.output.content).toContain('$29.99')
      expect(parsed.output.content).toContain('$14.99')
      expect(parsed.output.content).toContain('## Main Content')
      expect(mockPage.getAccessibilityTree).toHaveBeenCalled()
      expect(mockPage.getTextSnapshot).toHaveBeenCalled()

      console.log('[extract-tool] text extraction test passed')
    },
    30000
  )
})
