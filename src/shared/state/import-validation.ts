// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Project, Sprint } from '@/shared/types'
import type { ChangeLogEntry } from './storage'

export interface ExportData {
  version: string
  exportedAt: string
  source?: string // e.g., 'spert-story-map' for Story Map exports
  projects: Project[]
  sprints: Sprint[]
  // Workspace reconciliation tokens (optional for backward compatibility)
  _originRef?: string
  _storageRef?: string
  _changeLog?: ChangeLogEntry[]
  _exportedBy?: string
  _exportedById?: string
}

// Validation constants
const MAX_STRING_LENGTH = 200
const MAX_NUMERIC_VALUE = 999999
const MIN_SPRINT_NUMBER = 1
const MAX_SPRINT_NUMBER = 10000
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate ISO date string format (YYYY-MM-DD) and check if it's a valid date
 */
function isValidIsoDate(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') return false
  if (!DATE_REGEX.test(dateStr)) return false

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return false

  // Verify the date wasn't auto-corrected (e.g., "2026-02-30" -> "2026-03-02")
  const [year, month, day] = dateStr.split('-').map(Number)
  return date.getUTCFullYear() === year &&
         date.getUTCMonth() === month - 1 &&
         date.getUTCDate() === day
}

/**
 * Validate a number is finite and within bounds
 */
