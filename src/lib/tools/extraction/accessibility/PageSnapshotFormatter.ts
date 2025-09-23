import { BrowserPage } from '@/lib/browser/BrowserPage'
import {
  type AccessibilityTree,
  type AccessibilityNode,
  type LinkInfo,
  type SectionType,
  type SnapshotOptions,
} from '@/lib/browser/BrowserOSAdapter'
import { Logging } from '@/lib/utils/Logging'

const LOG_NAMESPACE = 'PageSnapshotFormatter'

const KNOWN_SECTION_TYPES: SectionType[] = [
  'main',
  'navigation',
  'footer',
  'header',
  'article',
  'aside',
  'complementary',
  'contentinfo',
  'form',
  'search',
  'region',
  'other'
]

const SECTION_TYPE_SET = new Set<string>(KNOWN_SECTION_TYPES)

const FALLBACK_SECTION_ORDER: SectionType[] = [
  'header',
  'navigation',
  'search',
  'form',
  'main',
  'article',
  'aside',
  'complementary',
  'region',
  'contentinfo',
  'footer',
  'other'
]

const SECTION_DISPLAY_NAMES: Record<SectionType, string> = {
  header: 'Header',
  navigation: 'Navigation',
  search: 'Search',
  form: 'Forms',
  main: 'Main Content',
  article: 'Article',
  aside: 'Aside',
  complementary: 'Complementary',
  region: 'Region',
  contentinfo: 'Content Info',
  footer: 'Footer',
  other: 'Other'
}

const LANDMARK_ROLE_TO_SECTION: Record<string, SectionType> = {
  banner: 'header',
  header: 'header',
  navigation: 'navigation',
  nav: 'navigation',
  search: 'search',
  form: 'form',
  main: 'main',
  article: 'article',
  complementary: 'complementary',
  aside: 'aside',
  region: 'region',
  contentinfo: 'contentinfo',
  footer: 'footer'
}

const MAX_PARAGRAPHS_PER_SECTION = 25
const MAX_PARAGRAPH_LENGTH = 600
const MAX_SECTION_TEXT_LENGTH = 10000
const MAX_LINKS_PER_SECTION = 80
const MAX_TOTAL_LINKS = 300

type SnapshotContextOption = SnapshotOptions['context']

interface HeadingInfo {
  text: string
  level?: number
}

export interface SectionContent {
  type: SectionType
  order: number
  paragraphs: string[]
  headings: HeadingInfo[]
  links: LinkInfo[]
}

export interface PageSnapshotMarkdown {
  markdown: string
  sections: SectionContent[]
}

export interface PageSnapshotOptions {
  context?: SnapshotContextOption
}

export async function buildPageSnapshotMarkdown(
  page: BrowserPage,
  meta: { title: string; url: string },
  options?: PageSnapshotOptions
): Promise<PageSnapshotMarkdown> {
  const snapshotOptions: SnapshotOptions | undefined = options?.context
    ? { context: options.context }
    : undefined

  const [textSnapshotResult, linksSnapshotResult, treeResult] = await Promise.allSettled([
    page.getTextSnapshot(snapshotOptions),
    page.getLinksSnapshot(snapshotOptions),
    page.getAccessibilityTree()
  ])

  const textSnapshot = textSnapshotResult.status === 'fulfilled' ? textSnapshotResult.value : null
  if (textSnapshotResult.status === 'rejected') {
    Logging.log(
      LOG_NAMESPACE,
      `Failed to load text snapshot: ${formatReason(textSnapshotResult.reason)}`,
      'warning'
    )
  }

  const linksSnapshot = linksSnapshotResult.status === 'fulfilled' ? linksSnapshotResult.value : null
  if (linksSnapshotResult.status === 'rejected') {
    Logging.log(
      LOG_NAMESPACE,
      `Failed to load links snapshot: ${formatReason(linksSnapshotResult.reason)}`,
      'warning'
    )
  }

  const accessibilityTree = treeResult.status === 'fulfilled' ? treeResult.value : null
  if (treeResult.status === 'rejected') {
    Logging.log(
      LOG_NAMESPACE,
      `Accessibility tree unavailable: ${formatReason(treeResult.reason)}`,
      'warning'
    )
  }

  const sections = new Map<SectionType, SectionContent>()

  if (textSnapshot?.sections?.length) {
    for (const snapshotSection of textSnapshot.sections) {
      const sectionType = normalizeSectionType(snapshotSection.type)
      const section = ensureSection(sections, sectionType)
      const paragraphs = limitParagraphs(extractParagraphs(snapshotSection.textResult?.text))
      if (paragraphs.length > 0) {
        section.paragraphs.push(...paragraphs)
      }
    }
  }

  if (linksSnapshot?.sections?.length) {
    for (const snapshotSection of linksSnapshot.sections) {
      const sectionType = normalizeSectionType(snapshotSection.type)
      const section = ensureSection(sections, sectionType)
      const links = snapshotSection.linksResult?.links ?? []
      for (const link of links) {
        if (!link.url && !link.text && !link.title) {
          continue
        }
        section.links.push(link)
      }
    }
  }

  applyLinkBudgets(sections)
  collectHeadingsFromTree(accessibilityTree, sections)

  const fallbackIndex = new Map<SectionType, number>()
  FALLBACK_SECTION_ORDER.forEach((type, index) => {
    fallbackIndex.set(type, KNOWN_SECTION_TYPES.length + index)
  })

  const orderedSections = Array.from(sections.values()).filter(
    section =>
      section.paragraphs.length > 0 || section.links.length > 0 || section.headings.length > 0
  )

  orderedSections.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : fallbackIndex.get(a.type) ?? Number.MAX_SAFE_INTEGER
    const orderB = Number.isFinite(b.order) ? b.order : fallbackIndex.get(b.type) ?? Number.MAX_SAFE_INTEGER
    return orderA - orderB
  })

  for (const section of orderedSections) {
    section.headings.sort((a, b) => {
      if (a.level === b.level) {
        return a.text.localeCompare(b.text)
      }
      if (a.level === undefined) return 1
      if (b.level === undefined) return -1
      return a.level - b.level
    })
  }

  const markdown = buildMarkdown(orderedSections, meta)

  return { markdown, sections: orderedSections }
}

function formatReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message
  }
  if (typeof reason === 'string') {
    return reason
  }
  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

function normalizeSectionType(value: string | undefined): SectionType {
  if (!value) {
    return 'other'
  }
  const normalized = value.toLowerCase()
  return SECTION_TYPE_SET.has(normalized) ? (normalized as SectionType) : 'other'
}

function ensureSection(
  sections: Map<SectionType, SectionContent>,
  type: SectionType
): SectionContent {
  let section = sections.get(type)
  if (!section) {
    section = {
      type,
      order: Number.POSITIVE_INFINITY,
      paragraphs: [],
      headings: [],
      links: []
    }
    sections.set(type, section)
  }
  return section
}

function extractParagraphs(rawText?: string): string[] {
  if (!rawText) {
    return []
  }
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ').trim()
  if (!normalized) {
    return []
  }
  return normalized
    .split(/\n{2,}/g)
    .map(segment => segment.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function limitParagraphs(paragraphs: string[]): string[] {
  const limited: string[] = []
  let total = 0
  for (const paragraph of paragraphs) {
    const truncated = truncateParagraph(paragraph)
    limited.push(truncated)
    total += truncated.length
    if (limited.length >= MAX_PARAGRAPHS_PER_SECTION || total >= MAX_SECTION_TEXT_LENGTH) {
      break
    }
  }
  return limited
}

function truncateParagraph(text: string): string {
  if (text.length <= MAX_PARAGRAPH_LENGTH) {
    return text
  }
  return `${text.slice(0, MAX_PARAGRAPH_LENGTH - 1).trimEnd()}…`
}

function collectHeadingsFromTree(
  tree: AccessibilityTree | null,
  sections: Map<SectionType, SectionContent>
): void {
  if (!tree) {
    return
  }

  const nodeMap = new Map<number, AccessibilityNode>()
  const parentMap = new Map<number, number>()

  Object.values(tree.nodes ?? {}).forEach(node => {
    nodeMap.set(node.id, node)
    for (const childId of node.childIds ?? []) {
      parentMap.set(childId, node.id)
    }
  })

  const visited = new Set<number>()
  let traversalIndex = 0

  const visit = (nodeId: number | undefined) => {
    if (typeof nodeId !== 'number' || visited.has(nodeId)) {
      return
    }

    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) {
      return
    }

    const sectionType = determineSectionForNode(nodeId, nodeMap, parentMap)
    const section = ensureSection(sections, sectionType)

    if (!Number.isFinite(section.order)) {
      section.order = traversalIndex
    }

    if (typeof node.role === 'string' && node.role.toLowerCase() === 'heading') {
      const text = (node.name ?? '').trim()
      if (text) {
        const level = headingLevelFromNode(node)
        section.headings.push({ text, level })
      }
    }

    traversalIndex += 1

    for (const childId of node.childIds ?? []) {
      visit(childId)
    }
  }

  visit(tree.rootId)

  for (const section of sections.values()) {
    section.headings = dedupeHeadings(section.headings)
  }
}

function headingLevelFromNode(node: AccessibilityNode): number | undefined {
  const attributes = node.attributes ?? {}
  const candidate =
    attributes.level ??
    attributes['aria-level'] ??
    attributes['ariaLevel'] ??
    attributes['headingLevel'] ??
    attributes['hierarchicalLevel']
  const level = Number(candidate)
  return Number.isFinite(level) && level > 0 ? Math.round(level) : undefined
}

function dedupeHeadings(headings: HeadingInfo[]): HeadingInfo[] {
  const seen = new Set<string>()
  const result: HeadingInfo[] = []

  for (const heading of headings) {
    const textKey = heading.text.trim().toLowerCase()
    if (!textKey) {
      continue
    }
    const key = `${heading.level ?? 'x'}|${textKey}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(heading)
  }

  return result
}

function applyLinkBudgets(sections: Map<SectionType, SectionContent>): void {
  let remaining = MAX_TOTAL_LINKS

  for (const section of sections.values()) {
    if (remaining <= 0) {
      section.links = []
      continue
    }

    const deduped = dedupeLinks(section.links)
    const allowed = Math.min(MAX_LINKS_PER_SECTION, remaining)
    section.links = deduped.slice(0, allowed)
    remaining -= section.links.length
  }
}

function dedupeLinks(links: LinkInfo[]): LinkInfo[] {
  const seen = new Set<string>()
  const result: LinkInfo[] = []

  for (const link of links) {
    const url = (link.url ?? '').trim().toLowerCase()
    const text = (link.text ?? '').trim().toLowerCase()
    const title = (link.title ?? '').trim().toLowerCase()
    const key = `${url}|${text}|${title}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(link)
  }

  return result
}

function determineSectionForNode(
  nodeId: number,
  nodeMap: Map<number, AccessibilityNode>,
  parentMap: Map<number, number>
): SectionType {
  let current: number | undefined = nodeId
  const guard = new Set<number>()

  while (typeof current === 'number' && !guard.has(current)) {
    guard.add(current)
    const node = nodeMap.get(current)
    if (!node) {
      break
    }

    const role = (node.role ?? '').toLowerCase()
    const mapped = LANDMARK_ROLE_TO_SECTION[role]
    if (mapped) {
      return mapped
    }

    current = parentMap.get(current)
  }

  return 'main'
}

function buildMarkdown(sections: SectionContent[], meta: { title: string; url: string }): string {
  const lines: string[] = []
  const title = meta.title?.trim() || '(untitled)'

  lines.push('# Page Snapshot')
  lines.push(`- Title: ${title}`)
  lines.push(`- URL: ${meta.url}`)

  if (sections.length === 0) {
    return lines.join('\n')
  }

  lines.push('')

  sections.forEach((section, index) => {
    const sectionLines: string[] = []
    sectionLines.push(`## ${sectionDisplayName(section.type)}`)

    if (section.headings.length) {
      sectionLines.push('### Headings')
      section.headings.forEach(heading => {
        const prefix = heading.level ? `H${heading.level}` : 'Heading'
        sectionLines.push(`- ${prefix}: ${heading.text}`)
      })
    }

    if (section.paragraphs.length) {
      sectionLines.push('### Text')
      section.paragraphs.forEach((paragraph, paragraphIndex) => {
        sectionLines.push(paragraph)
        if (paragraphIndex < section.paragraphs.length - 1) {
          sectionLines.push('')
        }
      })
    }

    if (section.links.length) {
      sectionLines.push('### Links')
      section.links.forEach(link => {
        sectionLines.push(formatLink(link))
      })
    }

    lines.push(...sectionLines)

    if (index < sections.length - 1) {
      lines.push('')
    }
  })

  return lines.join('\n')
}

function sectionDisplayName(type: SectionType): string {
  return SECTION_DISPLAY_NAMES[type] ?? type
}

function formatLink(link: LinkInfo): string {
  const url = (link.url ?? '').trim()
  const text = (link.text ?? '').trim()
  const title = (link.title ?? '').trim()
  const label = text || title || url || '(untitled link)'

  const metaParts: string[] = []
  if (title && title !== text) {
    metaParts.push(`title: ${title}`)
  }
  if (link.isExternal) {
    metaParts.push('external')
  }

  const meta = metaParts.length ? ` (${metaParts.join(', ')})` : ''
  return url ? `- [${label}](${url})${meta}` : `- ${label}${meta}`
}
