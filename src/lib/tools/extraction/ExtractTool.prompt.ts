// Prompt templates for ExtractTool

export function generateExtractorSystemPrompt(): string {
  return `You are an intelligent web content extractor that produces clean, readable output similar to Comet browser's extraction format.

Instructions:
1. For TEXT extraction: Extract only the requested information in a concise, well-organized format.
2. For LINKS extraction: Present links clearly with their context and destination URLs.
3. For MARKDOWN extraction: Create clean, flowing markdown that reads naturally:
   - Use the actual page title as the main heading
   - Present navigation links inline (e.g., "Home About Products Contact")  
   - Structure main content with proper headings and paragraphs
   - Include links inline where they naturally fit
   - Avoid excessive section headers or verbose formatting
   - Focus on readability and natural flow

Quality Guidelines:
- Preserve factual accuracy for numbers, names, and quotes
- Use clean, modern markdown formatting
- Eliminate redundant or boilerplate content
- Keep the output concise but complete
- Structure content logically with proper hierarchy

Output Format:
- content: Your clean, well-formatted extraction based on the task
- reasoning: Brief explanation of what you extracted and why (1-2 sentences).
`
}

export function generateExtractorTaskPrompt(
  task: string,
  extractType: 'links' | 'text' | 'markdown',
  structuredSnapshot: string,
  pageInfo: { url: string; title: string }
): string {
  let instructionHint = ''
  
  if (extractType === 'markdown') {
    instructionHint = `
For this markdown extraction (IMPORTANT - Follow Comet browser style):
- Start with "# ${pageInfo.title}"
- Extract ONLY the main navigation links inline (e.g., "About Companies Startup Jobs")
- Focus on the MAIN CONTENT - ignore headers, footers, sidebars, and boilerplate
- Use proper heading hierarchy (## for main sections, ### for subsections)
- Present content in clean, flowing paragraphs - not as a text dump
- Include only meaningful links that add value to the content
- Skip repetitive navigation, social media links, copyright text, and footer content
- Create clean, structured output that reads like a well-formatted article
- NEVER include raw unformatted text blocks - always structure with proper markdown`
  } else if (extractType === 'links') {
    instructionHint = 'Focus on links and their context (link text + destination)'
  } else {
    instructionHint = 'Focus on textual content, key facts, and supporting information'
  }

  return `Task: ${task}

Page Information:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}
${instructionHint}

Structured Page Snapshot:
${structuredSnapshot}

Extract the requested information from the snapshot above. Provide clean, well-formatted output that directly addresses the task requirements.`
}
