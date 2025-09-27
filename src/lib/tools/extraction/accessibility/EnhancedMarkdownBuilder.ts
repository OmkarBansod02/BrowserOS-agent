import { type SectionContent } from './PageSnapshotFormatter'
import { type LinkInfo } from '@/lib/browser/BrowserOSAdapter'

/**
 * Enhanced markdown builder that produces more semantic, readable output
 * while maintaining compatibility with existing PageSnapshotFormatter architecture
 */

interface LinkReference {
  id: number
  text: string
  url: string
}

/**
 * Enhanced buildMarkdown function that creates Comet-style clean output
 * This produces clean, readable markdown similar to Comet browser
 */
export function buildEnhancedMarkdown(
  sections: SectionContent[], 
  meta: { title: string; url: string }
): string {
  const lines: string[] = []
  let contentAdded = false

  // Use actual page title instead of generic "Page Snapshot"
  const title = meta.title?.trim() || '(untitled)'
  lines.push(`# ${title}`)
  lines.push('')

  if (sections.length === 0) {
    lines.push('No content could be extracted from this page.')
    return lines.join('\n')
  }

  // Process sections in priority order for cleaner output
  const prioritizedSections = prioritizeSections(sections)
  
  for (const section of prioritizedSections) {
    const sectionContent = buildCleanSection(section)
    
    if (sectionContent.trim()) {
      if (contentAdded) {
        lines.push('')  // Add spacing between sections
      }
      lines.push(sectionContent)
      contentAdded = true
    }
  }

  // Clean up final output
  return lines.join('\n').trim()
}

/**
 * Prioritize sections for better content flow (like Comet)
 */
function prioritizeSections(sections: SectionContent[]): SectionContent[] {
  const priority: Record<string, number> = {
    main: 1,
    article: 2,
    navigation: 3,
    aside: 4,
    header: 5,
    footer: 6,
    other: 7
  }
  
  return [...sections].sort((a, b) => {
    const priorityA = priority[a.type] || 99
    const priorityB = priority[b.type] || 99
    return priorityA - priorityB
  })
}

/**
 * Build clean section content (Comet-style)
 */
function buildCleanSection(section: SectionContent): string {
  const parts: string[] = []
  
  // For navigation, create a simple inline link list (but filter out noise)
  if (section.type === 'navigation') {
    const navLinks = section.links
      .filter(link => link.url && link.text && link.text.length < 50) // Filter out long titles
      .filter(link => !isBoilerplateLink(link.text))
      .map(link => `[${link.text}](${cleanUrl(link.url || '#')})`)
      .join(' ')
    
    if (navLinks) {
      parts.push(navLinks)
    }
    return parts.join('\n')
  }
  
  // For main content, focus on the actual article content
  if (section.type === 'main' || section.type === 'article') {
    // Filter and add meaningful headings only
    const meaningfulHeadings = section.headings.filter(h => 
      h.text && 
      h.text.length > 3 && 
      h.text.length < 200 &&
      !isBoilerplateText(h.text)
    )
    
    meaningfulHeadings.forEach(heading => {
      const level = Math.min(heading.level || 2, 6)
      parts.push(`${'#'.repeat(level)} ${heading.text}`)
      parts.push('')
    })
    
    // Filter paragraphs to focus on main content (not boilerplate)
    const meaningfulParagraphs = section.paragraphs.filter(p => 
      p && 
      p.length > 10 && 
      p.length < 2000 &&
      !isBoilerplateText(p) &&
      !p.match(/^(©|Copyright|Terms|Privacy|Cookie|Footer|Header)/i)
    )
    
    meaningfulParagraphs.forEach((paragraph, index) => {
      // Clean up the paragraph text
      const cleanParagraph = cleanParagraphText(paragraph)
      if (cleanParagraph.length > 10) {
        parts.push(cleanParagraph)
        if (index < meaningfulParagraphs.length - 1) {
          parts.push('')
        }
      }
    })
    
    // Add only meaningful links (not navigation clutter)
    const meaningfulLinks = section.links.filter(link => 
      link.url && 
      link.text &&
      link.text.length > 3 &&
      link.text.length < 100 &&
      !isBoilerplateLink(link.text) &&
      !link.url.includes('privacy') &&
      !link.url.includes('terms') &&
      !link.url.includes('cookie')
    )
    
    if (meaningfulLinks.length > 0 && meaningfulLinks.length < 10) {
      if (parts.length > 0) parts.push('')
      meaningfulLinks.forEach(link => {
        parts.push(`[${link.text}](${cleanUrl(link.url)})`)
      })
    }
    
    return parts.join('\n')
  }
  
  // Skip other sections if they're likely boilerplate (footer, etc.)
  if (section.type === 'footer' || section.type === 'header') {
    return ''
  }
  
  // For other meaningful sections, minimal formatting
  const meaningfulContent = section.paragraphs.filter(p => 
    p && p.length > 20 && !isBoilerplateText(p)
  )
  
  if (meaningfulContent.length === 0) return ''
  
  // Only add section heading for substantial non-main content
  if (meaningfulContent.length > 1) {
    parts.push(`## ${getSectionDisplayName(section.type)}`)
    parts.push('')
  }
  
  meaningfulContent.forEach(paragraph => {
    const cleanParagraph = cleanParagraphText(paragraph)
    if (cleanParagraph.length > 10) {
      parts.push(cleanParagraph)
      parts.push('')
    }
  })
  
  return parts.join('\n').trim()
}

