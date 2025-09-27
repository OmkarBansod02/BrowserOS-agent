import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolError } from '@/lib/tools/Tool.interface'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { generateExtractorSystemPrompt, generateExtractorTaskPrompt } from './ExtractTool.prompt'
import { buildPageSnapshotMarkdown } from './accessibility/PageSnapshotFormatter'
import { buildEnhancedPageSnapshotMarkdown } from './accessibility/PageSnapshotEnhancer'
import { invokeWithRetry } from '@/lib/utils/retryable'
import { PubSub } from '@/lib/pubsub'
import { TokenCounter } from '@/lib/utils/TokenCounter'
import { Logging } from '@/lib/utils/Logging'

/**
 * Convert flat text from getHierarchicalText() to structured markdown
 * Since the accessibility tree returns flat text, we need to intelligently structure it
 */
function convertFlatTextToMarkdown(flatText: string, pageTitle: string): string {
  const lines = flatText.split('\n').filter(line => line.trim())
  if (lines.length === 0) {
    return '# Page Content\n\nNo content could be extracted from this page.'
  }

  const result: string[] = []
  result.push(`# ${pageTitle}`)
  result.push('')
  
  // Since the accessibility tree returns flat text, we need to intelligently group and structure it
  const navigationTerms = ['home', 'features', 'use cases', 'faq', 'about', 'contact', 'login', 'sign up']
  const meaningfulContent: string[] = []
  let navigation: string[] = []
  
  // First pass: separate navigation from content
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) continue
    
    // Skip obvious noise
    if (isBoilerplateText(trimmed) || 
        trimmed.includes('logo') || 
        trimmed.includes('icon') ||
        trimmed.match(/^(Plus Icon|email icon|github logo)$/i)) {
      continue
    }
    
    // Check if it's navigation
    const isNav = navigationTerms.some(term => 
      trimmed.toLowerCase() === term || 
      trimmed.toLowerCase().includes(term)
    )
    
    if (isNav && trimmed.length < 50) {
      navigation.push(trimmed)
    } else if (trimmed.length > 10) {
      meaningfulContent.push(trimmed)
    }
  }
  
  // Add navigation section
  if (navigation.length > 0) {
    result.push(`**Navigation:** ${navigation.slice(0, 8).join(' • ')}`)
    result.push('')
  }
  
  // Process meaningful content and try to identify sections
  let currentSection = ''
  for (let i = 0; i < meaningfulContent.length; i++) {
    const content = meaningfulContent[i]
    
    // Look for section headers (longer content that might be headers)
    if (content.length > 30 && content.length < 200 && 
        (content.includes('BrowserOS') || content.includes('AI') || content.includes('Open Source'))) {
      
      // Check if this looks like a tagline or description
      if (content.toLowerCase().includes('browser') && content.toLowerCase().includes('ai')) {
        result.push('## About')
        result.push(content)
        result.push('')
        continue
      }
    }
    
    // Look for feature sections
    if (content.toLowerCase().includes('local ai agent') || 
        content.toLowerCase().includes('build agents')) {
      result.push('## Features')
      result.push('')
      result.push('### Local AI Agent')
      result.push(content)
      result.push('')
      continue
    }
    
    if (content.toLowerCase().includes('split view') ||
        content.toLowerCase().includes('chatgpt, claude')) {
      result.push('### Split View')
      result.push(content)
      result.push('')
      continue
    }
    
    if (content.toLowerCase().includes('integrations') ||
        content.toLowerCase().includes('mcp server')) {
      result.push('### Integrations')
      result.push(content)
      result.push('')
      continue
    }
    
    // Add other meaningful content
    if (content.length > 20 && !isBoilerplateText(content)) {
      result.push(content)
      result.push('')
    }
  }
  
  return result.join('\n').replace(/\n\n\n+/g, '\n\n').trim()
}

/**
 * Check if text is likely boilerplate/navigation
 */
function isBoilerplateText(text: string): boolean {
  const boilerplatePatterns = [
    /^(Skip to|Jump to|Menu|Toggle|Search|Filter|Sort)/i,
    /^(Home|About|Contact|Privacy|Terms|Cookies|Help|Support)$/i,
    /^(Login|Sign up|Register|Subscribe)$/i,
    /^(Facebook|Twitter|LinkedIn|Instagram|Youtube)$/i,
    /^(©|Copyright|All rights reserved)/i,
    /^(More|See all|View all|Read more)$/i,
    /^\d+$/, // Just numbers
    /^[A-Z]{2,}$/ // All caps short words (likely labels)
  ]
  
  return boilerplatePatterns.some(pattern => pattern.test(text.trim()))
}

/**
 * Check if text looks like a heading
 */
function isLikelyHeading(text: string): boolean {
  return text.length < 100 && 
         text.length > 3 &&
         !text.includes('.') &&
         !text.includes(',') &&
         (text[0] === text[0].toUpperCase())
}

