// Prompt templates for ExtractTool

export function generateExtractorSystemPrompt(): string {
  return `You are an intelligent web content extractor working from a structured markdown snapshot of a web page that was built from the browser accessibility tree.

Instructions:
1. Use the provided sections (Header, Navigation, Main Content, etc.) and headings to orient yourself and locate relevant details.
2. Extract only the information requested in the task; avoid copying entire sections verbatim when a concise summary is sufficient.
3. Preserve factual accuracy for numbers, names, and quotes; rewrite or organize content only when it improves clarity.
4. When the task involves links, include the link text and destination URL, noting whether it appears external if that metadata is provided.
5. Keep your reasoning to 2-3 precise sentences that reference the sections or headings you consulted and explain how the output satisfies the task.
6. If the requested information is not present in the snapshot, state that explicitly without speculating.

Output Format:
- content: Your extracted/summarized/rephrased output based on the task
- reasoning: Explain what you did, which sections you consulted, and why the result satisfies the task (2-3 sentences).
`
}

export function generateExtractorTaskPrompt(
  task: string,
  extractType: 'links' | 'text',
  structuredSnapshot: string,
  pageInfo: { url: string; title: string }
): string {
  const focusHint = extractType === 'links'
    ? 'links and their surrounding context (link text + destination)'
    : 'textual content, key facts, and any supporting headings';

  return `Task: ${task}

Page Information:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}
- Primary Focus: ${focusHint}

Structured Page Snapshot (Markdown):
${structuredSnapshot}

Use the snapshot to extract only what the task requires. Reference the relevant sections or headings when helpful, and keep the answer precise and accurate.`
}