/**
 * Get display name for section (matches existing logic)
 */
function getSectionDisplayName(type: string): string {
  const displayNames: Record<string, string> = {
    header: 'Header',
    navigation: 'Navigation',
    search: 'Search',
    main: 'Main Content',
    article: 'Article', 
    aside: 'Sidebar',
    complementary: 'Sidebar',
    footer: 'Footer',
    other: 'Other Content'
  }
  return displayNames[type] || type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Clean URLs by removing tracking parameters
 */
function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'ref', 'referrer', '_ga', 'mc_cid', 'mc_eid',
      'si', 'igshid', 'feature'
    ]
    
    for (const param of trackingParams) {
      urlObj.searchParams.delete(param)
    }
    
    return urlObj.toString()
  } catch {
    return url // Return original if URL parsing fails
  }
}

/**
 * Check if text is likely boilerplate content
 */
function isBoilerplateText(text: string): boolean {
  const boilerplatePatterns = [
    /^(©|Copyright|Terms|Privacy|Cookie|Footer|Header|Navigation)/i,
    /^(All rights reserved|About us|Contact us|Help|Support)/i,
    /^(Facebook|Twitter|LinkedIn|Instagram|Youtube|Social)/i,
    /^(\d{4}\s*[-–]\s*\d{4}|\d{4})\s+(Copyright|©)/i,
    /^(Skip to|Jump to|Go to|Back to top)/i,
    /^(More info|Learn more|Read more|See all|View all)$/i,
    /^(Search|Filter|Sort|Menu|Toggle)/i
  ]
  
  return boilerplatePatterns.some(pattern => pattern.test(text.trim()))
}

/**
 * Check if link text is likely navigation or boilerplate
 */
function isBoilerplateLink(text: string): boolean {
  const boilerplateLinks = [
    /^(Home|About|Contact|Privacy|Terms|Cookies|Help|Support|FAQ)$/i,
    /^(Login|Sign up|Register|Subscribe|Newsletter)$/i,
    /^(Facebook|Twitter|LinkedIn|Instagram|Youtube)$/i,
    /^(©|Copyright|All rights reserved)/i,
    /^(Skip|Jump|Go to|Back to)/i,
    /^(More|See all|View all|Read more)$/i
  ]
  
  return boilerplateLinks.some(pattern => pattern.test(text.trim()))
}

/**
 * Clean and improve paragraph text
 */
function cleanParagraphText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s*[•·▸▪▫]\s*/gm, '- ') // Convert bullet points
    .replace(/^\s*\d+\.\s*/gm, (match, offset) => {
      // Keep numbered lists but clean them
      return match.replace(/\s+/g, ' ')
    })
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
    .trim()
}

/**
 * Format a single link (fallback for existing code compatibility)
 */
export function formatLinkEnhanced(link: LinkInfo): string {
  const text = link.text || 'Link'
  const url = link.url || '#'
  
  if (url === '#') {
    return `**${text}**` // Non-functional link
  }
  
  return `[${text}](${cleanUrl(url)})`
}
