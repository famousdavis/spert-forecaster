// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { ICON_BUTTON_BASE, ICON_GLYPH_SIZE, ICON_REST, ICON_HUE_RED } from './icon-button-styles'

interface TrashIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
  /** The id of an element that says why the button is disabled (aria-describedby). */
  describedBy?: string
}

export function TrashIconButton({
  onClick,
  ariaLabel = 'Delete',
  title = 'Delete',
  disabled = false,
  describedBy,
}: TrashIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`${ICON_BUTTON_BASE} ${ICON_REST} ${ICON_HUE_RED}`}
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
          d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
