// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { ProductivityAdjustment } from '@/shared/types'
import { formatDate } from '@/shared/lib/dates'
import { ListRowActions } from '@/shared/components/ListRowActions'

interface ProductivityAdjustmentListProps {
  adjustments: ProductivityAdjustment[]
  onEdit: (adjustment: ProductivityAdjustment) => void
  onDelete: (id: string) => void
  onToggleEnabled: (id: string) => void
  editingId?: string | null
  /**
   * Why the user may not change this project (Brief 39); null or absent when
   * they may. While set, every row's On, Edit and Delete stay in place,
   * disabled, and say why.
   */
  readOnlyReason?: string | null
}

export function ProductivityAdjustmentList({
  adjustments,
  onEdit,
  onDelete,
  onToggleEnabled,
  editingId,
  readOnlyReason,
}: ProductivityAdjustmentListProps) {
  // One screen-reader-only reason for the whole list; the On checkboxes name it.
  const reasonId = useId()
  const describedBy = readOnlyReason ? reasonId : undefined

  if (adjustments.length === 0) {
    return (
      <p className="text-sm italic text-spert-text-muted">
        No productivity adjustments defined.
      </p>
    )
  }

  // Sort by start date ascending
  const sortedAdjustments = [...adjustments].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  )

  return (
    <div className="overflow-x-auto">
      {readOnlyReason && <span id={reasonId} className="sr-only">{readOnlyReason}</span>}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-spert-border-light">
            <th className="w-[50px] p-2 text-center font-semibold text-spert-text-secondary">
              On
            </th>
            <th className="p-2 text-left font-semibold text-spert-text-secondary">
              Name
            </th>
            <th className="p-2 text-left font-semibold text-spert-text-secondary">
              Date Range
            </th>
            <th className="p-2 text-center font-semibold text-spert-text-secondary">
              Factor
            </th>
            <th className="p-2 text-left font-semibold text-spert-text-secondary">
              Memo
            </th>
            <th className="p-2 text-right font-semibold text-spert-text-secondary">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedAdjustments.map((adj) => {
            const isEnabled = adj.enabled !== false // Default to true for backwards compatibility
            return (
              <tr
                key={adj.id}
                className={cn(
                  'border-b border-spert-border-light',
                  !isEnabled && 'opacity-50'
                )}
              >
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    name="adjustmentEnabled"
                    checked={isEnabled}
                    onChange={() => onToggleEnabled(adj.id)}
                    disabled={!!readOnlyReason}
                    className="size-4 cursor-pointer disabled:cursor-not-allowed"
                    title={readOnlyReason ?? (isEnabled ? 'Click to disable' : 'Click to enable')}
                    aria-describedby={describedBy}
                    aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${adj.name}`}
                  />
                </td>
                <td className="p-2 font-medium">{adj.name}</td>
                <td className="p-2 text-[0.8rem]">
                  {formatDate(adj.startDate)} – {formatDate(adj.endDate)}
                </td>
                <td className="p-2 text-center">
                  <span
                    className={cn(
                      'inline-block rounded-xl px-2 py-0.5 text-[0.8rem] font-medium',
                      adj.factor === 0
                        ? 'bg-spert-bg-error-row text-red-600'
                        : adj.factor < 0.5
                          ? 'bg-spert-bg-warning-row text-spert-warning-dark'
                          : adj.factor < 1
                            ? 'bg-spert-bg-info-row text-blue-600'
                            : 'bg-spert-bg-success-row text-emerald-600'
                    )}
                  >
                    {Math.round(adj.factor * 100)}%
                  </span>
                </td>
                <td className="p-2 text-spert-text-muted">{adj.reason || '—'}</td>
                <ListRowActions
                  onEdit={() => onEdit(adj)}
                  onDelete={() => onDelete(adj.id)}
                  isEditing={adj.id === editingId}
                  editLabel={`Edit ${adj.name}`}
                  deleteLabel={`Delete ${adj.name}`}
                  disabled={!!readOnlyReason}
                  reason={readOnlyReason}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
