// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface HelpTooltipProps {
  /** Body content shown when the tooltip opens. Keep terse — these are info chips, not docs. */
  content: React.ReactNode
  /** Optional className for the trigger button (positioning, sizing). */
  className?: string
  /** Optional accessible label override; defaults to "More information". */
  ariaLabel?: string
}

/**
 * Thin info-icon tooltip wrapper. Trigger renders a small ⓘ circle that opens a Radix tooltip.
 * Use sparingly — only where a stats term needs a plain-language explanation. The component
 * relies on a single <TooltipProvider> wrapper at the app shell; without it, Radix will throw
 * "TooltipProvider is missing" at runtime.
 */
export function HelpTooltip({ content, className, ariaLabel = 'More information' }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center justify-center align-middle ml-1 size-4 rounded-full border border-spert-text-muted/40 text-[10px] font-bold text-spert-text-muted hover:border-spert-blue hover:text-spert-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spert-blue focus-visible:ring-offset-1 cursor-help transition-colors',
          className,
        )}
      >
        i
      </TooltipTrigger>
      <TooltipContent className="max-w-[14rem] leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
