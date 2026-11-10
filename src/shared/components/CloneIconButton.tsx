// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { ICON_BUTTON_BASE, ICON_GLYPH_SIZE, ICON_REST, ICON_HUE_VIOLET } from './icon-button-styles'

interface CloneIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
}

export function CloneIconButton({
  onClick,
  ariaLabel = 'Clone',
  title = 'Clone',
  disabled = false,
}: CloneIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={`${ICON_BUTTON_BASE} ${ICON_REST} ${ICON_HUE_VIOLET}`}
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
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}
