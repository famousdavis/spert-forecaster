// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo } from 'react'
import { PencilIconButton } from '@/shared/components/PencilIconButton'
import { TrashIconButton } from '@/shared/components/TrashIconButton'
import type { Sprint } from '@/shared/types'
import { formatDateRange, resolveAllSprintDates } from '@/shared/lib/dates'

interface SprintListProps {
  sprints: Sprint[]
  unitOfMeasure: string
  sortAscending: boolean
  firstSprintStartDate?: string
  sprintCadenceWeeks?: 1 | 2 | 3 | 4
  editingSprintId?: string | null
  onToggleSortOrder: () => void
  onEdit: (sprint: Sprint) => void
  onDelete: (id: string) => void
  onToggleIncluded: (id: string) => void
}

export function SprintList({
  sprints,
  unitOfMeasure,
  sortAscending,
  firstSprintStartDate,
  sprintCadenceWeeks,
  editingSprintId,
  onToggleSortOrder,
  onEdit,
  onDelete,
  onToggleIncluded,
}: SprintListProps) {
  // Resolve all sprint dates with cascade-forward logic
  const resolvedDates = useMemo(() => {
    if (!firstSprintStartDate || !sprintCadenceWeeks) return null
    return resolveAllSprintDates(
      firstSprintStartDate,
      sprintCadenceWeeks,
      sprints.map(s => ({ sprintNumber: s.sprintNumber, customFinishDate: s.customFinishDate }))
    )
  }, [firstSprintStartDate, sprintCadenceWeeks, sprints])

  // Sort sprints by sprint number
  const sortedSprints = useMemo(() => {
    return [...sprints].sort((a, b) =>
      sortAscending ? a.sprintNumber - b.sprintNumber : b.sprintNumber - a.sprintNumber
    )
  }, [sprints, sortAscending])

  // Find the highest sprint number (most recent sprint)
  const highestSprintNumber = useMemo(() => {
    if (sprints.length === 0) return 0
    return Math.max(...sprints.map((s) => s.sprintNumber))
  }, [sprints])

  if (sprints.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-muted-foreground">No sprints recorded yet. Add one to get started.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              Include
            </th>
            <th
              className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
              onClick={onToggleSortOrder}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggleSortOrder()
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Sort by sprint number, currently ${sortAscending ? 'ascending' : 'descending'}`}
              title="Click to toggle sort order"
            >
              Sprint {sortAscending ? '↑' : '↓'}
            </th>
            <th
              className="px-4 py-3 text-right text-sm font-medium text-muted-foreground"
              title={`Done this sprint (${unitOfMeasure})`}
            >
              Done ({unitOfMeasure})
            </th>
            <th
              className="px-4 py-3 text-right text-sm font-medium text-muted-foreground"
              title={`Backlog at End (${unitOfMeasure})`}
            >
              Backlog
            </th>
            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedSprints.map((sprint) => {
            const isLatestSprint = sprint.sprintNumber === highestSprintNumber
            const canDelete = isLatestSprint

            return (
              <tr
                key={sprint.id}
                className={`border-b border-border ${
                  !sprint.includedInForecast ? 'opacity-50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    name="sprintIncludedInForecast"
                    checked={sprint.includedInForecast}
                    onChange={() => onToggleIncluded(sprint.id)}
                    className="h-4 w-4 rounded border-input"
                    aria-label={`Include Sprint ${sprint.sprintNumber} in forecast`}
                  />
                </td>
                <td className="px-4 py-3 text-sm dark:text-gray-100">
                  {(() => {
                    const resolved = resolvedDates?.get(sprint.sprintNumber)
                    const startDate = resolved?.startDate ?? sprint.sprintStartDate
                    const finishDate = resolved?.finishDate ?? sprint.sprintFinishDate
                    return (
                      <>
                        Sprint {sprint.sprintNumber}: {formatDateRange(startDate, finishDate)}
                        {sprint.customFinishDate && (
                          <span className="ml-1 text-xs text-spert-blue" title="Custom finish date">&#9998;</span>
                        )}
                      </>
                    )
                  })()}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium dark:text-gray-100">
                  {sprint.doneValue}
                </td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                  {sprint.backlogAtSprintEnd !== undefined ? sprint.backlogAtSprintEnd : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-0.5">
                    <PencilIconButton
                      onClick={() => onEdit(sprint)}
                      ariaLabel={`Edit Sprint ${sprint.sprintNumber}`}
                      title="Edit sprint"
                      active={sprint.id === editingSprintId}
                    />
                    <TrashIconButton
                      onClick={() => onDelete(sprint.id)}
                      ariaLabel={`Delete Sprint ${sprint.sprintNumber}`}
                      title={canDelete ? 'Delete sprint' : 'Only the most recent sprint can be deleted'}
                      disabled={!canDelete}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
