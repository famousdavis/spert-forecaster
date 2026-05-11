// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

interface PencilIconButtonProps {
  onClick: () => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
  active?: boolean
}

// `disabled:bg-transparent disabled:text-gray-400` (non-hover variants) are required
// in addition to `disabled:hover:*`: the `active` prop applies static (non-hover)
// blue tint/color classes that `disabled:hover:*` alone cannot strip.
export function PencilIconButton({
  onClick,
  ariaLabel = 'Edit',
  title = 'Edit',
  disabled = false,
  active = false,
}: PencilIconButtonProps) {
  const isActive = !!active && !disabled
  const activeClasses = isActive
    ? ' text-[#0070f3] bg-blue-50 dark:bg-blue-500/15 [box-shadow:0_0_0_1.5px_rgba(0,112,243,0.5)]'
    : ''
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center justify-center p-1.5 rounded-md leading-none bg-transparent border-none cursor-pointer transition-[color,background-color,box-shadow] duration-150 text-gray-400 hover:text-[#0070f3] hover:bg-blue-50 dark:hover:bg-blue-500/15 focus:outline-none focus:text-[#0070f3] focus:bg-blue-50 dark:focus:bg-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 hover:[box-shadow:0_0_0_1.5px_rgba(0,112,243,0.5)] focus:[box-shadow:0_0_0_1.5px_rgba(0,112,243,0.5)] disabled:[box-shadow:none] disabled:bg-transparent disabled:text-gray-400${activeClasses}`}
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
