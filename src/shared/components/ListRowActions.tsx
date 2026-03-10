// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

interface ListRowActionsProps {
  onEdit: () => void
  onDelete: () => void
}

export function ListRowActions({ onEdit, onDelete }: ListRowActionsProps) {
  return (
    <td className="whitespace-nowrap p-2 text-right">
      <button
        onClick={onEdit}
        className="mr-2 cursor-pointer rounded border border-yellow-400 dark:border-yellow-600 bg-spert-bg-warning-light dark:bg-yellow-900/40 px-2 py-1 text-[0.8rem] dark:text-yellow-200"
        title="Edit"
      >
        Edit
      </button>
      <button
        onClick={onDelete}
        className="cursor-pointer rounded border border-spert-error dark:border-red-600 bg-spert-bg-error-light dark:bg-red-900/40 px-2 py-1 text-[0.8rem] dark:text-red-200"
        title="Delete"
      >
        Delete
      </button>
    </td>
  )
}
