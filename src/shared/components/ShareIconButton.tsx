// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

interface ShareIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
}

export function ShareIconButton({
  onClick,
  ariaLabel = 'Share',
  title = 'Share',
  disabled = false,
}: ShareIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className="inline-flex items-center justify-center p-1.5 rounded-md leading-none bg-transparent border-none cursor-pointer transition-[color,background-color,box-shadow] duration-150 text-gray-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-500/15 hover:[box-shadow:0_0_0_1.5px_rgba(6,182,212,0.5)] focus:outline-none focus:text-cyan-500 focus:bg-cyan-50 dark:focus:bg-cyan-500/15 focus:[box-shadow:0_0_0_1.5px_rgba(6,182,212,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:[box-shadow:none]"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    </button>
  )
}
