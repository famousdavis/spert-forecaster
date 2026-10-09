// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useMemo } from 'react'
import { PencilIconButton } from '@/shared/components/PencilIconButton'
import { TrashIconButton } from '@/shared/components/TrashIconButton'
import type { Sprint } from '@/shared/types'
import { resolveAllSprintDates, isValidIsoDate, findInvalidSprintDates } from '@/shared/lib/dates'
import { groupBySprint } from '@/shared/lib/sprint-date-texts'
import { sprintRowDateParts } from '../lib/sprint-date-display'

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
  /**
   * Why the user may not change this project (Brief 39 PR B); null or absent
   * when they may. While set, every row's Include, Edit and Delete stay in
   * place, disabled, and say why — the reason wins over any other tooltip.
   */
  readOnlyReason?: string | null
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
  readOnlyReason,
}: SprintListProps) {
  // One screen-reader-only reason for the whole list; every control it disables names it.
  const reasonId = useId()
  const describedBy = readOnlyReason ? reasonId : undefined
  // Resolve all sprint dates with cascade-forward logic. A refused first date counts as missing (D14).
  const resolvedDates = useMemo(() => {
    if (!isValidIsoDate(firstSprintStartDate) || !sprintCadenceWeeks) return null
    return resolveAllSprintDates(
      firstSprintStartDate!,
      sprintCadenceWeeks,
      sprints.map(s => ({ sprintNumber: s.sprintNumber, customFinishDate: s.customFinishDate }))
    )
  }, [firstSprintStartDate, sprintCadenceWeeks, sprints])

  // Every stored date the rule refuses, from the stored fields, so rows are marked with or without a schedule (D12)
  const problems = useMemo(
    () => new Map(groupBySprint(findInvalidSprintDates(sprints)).map((p) => [p.sprintNumber, p])),
    [sprints]
  )

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
      {readOnlyReason && <span id={reasonId} className="sr-only">{readOnlyReason}</span>}
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
                    disabled={!!readOnlyReason}
                    title={readOnlyReason ?? undefined}
                    aria-describedby={describedBy}
                    className="h-4 w-4 rounded border-input disabled:cursor-not-allowed"
                    aria-label={`Include Sprint ${sprint.sprintNumber} in forecast`}
                  />
                </td>
                <td className="px-4 py-3 text-sm dark:text-gray-100">
                  {(() => {
                    const problem = problems.get(sprint.sprintNumber)
                    const { dates, warning } = sprintRowDateParts(sprint, resolvedDates?.get(sprint.sprintNumber), problem)
                    return (
                      <>
                        Sprint {sprint.sprintNumber}: {dates}
                        {warning && <span className="text-[#856404] dark:text-yellow-400"> ⚠ {warning}</span>}
                        {sprint.customFinishDate && !problem && (
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
                      title={readOnlyReason ?? 'Edit sprint'}
                      active={sprint.id === editingSprintId}
                      disabled={!!readOnlyReason}
                      describedBy={describedBy}
                    />
                    <TrashIconButton
                      onClick={() => onDelete(sprint.id)}
                      ariaLabel={`Delete Sprint ${sprint.sprintNumber}`}
                      title={readOnlyReason ?? (canDelete ? 'Delete sprint' : 'Only the most recent sprint can be deleted')}
                      disabled={!canDelete || !!readOnlyReason}
                      describedBy={describedBy}
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
