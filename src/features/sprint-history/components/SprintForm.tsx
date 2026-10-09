// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Sprint, Project } from '@/shared/types'
import { isValidIsoDate, MAX_ISO_DATE } from '@/shared/lib/dates'
import { MAX_NUMERIC_VALUE } from '@/shared/state/import-limits'
import { planSprintFormDates, sprintFormDateIssue, savedDateNote, assumptionNote } from '../lib/sprint-form-dates'

// The bounds below are checked in `isValid` as well as in `min`/`max`: the
// native check runs only when a browser submits the form, and `isValid` keeps
// the button disabled. The figures take the import validator's bounds from the
// same constant, and the finish date takes its date rule itself, so no value
// this form saves is refused when its file comes back.
const isFigureInRange = (value: string) => {
  const n = Number(value)
  return n >= 0 && n <= MAX_NUMERIC_VALUE
}
const isOptionalFigureInRange = (value: string) => value.length === 0 || isFigureInRange(value)

interface SprintFormProps {
  sprint: Sprint | null
  project: Project
  existingSprintCount: number
  allSprints: Sprint[]
  onSubmit: (data: Omit<Sprint, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
  /**
   * Why the user may not change this project (Brief 39 PR B); null or absent
   * when they may. While set, Save is disabled and the reason shows beside it;
   * the fields stay as typed, so nothing the user typed is lost (V2).
   */
  readOnlyReason?: string | null
}

export function SprintForm({
  sprint,
  project,
  existingSprintCount,
  allSprints,
  onSubmit,
  onCancel,
  readOnlyReason,
}: SprintFormProps) {
  const reasonId = useId()
  const [doneValue, setDoneValue] = useState(sprint?.doneValue?.toString() ?? '')
  const [backlogAtSprintEnd, setBacklogAtSprintEnd] = useState(
    sprint?.backlogAtSprintEnd?.toString() ?? ''
  )
  const [includedInForecast, setIncludedInForecast] = useState(
    sprint?.includedInForecast ?? true
  )

  // Calculate the sprint number and dates
  const sprintNumber = sprint?.sprintNumber ?? existingSprintCount + 1

  // The dates (cascade-resolved), and what the form must say about them: ../lib/sprint-form-dates.ts
  const plan = useMemo(
    () => planSprintFormDates(sprint, project, sprintNumber, allSprints),
    [sprint, project, sprintNumber, allSprints]
  )
  const { sprintStartDate, computedFinishDate, dateLabel } = plan

  // Custom finish date state - initialized from sprint's custom date or empty (meaning use computed).
  // A saved value the rule refuses is kept, never blanked: Update stays disabled until it is fixed.
  const [customFinishDate, setCustomFinishDate] = useState(sprint?.customFinishDate ?? '')
  const effectiveFinishDate = customFinishDate || computedFinishDate
  const hasCustomFinishDate = customFinishDate.length > 0 && customFinishDate !== computedFinishDate

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnlyReason || !sprintStartDate || !effectiveFinishDate) return

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
  // Year 9999 (D15, D16): blocked only when this save would store a date past
  // the limit, or cause or worsen a spill of the dates after it.
  const dateIssue = sprintFormDateIssue({
    sprint, project, allSprints, sprintNumber, sprintStartDate, effectiveFinishDate,
    candidateCustom: hasCustomFinishDate ? customFinishDate : undefined,
  })
  const savedNote = savedDateNote(sprint, customFinishDate, computedFinishDate, sprintStartDate)
  const assumption = assumptionNote(plan)
  // The finish date is saved as `sprintFinishDate`, and as `customFinishDate`
  // when it differs from the computed one, so this one check covers both. A
  // five-digit year passes the string comparison above; it fails this.
  const isValid =
    sprintStartDate.length > 0 &&
    effectiveFinishDate.length > 0 &&
    isValidIsoDate(effectiveFinishDate) &&
    dateIssue === null &&
    doneValue.length > 0 &&
    isFigureInRange(doneValue) &&
    isOptionalFigureInRange(backlogAtSprintEnd) &&
    isFinishDateValid
  const canSave = isValid && !readOnlyReason

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
            Done this sprint ({project.unitOfMeasure}) <span className="text-spert-error">*</span>
          </label>
          <input
            id="doneValue"
            type="number"
            min="0"
            max={MAX_NUMERIC_VALUE}
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
            Backlog at End ({project.unitOfMeasure})
          </label>
          <input
            id="backlogAtSprintEnd"
            type="number"
            min="0"
            max={MAX_NUMERIC_VALUE}
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
              max={MAX_ISO_DATE}
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

      {(savedNote || assumption) && (
        <div className="space-y-1 text-xs text-[#856404] dark:text-yellow-400">
          {savedNote && <p>{savedNote}</p>}
          {assumption && <p>{assumption}</p>}
        </div>
      )}
      {dateIssue && <p className="text-xs text-spert-error">{dateIssue}</p>}

      {readOnlyReason && (
        <p id={reasonId} className="text-right text-xs text-spert-text-secondary dark:text-gray-300">
          {readOnlyReason}
        </p>
      )}

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
          disabled={!canSave}
          title={readOnlyReason ?? undefined}
          aria-describedby={readOnlyReason ? reasonId : undefined}
          className={cn(
            'px-4 py-2 border-none rounded text-[0.9rem] font-semibold text-white',
            canSave
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
