// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { PencilIconButton } from './PencilIconButton'
import { TrashIconButton } from './TrashIconButton'

interface ListRowActionsProps {
  onEdit: () => void
  onDelete: () => void
  isEditing?: boolean
  editLabel?: string
  deleteLabel?: string
}

export function ListRowActions({
  onEdit,
  onDelete,
  isEditing = false,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
}: ListRowActionsProps) {
  return (
    <td className="whitespace-nowrap p-2 text-right">
      <div className="inline-flex items-center gap-0.5">
        <PencilIconButton
          onClick={onEdit}
          ariaLabel={editLabel}
          title={editLabel}
          active={isEditing}
        />
        <TrashIconButton
          onClick={onDelete}
          ariaLabel={deleteLabel}
          title={deleteLabel}
        />
      </div>
    </td>
  )
}
