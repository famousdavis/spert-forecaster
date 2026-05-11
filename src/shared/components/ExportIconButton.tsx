// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

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
      className="inline-flex items-center justify-center p-1.5 rounded-md leading-none bg-transparent border-none cursor-pointer transition-[color,background-color,box-shadow] duration-150 text-gray-400 hover:text-[#10b981] hover:bg-emerald-50 dark:hover:bg-emerald-500/15 focus:outline-none focus:text-[#10b981] focus:bg-emerald-50 dark:focus:bg-emerald-500/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 hover:[box-shadow:0_0_0_1.5px_rgba(16,185,129,0.5)] focus:[box-shadow:0_0_0_1.5px_rgba(16,185,129,0.5)] disabled:[box-shadow:none]"
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