/**
 * Check if text looks like a list item
 */
function isLikelyListItem(text: string): boolean {
  return text.length < 200 && 
         (text.includes('•') || 
          text.includes('-') ||
          /^\d+\./.test(text) ||
          text.split(' ').length < 15)
}

// Input schema for extraction - matches what NewAgent expects: extract(format, task)
const ExtractInputSchema = z.object({
  format: z.enum(['links', 'text', 'markdown']).describe('Format type for extraction - use "markdown" for clean structured content'),  // Type of content to extract
  task: z.string().describe('What to extract (e.g., "Extract all product prices", "Get page content as markdown")')  // What to extract
})

// Output schema for extracted data
const ExtractedDataSchema = z.object({
  content: z.string(),  // The LLM's extracted/summarized/rephrased output
  reasoning: z.string()  // LLM's explanation of what it did, found, and created
})

type ExtractInput = z.infer<typeof ExtractInputSchema>
type ExtractedData = z.infer<typeof ExtractedDataSchema>

// Factory function to create ExtractTool
export function createExtractTool(executionContext: ExecutionContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'extract',
    description: 'Extract specific information from a web page using AI. Supports extracting text, links, or semantic markdown based on a task description. Use "markdown" for clean, structured content with proper sections (navigation, main, footer).',
    schema: ExtractInputSchema,
    func: async (args: ExtractInput): Promise<string> => {
      try {
        executionContext.getPubSub().publishMessage(PubSub.createMessage(`Extracting ${args.format} content: ${args.task}`, 'thinking'))
        
        // Get current page from context (no tab_id needed)
        const page = await executionContext.browserContext.getCurrentPage()
        if (!page) {
          return JSON.stringify(toolError(`No active page found`))
        }
        
        // Get page metadata
        const url = page.url()
        const title = await page.title()

        // Choose formatter based on extraction type
        let structuredSnapshot: string
        
        if (args.format === 'markdown') {
          // Use the SAME approach as Chat Mode for clean, structured output
          executionContext.getPubSub().publishMessage(PubSub.createMessage(`Using hierarchical text extraction (same as Chat Mode)`, 'thinking'))
          
          // Get the flat text from accessibility tree  
          const flatText = await page.getHierarchicalText()
          
          // Convert flat text to structured markdown
          const structuredMarkdown = convertFlatTextToMarkdown(flatText, title)
          
          executionContext.getPubSub().publishMessage(PubSub.createMessage(`Generated structured markdown (${structuredMarkdown.length} chars)`, 'thinking'))
          
          // Return properly structured markdown
          return JSON.stringify({
            ok: true,
            output: {
              content: structuredMarkdown,
              reasoning: `Extracted page content using accessibility tree and converted flat text to structured markdown with proper sections and headings.`
            }
          })
        } else {
          // Use your existing formatter for text/links extraction
          executionContext.getPubSub().publishMessage(PubSub.createMessage(`Using standard extraction with accessibility tree integration`, 'thinking'))
          
          const result = await buildPageSnapshotMarkdown(
            page,
            { url, title },
            { context: 'full' }
          )
          structuredSnapshot = result.markdown
        }

        const contentForLLM = structuredSnapshot.trim().length > 0
          ? structuredSnapshot
          : 'No structured content available for extraction.'
          
        Logging.log('ExtractTool', `Generated ${args.format} content: ${structuredSnapshot.length} chars`, 'info')

        // Get LLM instance
        const llm = await executionContext.getLLM({temperature: 0.1})
        
        // Generate prompts
        const systemPrompt = generateExtractorSystemPrompt()
        const taskPrompt = generateExtractorTaskPrompt(
          args.task,
          args.format,
          contentForLLM,
          { url, title }
        )
        
        // Prepare messages for LLM
        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage(taskPrompt)
        ]
        
        // Log token count
        const tokenCount = TokenCounter.countMessages(messages)
        Logging.log('ExtractTool', `Invoking LLM with ${TokenCounter.format(tokenCount)}`, 'info')
        
        // Get structured response from LLM with retry logic
        const structuredLLM = llm.withStructuredOutput(ExtractedDataSchema)
        const extractedData = await invokeWithRetry<ExtractedData>(
          structuredLLM,
          messages,
          3
        )

        executionContext.getPubSub().publishMessage(PubSub.createMessage(`Extracted ${args.format} from page ${title}, generated summary...`, 'thinking'))
        
        // Return success result
        return JSON.stringify({
          ok: true,
          output: extractedData
        })
      } catch (error) {
        // Handle error
        const errorMessage = error instanceof Error ? error.message : String(error)
        executionContext.getPubSub().publishMessage(
          PubSub.createMessageWithId(PubSub.generateId('ToolError'), `Extraction failed: ${errorMessage}`, 'error')
        )
        return JSON.stringify(toolError(errorMessage))  // Return raw error
      }
    }
  })
}




