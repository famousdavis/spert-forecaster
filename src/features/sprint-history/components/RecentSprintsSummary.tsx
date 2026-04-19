// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo } from 'react'
import type { Sprint } from '@/shared/types'
import { formatDateRange, resolveAllSprintDates } from '@/shared/lib/dates'

interface RecentSprintsSummaryProps {
  sprints: Sprint[]
  unitOfMeasure: string
  firstSprintStartDate?: string
  sprintCadenceWeeks?: 1 | 2 | 3 | 4
}

const MAX_ROWS = 3

export function RecentSprintsSummary({
  sprints,
  unitOfMeasure,
  firstSprintStartDate,
  sprintCadenceWeeks,
}: RecentSprintsSummaryProps) {
  const resolvedDates = useMemo(() => {
    if (!firstSprintStartDate || !sprintCadenceWeeks) return null
    return resolveAllSprintDates(
      firstSprintStartDate,
      sprintCadenceWeeks,
      sprints.map((s) => ({ sprintNumber: s.sprintNumber, customFinishDate: s.customFinishDate }))
    )
  }, [firstSprintStartDate, sprintCadenceWeeks, sprints])

  const recentSprints = useMemo(
    () =>
      [...sprints].sort((a, b) => b.sprintNumber - a.sprintNumber).slice(0, MAX_ROWS),
    [sprints]
  )

  return (
    <div className="rounded-md border border-dashed border-border dark:border-gray-700 bg-transparent px-3 py-2">
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-spert-text-muted dark:text-gray-400 mb-1">
        Recent sprints (reference)
      </p>
      {recentSprints.length === 0 ? (
        <p className="text-xs text-muted-foreground">No prior sprints.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-spert-text-muted dark:text-gray-500">
              <th className="py-1 pr-3 text-left font-normal">Sprint</th>
              <th
                className="py-1 pr-3 text-right font-normal"
                title={`Done this sprint (${unitOfMeasure})`}
              >
                Done ({unitOfMeasure})
              </th>
              <th
                className="py-1 text-right font-normal"
                title={`Backlog at End (${unitOfMeasure})`}
              >
                Backlog
              </th>
            </tr>
          </thead>
          <tbody>
            {recentSprints.map((sprint) => {
              const resolved = resolvedDates?.get(sprint.sprintNumber)
              const startDate = resolved?.startDate ?? sprint.sprintStartDate
              const finishDate = resolved?.finishDate ?? sprint.sprintFinishDate
              return (
                <tr key={sprint.id} className="text-spert-text-secondary dark:text-gray-300">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    Sprint {sprint.sprintNumber}: {formatDateRange(startDate, finishDate)}
                  </td>
                  <td className="py-1 pr-3 text-right font-medium">{sprint.doneValue}</td>
                  <td className="py-1 text-right">
                    {sprint.backlogAtSprintEnd !== undefined ? sprint.backlogAtSprintEnd : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
