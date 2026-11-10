// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { ICON_BUTTON_BASE, ICON_GLYPH_SIZE, ICON_REST, ICON_HUE_GREEN } from './icon-button-styles'

interface ExportIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
}

export function ExportIconButton({
  onClick,
  ariaLabel = 'Export',
  title = 'Export',
  disabled = false,
}: ExportIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={`${ICON_BUTTON_BASE} ${ICON_REST} ${ICON_HUE_GREEN}`}
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
          d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
