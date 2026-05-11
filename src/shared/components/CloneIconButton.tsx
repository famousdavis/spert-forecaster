// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

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
      className="inline-flex items-center justify-center p-1.5 rounded-md leading-none bg-transparent border-none cursor-pointer transition-[color,background-color,box-shadow] duration-150 text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/15 hover:[box-shadow:0_0_0_1.5px_rgba(139,92,246,0.5)] focus:outline-none focus:text-violet-500 focus:bg-violet-50 dark:focus:bg-violet-500/15 focus:[box-shadow:0_0_0_1.5px_rgba(139,92,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:[box-shadow:none]"
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
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}
