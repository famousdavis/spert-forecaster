// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

interface TrashIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
}

export function TrashIconButton({
  onClick,
  ariaLabel = 'Delete',
  title = 'Delete',
  disabled = false,
}: TrashIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className="inline-flex items-center justify-center p-1.5 rounded-md leading-none bg-transparent border-none cursor-pointer transition-[color,background-color,box-shadow] duration-150 text-gray-400 hover:text-[#ef4444] hover:bg-red-50 dark:hover:bg-red-500/15 focus:outline-none focus:text-[#ef4444] focus:bg-red-50 dark:focus:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 hover:[box-shadow:0_0_0_1.5px_rgba(239,68,68,0.5)] focus:[box-shadow:0_0_0_1.5px_rgba(239,68,68,0.5)] disabled:[box-shadow:none]"
    >
      <svg
        width="20"
        height="20"
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
