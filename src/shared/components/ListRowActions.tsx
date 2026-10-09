// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId } from 'react'
import { PencilIconButton } from './PencilIconButton'
import { TrashIconButton } from './TrashIconButton'

interface ListRowActionsProps {
  onEdit: () => void
  onDelete: () => void
  isEditing?: boolean
  editLabel?: string
  deleteLabel?: string
  /** Both buttons disabled — shown, never hidden (Brief 39 PR B). */
  disabled?: boolean
  /**
   * Why they are disabled. While they are, it is both buttons' tooltip and
   * their description: a screen-reader-only element they name.
   */
  reason?: string | null
}

export function ListRowActions({
  onEdit,
  onDelete,
  isEditing = false,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  disabled = false,
  reason,
}: ListRowActionsProps) {
  // One id per row (useId), so rows never share a description's id.
  const reasonId = useId()
  const shownReason = disabled ? reason : null
  const describedBy = shownReason ? reasonId : undefined
  return (
    <td className="whitespace-nowrap p-2 text-right">
      {shownReason && <span id={reasonId} className="sr-only">{shownReason}</span>}
      <div className="inline-flex items-center gap-0.5">
        <PencilIconButton
          onClick={onEdit}
          ariaLabel={editLabel}
          title={shownReason ?? editLabel}
          active={isEditing}
          disabled={disabled}
          describedBy={describedBy}
        />
        <TrashIconButton
          onClick={onDelete}
          ariaLabel={deleteLabel}
          title={shownReason ?? deleteLabel}
          disabled={disabled}
          describedBy={describedBy}
        />
      </div>
    </td>
  )
}
