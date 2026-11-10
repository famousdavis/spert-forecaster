// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { ICON_ACTIVE_BLUE, ICON_BUTTON_BASE, ICON_GLYPH_SIZE, ICON_HUE_BLUE, ICON_REST } from './icon-button-styles'

interface PencilIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
  /** The id of an element that says why the button is disabled (aria-describedby). */
  describedBy?: string
  active?: boolean
}

export function PencilIconButton({
  onClick,
  ariaLabel = 'Edit',
  title = 'Edit',
  disabled = false,
  active = false,
  describedBy,
}: PencilIconButtonProps) {
  // Disabled overrides active (GanttApp's rule): a disabled pencil never shows the active look.
  // The active look REPLACES the resting classes rather than joining them: side by side, each
  // pair is a tie the stylesheet's class order settles. In v0.48.1 the resting classes won: the
  // active pencil's icon stayed grey in both themes, and its background stayed transparent in
  // the light theme.
  const isActive = !!active && !disabled
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`${ICON_BUTTON_BASE} ${isActive ? ICON_ACTIVE_BLUE : ICON_REST} ${ICON_HUE_BLUE}`}
    >
      <svg
        width={ICON_GLYPH_SIZE}
        height={ICON_GLYPH_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
