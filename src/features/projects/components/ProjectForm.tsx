// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import { DEFAULT_UNIT_OF_MEASURE } from '../constants'
import { isValidDateRange } from '@/shared/lib/dates'

interface ProjectFormProps {
  project: Project | null
  onSubmit: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function ProjectForm({ project, onSubmit, onCancel }: ProjectFormProps) {
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

  // Update form when editing project changes
  useEffect(() => {
    if (project) {
      setName(project.name)
      setProjectStartDate(project.projectStartDate ?? '')
      setProjectFinishDate(project.projectFinishDate ?? '')
      setUnitOfMeasure(project.unitOfMeasure)
    } else {
      setName('')
      setProjectStartDate('')
      setProjectFinishDate('')
      setUnitOfMeasure(DEFAULT_UNIT_OF_MEASURE)
    }
    // Clear errors when switching projects
    setStartDateError('')
    setFinishDateError('')
    setSubmitError('')
  }, [project])

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

  const isValid = name.trim().length > 0 && unitOfMeasure.trim().length > 0 && !startDateError && !finishDateError

  const isEditing = project !== null

  return (
    <form
      onSubmit={handleSubmit}
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

      <div className="flex gap-4 items-start flex-wrap">
        {/* Project Name - wider */}
        <div className="flex-[1_1_300px] min-w-[250px]">
          <label htmlFor="name" className="block mb-1 text-sm font-semibold text-spert-text-secondary">
            Project Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-full bg-white dark:bg-gray-700 dark:text-gray-100"
            placeholder="Project name"
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
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-full bg-white dark:bg-gray-700 dark:text-gray-100"
            placeholder="story points"
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
            className={cn(
              'p-2 text-[0.9rem] rounded w-[150px] text-spert-text dark:text-gray-100 bg-white dark:bg-gray-700',
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
            className={cn(
              'p-2 text-[0.9rem] rounded w-[150px] text-spert-text dark:text-gray-100 bg-white dark:bg-gray-700',
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

        {/* Buttons */}
        <div className="flex-[0_0_auto] self-end flex gap-2">
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

          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white border-none rounded cursor-pointer text-[0.9rem] h-[38px]"
            >
              Cancel
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
}
