import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { toolError } from '@/lib/tools/Tool.interface'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { generateExtractorSystemPrompt, generateExtractorTaskPrompt } from './ExtractTool.prompt'
import { buildPageSnapshotMarkdown } from './accessibility/PageSnapshotFormatter'
import { invokeWithRetry } from '@/lib/utils/retryable'
import { PubSub } from '@/lib/pubsub'
import { TokenCounter } from '@/lib/utils/TokenCounter'
import { Logging } from '@/lib/utils/Logging'

// Input schema for extraction
const ExtractInputSchema = z.object({
  task: z.string(),  // What to extract (e.g., "Extract all product prices")
  tab_id: z.number(),  // Tab ID to extract from
  extract_type: z.enum(['links', 'text'])  // Type of content to extract
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
    name: 'extract_tool',
    description: 'Extract specific information from a web page using AI. Supports extracting text or links based on a task description.',
    schema: ExtractInputSchema,
    func: async (args: ExtractInput): Promise<string> => {
      try {
        executionContext.getPubSub().publishMessage(PubSub.createMessage(`Extracting information from page ${args.tab_id}`, 'thinking'))
        // Get the page for the specified tab
        const pages = await executionContext.browserContext.getPages([args.tab_id])
        if (!pages || pages.length === 0) {
          return JSON.stringify(toolError(`Tab ${args.tab_id} not found`))
        }
        
        const page = pages[0]
        
        // Get page metadata
        const url = page.url()
        const title = await page.title()

        const { markdown: structuredSnapshot } = await buildPageSnapshotMarkdown(
          page,
          { url, title },
          { context: 'full' }
        )

        const contentForLLM = structuredSnapshot.trim().length > 0
          ? structuredSnapshot
          : 'No structured content available for extraction.'

        // Get LLM instance
        const llm = await executionContext.getLLM({temperature: 0.1})
        
        // Generate prompts
        const systemPrompt = generateExtractorSystemPrompt()
        const taskPrompt = generateExtractorTaskPrompt(
          args.task,
          args.extract_type,
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

        executionContext.getPubSub().publishMessage(PubSub.createMessage(`Extracted ${args.extract_type} from page ${title}, generated summary...`, 'thinking'))
        
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




