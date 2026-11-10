// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import { DEFAULT_UNIT_OF_MEASURE } from '../constants'
import { isValidDateRange } from '@/shared/lib/dates'
import { MAX_STRING_LENGTH } from '@/shared/state/import-limits'
import {
  DIALOG_BUTTONS,
  DIALOG_CANCEL,
  DIALOG_SUBMIT,
  FIELD,
  HINT,
  INPUT_BASE,
  INPUT_BORDER,
  INPUT_BORDER_ERROR,
  LABEL,
  REASON,
} from './dashboard-styles'

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
 * The project's fields, inside the New Project / Edit Project dialog (v0.49.0; `ProjectDialog`
 * owns the title, the focus and the keys). Until v0.49.0 this was an inline card above the list.
 * Cancel comes first, then Add Project / Update Project, which stays disabled while the form is
 * invalid. Enter in a field saves (the form's own submit), Escape cancels (the dialog).
 */
export function ProjectForm({ project, onSubmit, onCancel, readOnlyReason }: ProjectFormProps) {
  const reasonId = useId()
  const readOnly = !!readOnlyReason

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
    <form onSubmit={handleSubmit} aria-describedby={readOnly ? reasonId : undefined}>
      {/* An empty date's mm/dd/yyyy in the dialog's grey (4.5:1), a filled one in the text colour,
          as GanttApp's dialog (`projects-tab.css`, `.pt-date`). */}
      <style jsx>{`
        input[type="date"]::-webkit-datetime-edit-text,
        input[type="date"]::-webkit-datetime-edit-month-field,
        input[type="date"]::-webkit-datetime-edit-day-field,
        input[type="date"]::-webkit-datetime-edit-year-field {
          color: #666;
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
          color: #a0aec0;
        }
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-text,
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-month-field,
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-day-field,
        :global(.dark) input[type="date"].has-value::-webkit-datetime-edit-year-field {
          color: #e2e8f0;
        }
      `}</style>

      {readOnlyReason && (
        <p id={reasonId} className={REASON}>
          {readOnlyReason}
        </p>
      )}

      <div className={FIELD}>
        <label htmlFor="name" className={LABEL}>
          Project Name
        </label>
        {/* App-domain text: no autocomplete (form hygiene; ProjectForm.bounds.test.tsx). */}
        <input
          id="name"
          name="projectName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          className={cn(INPUT_BASE, INPUT_BORDER)}
          placeholder="Project name"
          maxLength={MAX_STRING_LENGTH}
          required
        />
      </div>

      <div className={FIELD}>
        <label htmlFor="unitOfMeasure" className={LABEL}>
          Unit of Measure
        </label>
        <input
          id="unitOfMeasure"
          name="unitOfMeasure"
          type="text"
          value={unitOfMeasure}
          onChange={(e) => setUnitOfMeasure(e.target.value)}
          disabled={readOnly}
          className={cn(INPUT_BASE, INPUT_BORDER, 'max-w-[240px]')}
          placeholder="story points"
          maxLength={MAX_STRING_LENGTH}
          required
        />
      </div>

      <div className="flex flex-wrap gap-x-4">
        <div className={FIELD}>
          <label htmlFor="projectStartDate" className={LABEL}>
            Start Date <span className="font-normal">(Optional)</span>
          </label>
          <input
            id="projectStartDate"
            name="projectStartDate"
            type="date"
            value={projectStartDate}
            disabled={readOnly}
            className={cn(
              INPUT_BASE,
              'w-[200px] max-w-full',
              projectStartDate ? 'has-value' : '',
              startDateError ? INPUT_BORDER_ERROR : INPUT_BORDER,
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
          {startDateError && <div className="text-spert-error text-xs mt-1">{startDateError}</div>}
        </div>

        {/* Finish Date - immediately after Start Date */}
        <div className={FIELD}>
          <label htmlFor="projectFinishDate" className={LABEL}>
            Finish Date <span className="font-normal">(Optional)</span>
          </label>
          <input
            id="projectFinishDate"
            name="projectFinishDate"
            type="date"
            value={projectFinishDate}
            disabled={readOnly}
            className={cn(
              INPUT_BASE,
              'w-[200px] max-w-full',
              projectFinishDate ? 'has-value' : '',
              finishDateError ? INPUT_BORDER_ERROR : INPUT_BORDER,
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
          {finishDateError && <div className="text-spert-error text-xs mt-1">{finishDateError}</div>}
        </div>
      </div>

      {/* Submit error message */}
      {submitError && <div className="text-spert-error text-sm">{submitError}</div>}

      {/* Cancel first, then the save. Read only, the save is not offered at all (OD-8). */}
      <div className={DIALOG_BUTTONS}>
        <button type="button" onClick={onCancel} className={DIALOG_CANCEL}>
          {readOnly ? 'Close' : 'Cancel'}
        </button>
        {!readOnly && (
          <button type="submit" disabled={!isValid} className={DIALOG_SUBMIT}>
            {isEditing ? 'Update Project' : 'Add Project'}
          </button>
        )}
      </div>
      <p className={HINT}>{readOnly ? 'Esc closes.' : 'Enter saves. Esc cancels.'}</p>
    </form>
  )
}
