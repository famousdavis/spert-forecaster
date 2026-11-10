// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A dashboard toolbar icon. Decorative: the button's own text names it, so the icon is hidden
 * from assistive tech. Its path strokes in `currentColor`, so `className` sets its colour
 * (v0.49.0: GanttApp's grey on the secondary buttons, white on the primary).
 */
export function ToolbarIcon({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      <path d={d} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
