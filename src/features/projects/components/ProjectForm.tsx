// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import { DEFAULT_UNIT_OF_MEASURE } from '../constants'
import { isValidDateRange } from '@/shared/lib/dates'
import { MAX_STRING_LENGTH } from '@/shared/state/import-limits'

// The form stores the TRIMMED name and unit, so the trimmed length is the one to
// bound. `maxLength` stops typing past the limit, but it never flags a value
// that arrives already over it (an edit form pre-filled from stored data is not
// `tooLong`), so `isValid` checks the length too.
const fitsStringLimit = (value: string) => value.trim().length <= MAX_STRING_LENGTH

interface ProjectFormProps {
  project: Project | null
  onSubmit: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
  /**
   * Why the user may only view this project (Brief 39 PR B, OD-8); null or absent when
   * they may change it. While set, the form shows the project read only:
   * every field disabled (the dates stay readable), no Save, Cancel reads
   * Close, and the reason shows above the fields. Set while the form is open
   * (the user's access dropped), the fields keep what was typed (V2).
   */
  readOnlyReason?: string | null
}

/**
 * Imperative handle exposed via forwardRef. Callers in v0.31.1 use this to focus the
 * name field when the user clicks "Create New Project" from a sibling tab's empty state
 * (see useProjectStore.shouldFocusNewProjectForm handoff).
 */
export interface ProjectFormHandle {
  focusNameInput: () => void
}

