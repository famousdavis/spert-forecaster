// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Sprint, Project } from '@/shared/types'
import {
  calculateSprintFinishDate,
  formatDateRange,
  resolveAllSprintDates,
  getNextBusinessDay,
} from '@/shared/lib/dates'

interface SprintFormProps {
  sprint: Sprint | null
  project: Project
  existingSprintCount: number
  allSprints: Sprint[]
  onSubmit: (data: Omit<Sprint, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function SprintForm({
  sprint,
  project,
  existingSprintCount,
  allSprints,
  onSubmit,
  onCancel,
}: SprintFormProps) {
  const [doneValue, setDoneValue] = useState(sprint?.doneValue?.toString() ?? '')
  const [backlogAtSprintEnd, setBacklogAtSprintEnd] = useState(
    sprint?.backlogAtSprintEnd?.toString() ?? ''
  )
  const [includedInForecast, setIncludedInForecast] = useState(
    sprint?.includedInForecast ?? true
  )

  // Calculate the sprint number and dates
  const sprintNumber = sprint?.sprintNumber ?? existingSprintCount + 1

  // Resolve all sprint dates with cascade-forward logic
  const resolvedDates = useMemo(() => {
    if (!project.firstSprintStartDate || !project.sprintCadenceWeeks) return null
    return resolveAllSprintDates(
      project.firstSprintStartDate,
      project.sprintCadenceWeeks,
      allSprints.map(s => ({ sprintNumber: s.sprintNumber, customFinishDate: s.customFinishDate }))
    )
  }, [project.firstSprintStartDate, project.sprintCadenceWeeks, allSprints])

  const { sprintStartDate, computedFinishDate, dateLabel } = useMemo(() => {
    if (sprint && resolvedDates) {
      // Editing existing sprint - use cascade-resolved dates for start
      const resolved = resolvedDates.get(sprint.sprintNumber)
      const startDate = resolved?.startDate ?? sprint.sprintStartDate
      const computedFinish = project.sprintCadenceWeeks
        ? calculateSprintFinishDate(startDate, project.sprintCadenceWeeks)
        : sprint.sprintFinishDate
      return {
        sprintStartDate: startDate,
        computedFinishDate: computedFinish,
        dateLabel: `Sprint ${sprint.sprintNumber}: ${formatDateRange(
          startDate,
          sprint.customFinishDate ?? computedFinish
        )}`,
      }
    }

    // New sprint - calculate dates using cascade-resolved anchor
    if (!project.firstSprintStartDate || !project.sprintCadenceWeeks) {
      return {
        sprintStartDate: '',
        computedFinishDate: '',
        dateLabel: 'Set sprint configuration above to calculate dates',
      }
    }

    // For a new sprint, the start date depends on the previous sprint's resolved finish
    let startDate: string
    if (resolvedDates && resolvedDates.size > 0) {
      const maxExistingSprint = Math.max(...Array.from(resolvedDates.keys()))
      const lastResolved = resolvedDates.get(maxExistingSprint)!
      startDate = getNextBusinessDay(lastResolved.finishDate)
    } else {
      startDate = project.firstSprintStartDate
    }

    const finishDate = calculateSprintFinishDate(startDate, project.sprintCadenceWeeks)

    return {
      sprintStartDate: startDate,
      computedFinishDate: finishDate,
      dateLabel: `Sprint ${sprintNumber}: ${formatDateRange(startDate, finishDate)}`,
    }
  }, [sprint, project.firstSprintStartDate, project.sprintCadenceWeeks, sprintNumber, resolvedDates])

  // Custom finish date state - initialized from sprint's custom date or empty (meaning use computed)
  const [customFinishDate, setCustomFinishDate] = useState(sprint?.customFinishDate ?? '')
  const effectiveFinishDate = customFinishDate || computedFinishDate
  const hasCustomFinishDate = customFinishDate.length > 0 && customFinishDate !== computedFinishDate

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sprintStartDate || !effectiveFinishDate) return

    onSubmit({
      sprintNumber,
      sprintStartDate,
      sprintFinishDate: effectiveFinishDate,
      customFinishDate: hasCustomFinishDate ? customFinishDate : undefined,
      doneValue: Number(doneValue),
      backlogAtSprintEnd: backlogAtSprintEnd ? Number(backlogAtSprintEnd) : undefined,
      includedInForecast,
    })
  }

