import React from 'react'
import { cn } from '@/sidepanel/lib/utils'
import { ANIMATION_DURATIONS } from '@/sidepanel/lib/animations'

interface TypingIndicatorProps {
  className?: string
  variant?: 'dots' | 'pulse' | 'wave'
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Minimalistic thinking animation
 * Simple, clean animation without complex typing indicators
 */
export function TypingIndicator({ 
  className, 
  variant = 'dots', 
  size = 'md' 
}: TypingIndicatorProps) {
  // Minimalistic thinking animation - just a simple pulsing dot
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2',
      'text-muted-foreground text-sm',
      className
    )}>
      <div className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
      <span>Thinking</span>
    </div>
  )
}