export const ProjectForm = forwardRef<ProjectFormHandle, ProjectFormProps>(function ProjectForm(
  { project, onSubmit, onCancel, readOnlyReason },
  ref,
) {
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const reasonId = useId()
  const readOnly = !!readOnlyReason

  useImperativeHandle(ref, () => ({
    focusNameInput: () => {
      nameInputRef.current?.focus()
    },
  }), [])

  const [name, setName] = useState(project?.name ?? '')
  const [projectStartDate, setProjectStartDate] = useState(project?.projectStartDate ?? '')
  const [projectFinishDate, setProjectFinishDate] = useState(project?.projectFinishDate ?? '')
  const [unitOfMeasure, setUnitOfMeasure] = useState(
    project?.unitOfMeasure ?? DEFAULT_UNIT_OF_MEASURE
  )

  // Error states for date validation on blur
  const [startDateError, setStartDateError] = useState('')
  const [finishDateError, setFinishDateError] = useState('')
  const [submitError, setSubmitError] = useState('')

  // Form state is initialized from `project` via useState initializers above.
  // Parents must pass `key={project?.id ?? 'new'}` so switching to a different
  // project remounts the form (resetting all state to the new project's values).

  const validateProjectStartDate = (date: string) => {
    if (date === '') {
      setStartDateError('')
      return true
    }
    if (date.length === 10 && !isValidDateRange(date)) {
      setStartDateError('Date must be between 2000 and 2050')
      return false
    }
    setStartDateError('')
    return true
  }

  const validateProjectFinishDate = (date: string) => {
    if (date === '') {
      setFinishDateError('')
      return true
    }
    if (date.length === 10 && !isValidDateRange(date)) {
      setFinishDateError('Date must be between 2000 and 2050')
      return false
    }
    setFinishDateError('')
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    setSubmitError('')

    // Validate date comparison only on submit
    if (projectStartDate && projectFinishDate && projectStartDate.length === 10 && projectFinishDate.length === 10) {
      if (projectStartDate >= projectFinishDate) {
        setSubmitError('Start Date must be before Finish Date')
        return
      }
    }

    // Check for any existing date errors
    if (startDateError || finishDateError) {
      return
    }

    onSubmit({
      name: name.trim(),
      sprintCadenceWeeks: project?.sprintCadenceWeeks, // Not set until configured on Sprint History tab
      projectStartDate: projectStartDate || undefined,
      projectFinishDate: projectFinishDate || undefined,
      unitOfMeasure: unitOfMeasure.trim(),
    })
    // Reset form after submission (if adding new project)
    if (!project) {
      setName('')
      setProjectStartDate('')
      setProjectFinishDate('')
    }
  }

  const isValid =
    name.trim().length > 0 &&
    fitsStringLimit(name) &&
    unitOfMeasure.trim().length > 0 &&
    fitsStringLimit(unitOfMeasure) &&
    !startDateError &&
    !finishDateError

  const isEditing = project !== null

  return (
    <form
      onSubmit={handleSubmit}
      aria-describedby={readOnly ? reasonId : undefined}
      className="rounded-lg border border-border dark:border-gray-700 p-4 bg-spert-bg-input dark:bg-gray-800"
    >
      <style jsx>{`
        input[type="date"]::-webkit-datetime-edit-text,
        input[type="date"]::-webkit-datetime-edit-month-field,
        input[type="date"]::-webkit-datetime-edit-day-field,
        input[type="date"]::-webkit-datetime-edit-year-field {
          color: #999;
        }
        input[type="date"].has-value::-webkit-datetime-edit-text,
        input[type="date"].has-value::-webkit-datetime-edit-month-field,
        input[type="date"].has-value::-webkit-datetime-edit-day-field,
        input[type="date"].has-value::-webkit-datetime-edit-year-field {
          color: #333;
        }
        :global(.dark) input[type="date"]::-webkit-datetime-edit-text,
        :global(.dark) input[type="date"]::-webkit-datetime-edit-month-field,
        :global(.dark) input[type="date"]::-webkit-datetime-edit-day-field,
        :global(.dark) input[type="date"]::-webkit-datetime-edit-year-field {
          color: #737373;
        }
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-text,
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-month-field,
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-day-field,
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-year-field {
          color: #e5e5e5;
        }
      `}</style>

      {readOnlyReason && (
        <p id={reasonId} className="mb-3 text-sm text-spert-text-secondary dark:text-gray-300">
          {readOnlyReason}
        </p>
      )}

      <div className="flex gap-4 items-start flex-wrap">
        {/* Project Name - wider */}
        <div className="flex-[1_1_300px] min-w-[250px]">
          <label htmlFor="name" className="block mb-1 text-sm font-semibold text-spert-text-secondary">
            Project Name
          </label>
          <input
            id="name"
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-full bg-white dark:bg-gray-700 dark:text-gray-100 disabled:cursor-not-allowed disabled:bg-spert-bg-disabled dark:disabled:bg-gray-700"
            placeholder="Project name"
            maxLength={MAX_STRING_LENGTH}
            required
          />
        </div>

        {/* Unit of Measure */}
        <div className="flex-[0_0_130px]">
          <label htmlFor="unitOfMeasure" className="block mb-1 text-sm font-semibold text-spert-text-secondary">
            Unit of Measure
          </label>
          <input
            id="unitOfMeasure"
            type="text"
            value={unitOfMeasure}
            onChange={(e) => setUnitOfMeasure(e.target.value)}
            disabled={readOnly}
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-full bg-white dark:bg-gray-700 dark:text-gray-100 disabled:cursor-not-allowed disabled:bg-spert-bg-disabled dark:disabled:bg-gray-700"
            placeholder="story points"
            maxLength={MAX_STRING_LENGTH}
            required
          />
        </div>

        {/* Start Date */}
        <div className="flex-[0_0_150px]">
          <label htmlFor="projectStartDate" className="block mb-1 text-sm font-semibold text-spert-text-secondary">
            Start Date (Optional)
          </label>
          <input
            id="projectStartDate"
            type="date"
            value={projectStartDate}
            disabled={readOnly}
            className={cn(
              'p-2 text-[0.9rem] rounded w-[150px] text-spert-text dark:text-gray-100 bg-white dark:bg-gray-700 disabled:cursor-not-allowed disabled:bg-spert-bg-disabled dark:disabled:bg-gray-700',
              projectStartDate ? 'has-value' : '',
              startDateError ? 'border border-spert-error' : 'border border-spert-border dark:border-gray-600'
            )}
            onChange={(e) => {
              setProjectStartDate(e.target.value)
              setStartDateError('') // Clear error while typing
              setSubmitError('')
            }}
            onBlur={(e) => validateProjectStartDate(e.target.value)}
            min="2000-01-01"
            max="2050-12-31"
          />
          {startDateError && (
            <div className="text-spert-error text-xs mt-1">
              {startDateError}
            </div>
          )}
        </div>

        {/* Finish Date - immediately after Start Date */}
        <div className="flex-[0_0_150px]">
          <label htmlFor="projectFinishDate" className="block mb-1 text-sm font-semibold text-spert-text-secondary">
            Finish Date (Optional)
          </label>
          <input
            id="projectFinishDate"
            type="date"
            value={projectFinishDate}
            disabled={readOnly}
            className={cn(
              'p-2 text-[0.9rem] rounded w-[150px] text-spert-text dark:text-gray-100 bg-white dark:bg-gray-700 disabled:cursor-not-allowed disabled:bg-spert-bg-disabled dark:disabled:bg-gray-700',
              projectFinishDate ? 'has-value' : '',
              finishDateError ? 'border border-spert-error' : 'border border-spert-border dark:border-gray-600'
            )}
            onChange={(e) => {
              setProjectFinishDate(e.target.value)
              setFinishDateError('') // Clear error while typing
              setSubmitError('')
            }}
            onBlur={(e) => validateProjectFinishDate(e.target.value)}
            min="2000-01-01"
            max="2050-12-31"
          />
          {finishDateError && (
            <div className="text-spert-error text-xs mt-1">
              {finishDateError}
            </div>
          )}
        </div>

        {/* Buttons — read only, Save is not offered at all (OD-8) */}
        <div className="flex-[0_0_auto] self-end flex gap-2">
          {!readOnly && (
            <button
              type="submit"
              disabled={!isValid}
              className={cn(
                'px-4 py-2 border-none rounded text-[0.9rem] font-semibold text-white h-[38px]',
                isValid
                  ? 'bg-spert-blue cursor-pointer opacity-100'
                  : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-60'
              )}
            >
              {isEditing ? 'Update Project' : 'Add Project'}
            </button>
          )}

          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white border-none rounded cursor-pointer text-[0.9rem] h-[38px]"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Submit error message */}
      {submitError && (
        <div className="text-spert-error text-sm mt-3">
          {submitError}
        </div>
      )}
    </form>
  )
})
