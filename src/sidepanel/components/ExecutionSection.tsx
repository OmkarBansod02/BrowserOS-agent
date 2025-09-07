import React, { useState } from 'react'
import { cn } from '@/sidepanel/lib/utils'
import { ChevronDown, ChevronRight, Play, CheckCircle } from 'lucide-react'
import { MarkdownContent } from './shared/Markdown'

interface TaskStep {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  description?: string
}

interface ExecutionSectionProps {
  steps?: TaskStep[]
  content?: string
  isExecuting?: boolean  // For status indication
  className?: string
}

/**
 * ExecutionSection component - collapsible container for plan execution operations
 * Includes steps component and execution details with subfont hierarchy
 */
export function ExecutionSection({ steps = [], content, isExecuting = false, className }: ExecutionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)  // Default expanded for execution

  const hasSteps = steps.length > 0
  const completedSteps = steps.filter(step => step.status === 'completed').length
  const totalSteps = steps.length

  return (
    <div className={cn('w-full', className)}>
      {/* Execution Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 w-full p-3 rounded-lg transition-all duration-200',
          'bg-brand/5 hover:bg-brand/10 border border-brand/20',
          'text-left group'
        )}
      >
        <div className="flex items-center gap-2 flex-1">
          {/* Execution icon */}
          {isExecuting ? (
            <Play className="w-4 h-4 text-brand animate-pulse" />
          ) : (
            <CheckCircle className="w-4 h-4 text-brand/70" />
          )}
          
          {/* Main title - main font */}
          <span className="font-medium text-foreground text-sm">
            Execution
          </span>
          
          {/* Progress indicator */}
          {hasSteps && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {completedSteps}/{totalSteps} steps
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="w-16 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand/60 transition-all duration-300 rounded-full"
                  style={{ width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Status indicator for active execution */}
          {isExecuting && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
              <span className="text-xs text-muted-foreground">executing...</span>
            </div>
          )}
        </div>

        {/* Expand/collapse icon */}
        <div className="text-muted-foreground transition-transform duration-200">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Execution Content */}
      {isExpanded && (
        <div className={cn(
          'mt-2 space-y-3 animate-slide-in-smooth'
        )}>
          {/* Legacy Steps Display */}
          {hasSteps && (
            <div className="p-3 rounded-lg bg-background/30 border border-border/20">
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2 text-sm">
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : step.status === 'running' ? (
                      <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="w-4 h-4 border-2 border-muted-foreground/30 rounded-full" />
                    )}
                    <span className={cn(
                      step.status === 'completed' ? 'text-green-600 line-through' : 'text-foreground'
                    )}>
                      {step.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Additional execution content */}
          {content && (
            <div className="p-4 rounded-lg bg-background/50 border border-border/20">
              <MarkdownContent
                content={content}
                className="break-words text-sm text-muted-foreground"  // Subfont
                compact={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