  const isFinishDateValid = !customFinishDate || customFinishDate >= sprintStartDate
  const isValid =
    sprintStartDate.length > 0 &&
    effectiveFinishDate.length > 0 &&
    doneValue.length > 0 &&
    Number(doneValue) >= 0 &&
    isFinishDateValid

  const needsFirstSprintDate = !project.firstSprintStartDate && !sprint

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
      <h3 className="font-medium dark:text-gray-100">{sprint ? 'Edit Sprint' : 'Add Sprint'}</h3>

      {/* Single row: Sprint dates, Done input, Include checkbox */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Sprint dates display (read-only) */}
        <div
          className={cn(
            'px-3 py-2 rounded text-[0.9rem] font-medium',
            needsFirstSprintDate
              ? 'bg-spert-bg-warning-light dark:bg-yellow-900/30 border border-spert-warning text-[#856404] dark:text-yellow-400'
              : 'bg-spert-bg-disabled dark:bg-gray-700 border border-spert-border dark:border-gray-600 text-spert-text dark:text-gray-200'
          )}
        >
          {dateLabel}
        </div>

        {/* Done input - compact width */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="doneValue"
            className="text-sm font-semibold text-spert-text-secondary whitespace-nowrap"
          >
            Done ({project.unitOfMeasure}) <span className="text-spert-error">*</span>
          </label>
          <input
            id="doneValue"
            type="number"
            min="0"
            max="999999"
            step="any"
            value={doneValue}
            onChange={(e) => setDoneValue(e.target.value)}
            className={cn(
              'p-2 text-[0.9rem] rounded w-[80px] dark:text-gray-100',
              doneValue
                ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-blue-900/30'
            )}
            placeholder="0"
            required
          />
        </div>

        {/* Backlog at sprint end input - optional */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="backlogAtSprintEnd"
            className="text-sm font-semibold text-spert-text-secondary whitespace-nowrap"
          >
            Backlog at End
          </label>
          <input
            id="backlogAtSprintEnd"
            type="number"
            min="0"
            max="999999"
            step="any"
            value={backlogAtSprintEnd}
            onChange={(e) => setBacklogAtSprintEnd(e.target.value)}
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-[80px] bg-white dark:bg-gray-700 dark:text-gray-100"
            placeholder="—"
          />
        </div>

        {/* Custom finish date override */}
        {sprintStartDate && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="customFinishDate"
              className="text-sm font-semibold text-spert-text-secondary whitespace-nowrap"
            >
              Finish Date
            </label>
            <input
              id="customFinishDate"
              type="date"
              value={customFinishDate || computedFinishDate}
              min={sprintStartDate}
              onChange={(e) => setCustomFinishDate(e.target.value)}
              className={cn(
                'p-2 text-[0.9rem] rounded dark:text-gray-100',
                hasCustomFinishDate
                  ? 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-blue-900/30'
                  : 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
              )}
            />
            {hasCustomFinishDate && (
              <button
                type="button"
                onClick={() => setCustomFinishDate('')}
                className="text-xs text-spert-blue hover:underline whitespace-nowrap"
                title="Reset to standard cadence date"
              >
                Reset
              </button>
            )}
            {!isFinishDateValid && (
              <span className="text-xs text-spert-error">Must be ≥ start date</span>
            )}
          </div>
        )}

        {/* Include in forecast checkbox */}
        <div className="flex items-center gap-2">
          <input
            id="includedInForecast"
            type="checkbox"
            checked={includedInForecast}
            onChange={(e) => setIncludedInForecast(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="includedInForecast" className="text-sm text-spert-text-secondary">
            Include in forecast
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white border-none rounded cursor-pointer text-[0.9rem]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid}
          className={cn(
            'px-4 py-2 border-none rounded text-[0.9rem] font-semibold text-white',
            isValid
              ? 'bg-spert-blue cursor-pointer'
              : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
          )}
        >
          {sprint ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  )
}
