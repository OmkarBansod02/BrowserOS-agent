import React, { useState } from 'react'
import { cn } from '@/sidepanel/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MarkdownContent } from './shared/Markdown'

interface ThinkingSectionProps {
  content: string
  isLatest?: boolean  // For shimmer effect
  className?: string
}

/**
 * ThinkingSection component - minimalistic thinking display like Windsurf/Cursor
 * Simple, clean design without heavy blocks
 */
export function ThinkingSection({ content, isLatest = false, className }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)  // Default collapsed for minimal UI

  return (
    <div className={cn('w-full', className)}>
      {/* Minimal Thinking Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 w-full py-1 px-2 rounded transition-colors duration-200',
          'hover:bg-muted/20 text-left group'
        )}
      >
        <div className="flex items-center gap-2 flex-1">
          {/* Minimal status indicator */}
          {isLatest ? (
            <div className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
          ) : (
            <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full" />
          )}
          
          {/* Simple title */}
          <span className="text-xs text-muted-foreground font-normal">
            {isLatest ? 'Thinking...' : 'Thinking'}
          </span>
        </div>

        {/* Minimal expand/collapse icon */}
        <div className="text-muted-foreground/50 transition-transform duration-200">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </div>
      </button>

      {/* Minimal Thinking Content */}
      {isExpanded && (
        <div className="mt-1 ml-4 pl-2 border-l border-border/20">
          {isLatest ? (
            // Latest thinking with subtle shimmer
            <div className="relative">
              <MarkdownContent
                content={content}
                className="break-words text-xs text-muted-foreground/80"
                compact={true}
              />
              {/* Minimal shimmer effect */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-background/10 to-transparent animate-shimmer bg-[length:200%_100%]" />
            </div>
          ) : (
            // Regular thinking content
            <MarkdownContent
              content={content}
              className="break-words text-xs text-muted-foreground/80"
              compact={true}
            />
          )}
        </div>
      )}
    </div>
  )
}
