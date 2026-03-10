// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { isValidDateRange } from '@/shared/lib/dates'
import {
  SPRINT_CADENCE_OPTIONS,
  type SprintCadence,
} from '@/features/projects/constants'
import type { Project } from '@/shared/types'

interface SprintConfigProps {
  project: Project
  canEdit: boolean
  onCadenceChange: (cadence: SprintCadence) => void
  onFirstSprintDateChange: (date: string) => void
}

export function SprintConfig({
  project,
  canEdit,
  onCadenceChange,
  onFirstSprintDateChange,
}: SprintConfigProps) {
  const [firstSprintDateError, setFirstSprintDateError] = useState('')

  const isConfigComplete =
    project.sprintCadenceWeeks !== undefined &&
    project.firstSprintStartDate !== undefined

  const handleFirstSprintDateChange = (value: string) => {
    onFirstSprintDateChange(value)
    setFirstSprintDateError('')
  }

  const validateFirstSprintDate = (value: string) => {
    if (value === '') {
      setFirstSprintDateError('')
      return
    }
    if (value.length === 10 && !isValidDateRange(value)) {
      setFirstSprintDateError('Date must be between 2000 and 2050')
    } else {
      setFirstSprintDateError('')
    }
  }

  return (
    <div className="rounded-lg border border-border dark:border-gray-700 p-4 bg-spert-bg-input dark:bg-gray-800">
      {canEdit && !isConfigComplete && (
        <p className="text-sm text-spert-text-secondary mb-3">
          Configure the sprint cadence and first sprint start date before adding sprints.
        </p>
      )}
      <div className="flex items-center gap-6 flex-wrap">
        {/* Sprint Cadence */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="sprintCadence"
            className="text-sm font-semibold text-spert-text-secondary"
          >
            Sprint Cadence
            {canEdit && !project.sprintCadenceWeeks && (
              <span className="text-spert-error ml-[2px]">*</span>
            )}
          </label>
          <select
            id="sprintCadence"
            value={project.sprintCadenceWeeks ?? ''}
            onChange={(e) => onCadenceChange(Number(e.target.value) as SprintCadence)}
            disabled={!canEdit}
            className={cn(
              'p-2 text-[0.9rem] rounded w-[90px] dark:text-gray-100',
              canEdit && !project.sprintCadenceWeeks
                ? 'border-2 border-spert-blue'
                : 'border border-spert-border dark:border-gray-600',
              !canEdit
                ? 'bg-spert-bg-disabled dark:bg-gray-700 cursor-not-allowed'
                : !project.sprintCadenceWeeks
                  ? 'bg-spert-bg-highlight dark:bg-blue-900/30 cursor-pointer'
                  : 'bg-white dark:bg-gray-700 cursor-pointer'
            )}
          >
            <option value="" disabled>
              Select
            </option>
            {SPRINT_CADENCE_OPTIONS.map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks} wk{weeks > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* First Sprint Start Date */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="firstSprintStartDate"
            className="text-sm font-semibold text-spert-text-secondary"
          >
            First Sprint Start Date
            {canEdit && !project.firstSprintStartDate && (
              <span className="text-spert-error ml-[2px]">*</span>
            )}
          </label>
          <input
            id="firstSprintStartDate"
            type="date"
            value={project.firstSprintStartDate ?? ''}
            className={cn(
              'p-2 text-[0.9rem] rounded w-[150px] text-spert-text dark:text-gray-100',
              project.firstSprintStartDate ? 'has-value' : '',
              firstSprintDateError
                ? 'border border-spert-error'
                : canEdit && !project.firstSprintStartDate
                  ? 'border-2 border-spert-blue'
                  : 'border border-spert-border dark:border-gray-600',
              !canEdit
                ? 'bg-spert-bg-disabled dark:bg-gray-700 cursor-not-allowed'
                : !project.firstSprintStartDate
                  ? 'bg-spert-bg-highlight dark:bg-blue-900/30 cursor-text'
                  : 'bg-white dark:bg-gray-700 cursor-text'
            )}
            onChange={(e) => handleFirstSprintDateChange(e.target.value)}
            onBlur={(e) => validateFirstSprintDate(e.target.value)}
            disabled={!canEdit}
            min="2000-01-01"
            max="2050-12-31"
          />
          {firstSprintDateError && (
            <span className="text-spert-error text-xs">
              {firstSprintDateError}
            </span>
          )}
        </div>

        {!canEdit && (
          <span className="text-xs text-spert-text-muted">
            (Delete all sprints to change)
          </span>
        )}
      </div>
    </div>
  )
}