function isValidNumber(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/**
 * Validate that imported data has the expected shape before loading it into the store.
 * Throws a descriptive error if validation fails.
 */
export function validateImportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') {
    throw new Error('Import data must be a JSON object.')
  }

  const d = data as Record<string, unknown>

  if (!Array.isArray(d.projects)) {
    throw new Error('Import data is missing a valid "projects" array.')
  }
  if (!Array.isArray(d.sprints)) {
    throw new Error('Import data is missing a valid "sprints" array.')
  }

  // Track project IDs to detect duplicates
  const projectIds = new Set<string>()

  for (let i = 0; i < d.projects.length; i++) {
    const p = d.projects[i] as Record<string, unknown> | null
    if (!p || typeof p !== 'object') {
      throw new Error(`Project at index ${i} is not a valid object.`)
    }
    if (typeof p.id !== 'string' || !p.id) {
      throw new Error(`Project at index ${i} is missing a valid "id".`)
    }
    if (projectIds.has(p.id)) {
      throw new Error(`Duplicate project ID "${p.id}" found at index ${i}.`)
    }
    projectIds.add(p.id)

    if (typeof p.name !== 'string' || !p.name) {
      throw new Error(`Project at index ${i} is missing a valid "name".`)
    }
    if (p.name.length > MAX_STRING_LENGTH) {
      throw new Error(`Project at index ${i} has a name exceeding ${MAX_STRING_LENGTH} characters.`)
    }
    if (typeof p.unitOfMeasure !== 'string') {
      throw new Error(`Project at index ${i} is missing a valid "unitOfMeasure".`)
    }
    if (p.unitOfMeasure.length > MAX_STRING_LENGTH) {
      throw new Error(`Project at index ${i} has a unitOfMeasure exceeding ${MAX_STRING_LENGTH} characters.`)
    }

    // Validate optional sprintCadenceWeeks
    if (p.sprintCadenceWeeks !== undefined && !isValidNumber(p.sprintCadenceWeeks, 1, 52)) {
      throw new Error(`Project at index ${i} has invalid sprintCadenceWeeks (must be 1-52).`)
    }

    // Validate optional firstSprintStartDate
    if (p.firstSprintStartDate !== undefined && !isValidIsoDate(p.firstSprintStartDate)) {
      throw new Error(`Project at index ${i} has invalid firstSprintStartDate (must be YYYY-MM-DD format).`)
    }

    // Validate optional milestones
    if (p.milestones !== undefined) {
      if (!Array.isArray(p.milestones)) {
        throw new Error(`Project at index ${i} has invalid "milestones" (must be an array).`)
      }
      if (p.milestones.length > 10) {
        throw new Error(`Project at index ${i} has more than 10 milestones.`)
      }
      const milestoneIds = new Set<string>()
      for (let j = 0; j < p.milestones.length; j++) {
        const m = p.milestones[j] as Record<string, unknown> | null
        if (!m || typeof m !== 'object') {
          throw new Error(`Project ${i}, milestone at index ${j} is not a valid object.`)
        }
        if (typeof m.id !== 'string' || !m.id) {
          throw new Error(`Project ${i}, milestone at index ${j} is missing a valid "id".`)
        }
        if (milestoneIds.has(m.id)) {
          throw new Error(`Project ${i}, duplicate milestone ID "${m.id}" at index ${j}.`)
        }
        milestoneIds.add(m.id)
        if (typeof m.name !== 'string' || !m.name) {
          throw new Error(`Project ${i}, milestone at index ${j} is missing a valid "name".`)
        }
        if (m.name.length > MAX_STRING_LENGTH) {
          throw new Error(`Project ${i}, milestone at index ${j} has a name exceeding ${MAX_STRING_LENGTH} characters.`)
        }
        if (!isValidNumber(m.backlogSize, 0.01, MAX_NUMERIC_VALUE)) {
          throw new Error(`Project ${i}, milestone at index ${j} has invalid backlogSize (must be > 0 and <= ${MAX_NUMERIC_VALUE}).`)
        }
        if (typeof m.color !== 'string' || !m.color) {
          throw new Error(`Project ${i}, milestone at index ${j} is missing a valid "color".`)
        }
        if (m.showOnChart !== undefined && typeof m.showOnChart !== 'boolean') {
          throw new Error(`Project ${i}, milestone at index ${j} has invalid "showOnChart" (must be a boolean).`)
        }
      }
    }
  }

  // Track sprint IDs to detect duplicates
  const sprintIds = new Set<string>()

  for (let i = 0; i < d.sprints.length; i++) {
    const s = d.sprints[i] as Record<string, unknown> | null
    if (!s || typeof s !== 'object') {
      throw new Error(`Sprint at index ${i} is not a valid object.`)
    }
    if (typeof s.id !== 'string' || !s.id) {
      throw new Error(`Sprint at index ${i} is missing a valid "id".`)
    }
    if (sprintIds.has(s.id)) {
      throw new Error(`Duplicate sprint ID "${s.id}" found at index ${i}.`)
    }
    sprintIds.add(s.id)

    if (typeof s.projectId !== 'string' || !s.projectId) {
      throw new Error(`Sprint at index ${i} is missing a valid "projectId".`)
    }

    // Validate sprintNumber is a positive integer within range
    if (!isValidNumber(s.sprintNumber, MIN_SPRINT_NUMBER, MAX_SPRINT_NUMBER)) {
      throw new Error(`Sprint at index ${i} has invalid sprintNumber (must be ${MIN_SPRINT_NUMBER}-${MAX_SPRINT_NUMBER}).`)
    }
    if (!Number.isInteger(s.sprintNumber)) {
      throw new Error(`Sprint at index ${i} has non-integer sprintNumber.`)
    }

    // Validate doneValue is non-negative and within range
    if (!isValidNumber(s.doneValue, 0, MAX_NUMERIC_VALUE)) {
      throw new Error(`Sprint at index ${i} has invalid doneValue (must be 0-${MAX_NUMERIC_VALUE}).`)
    }

    // Validate optional backlogAtSprintEnd
    if (s.backlogAtSprintEnd !== undefined && !isValidNumber(s.backlogAtSprintEnd, 0, MAX_NUMERIC_VALUE)) {
      throw new Error(`Sprint at index ${i} has invalid backlogAtSprintEnd (must be 0-${MAX_NUMERIC_VALUE}).`)
    }

    // Validate sprint dates
    if (s.sprintStartDate !== undefined && !isValidIsoDate(s.sprintStartDate)) {
      throw new Error(`Sprint at index ${i} has invalid sprintStartDate (must be YYYY-MM-DD format).`)
    }
    if (s.sprintFinishDate !== undefined && !isValidIsoDate(s.sprintFinishDate)) {
      throw new Error(`Sprint at index ${i} has invalid sprintFinishDate (must be YYYY-MM-DD format).`)
    }
    if (s.customFinishDate !== undefined && !isValidIsoDate(s.customFinishDate)) {
      throw new Error(`Sprint at index ${i} has invalid customFinishDate (must be YYYY-MM-DD format).`)
    }
  }

  return true
}
