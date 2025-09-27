import { buildPageSnapshotMarkdown, type PageSnapshotOptions } from './PageSnapshotFormatter'
import { buildEnhancedMarkdown } from './EnhancedMarkdownBuilder'
import { type BrowserPage } from '@/lib/browser/BrowserPage'
import { type SnapshotContext } from '@/lib/browser/BrowserOSAdapter'

/**
 * Enhanced page snapshot options
 */
export interface EnhancedPageSnapshotOptions extends PageSnapshotOptions {
  enhancedMarkdown?: boolean  // Use enhanced semantic markdown format
}

/**
 * Enhanced buildPageSnapshotMarkdown that can use improved formatting
 * This is a drop-in replacement for your existing function with optional enhancements
 */
export async function buildEnhancedPageSnapshotMarkdown(
  page: BrowserPage,
  meta: { title: string; url: string },
  options?: EnhancedPageSnapshotOptions
) {
  // Use your existing implementation to get the structured data
  const result = await buildPageSnapshotMarkdown(page, meta, options)
  
  // If enhanced markdown is requested, use the enhanced builder
  if (options?.enhancedMarkdown) {
    const enhancedMarkdown = buildEnhancedMarkdown(result.sections, meta)
    return {
      ...result,
      markdown: enhancedMarkdown
    }
  }
  
  // Otherwise return your existing format
  return result
}

/**
 * Quick helper for enhanced extraction
 */
export async function buildSemanticMarkdown(
  page: BrowserPage,
  meta: { title: string; url: string }
) {
  return buildEnhancedPageSnapshotMarkdown(page, meta, {
    context: 'full',
    enhancedMarkdown: true
  })
}
