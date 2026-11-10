// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { ICON_BUTTON_BASE, ICON_GLYPH_SIZE, ICON_REST, ICON_HUE_SLATE } from './icon-button-styles'

interface ArchiveIconButtonProps {
  variant: 'archive' | 'unarchive'
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
}

// GanttApp's glyphs (`ArchiveIconButton.tsx` at d437e84): a box, with a bar, or with an up arrow.
const BOX = 'M21 8v13H3V8M1 3h22v5H1z'
const PATHS = { archive: `${BOX}M10 12h4`, unarchive: `${BOX}M12 18v-6M9 15l3-3 3 3` } as const

/**
 * Archive or Unarchive (v0.50.0): the same base as the five shared icon buttons (28 px, 18 px
 * glyph, resting grey), with GanttApp's slate on hover and focus.
 */
export function ArchiveIconButton({ variant, onClick, ariaLabel, title, disabled = false }: ArchiveIconButtonProps) {
  const fallback = variant === 'archive' ? 'Archive project' : 'Unarchive project'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? fallback}
      title={title ?? fallback}
      disabled={disabled}
      className={`${ICON_BUTTON_BASE} ${ICON_REST} ${ICON_HUE_SLATE}`}
    >
      <svg
        width={ICON_GLYPH_SIZE}
        height={ICON_GLYPH_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={PATHS[variant]} />
      </svg>
    </button>
  )
}
