// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Project, Sprint, Milestone } from '@/shared/types'
import type { ExportData } from './import-validation'

// --- Types ---

export interface StoryMapExportData extends ExportData {
  source: 'spert-story-map'
}

export interface MergeAction {
  type: 'update-existing' | 'add-new'
  importedProject: Project
  existingProject?: Project // only for 'update-existing'
  milestonesReplaced: number // existing milestone count being replaced
  milestonesIncoming: number // incoming milestone count
  newSprintCount: number // sprints that will be added
  skippedSprintCount: number // sprints skipped (already exist by sprintNumber)
}

export interface MergePlan {
  actions: MergeAction[]
  totalNewSprints: number
  totalUpdatedProjects: number
  totalNewProjects: number
}

// --- Detection ---

/**
 * Check whether parsed import data originated from SPERT Story Map.
 */
export function isStoryMapExport(data: unknown): data is StoryMapExportData {
  if (!data || typeof data !== 'object') return false
  return (data as Record<string, unknown>).source === 'spert-story-map'
}

// --- Plan building ---

function normalise(name: string): string {
  return name.toLowerCase().trim()
}

/**
 * Build a merge plan describing what will happen when the Story Map export
 * is merged into the existing Forecaster state.
 */
export function buildMergePlan(
  existingProjects: Project[],
  existingSprints: Sprint[],
  importData: StoryMapExportData,
): MergePlan {
  const actions: MergeAction[] = []

  for (const imported of importData.projects) {
    const match = existingProjects.find(
      (ep) => normalise(ep.name) === normalise(imported.name),
    )

    if (match) {
      // Find sprint numbers already recorded for this project
      const existingSprintNumbers = new Set(
        existingSprints
          .filter((s) => s.projectId === match.id)
          .map((s) => s.sprintNumber),
      )

      const importedSprintsForProject = importData.sprints.filter(
        (s) => s.projectId === imported.id,
      )

      const newSprints = importedSprintsForProject.filter(
        (s) => !existingSprintNumbers.has(s.sprintNumber),
      )
      const skippedSprints = importedSprintsForProject.filter(
        (s) => existingSprintNumbers.has(s.sprintNumber),
      )

      actions.push({
        type: 'update-existing',
        importedProject: imported,
        existingProject: match,
        milestonesReplaced: match.milestones?.length ?? 0,
        milestonesIncoming: imported.milestones?.length ?? 0,
        newSprintCount: newSprints.length,
        skippedSprintCount: skippedSprints.length,
      })
    } else {
      const importedSprintsForProject = importData.sprints.filter(
        (s) => s.projectId === imported.id,
      )

      actions.push({
        type: 'add-new',
        importedProject: imported,
        milestonesReplaced: 0,
        milestonesIncoming: imported.milestones?.length ?? 0,
        newSprintCount: importedSprintsForProject.length,
        skippedSprintCount: 0,
      })
    }
  }

  return {
    actions,
    totalNewSprints: actions.reduce((sum, a) => sum + a.newSprintCount, 0),
    totalUpdatedProjects: actions.filter((a) => a.type === 'update-existing').length,
    totalNewProjects: actions.filter((a) => a.type === 'add-new').length,
  }
}

// --- Plan application ---

const generateId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function freshMilestones(milestones: Milestone[] | undefined): Milestone[] {
  if (!milestones) return []
  const timestamp = now()
  return milestones.map((m) => ({
    ...m,
    id: generateId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

/**
 * Apply the merge plan, returning the new full state (projects + sprints).
 * Existing data not referenced in the import is preserved unchanged.
 */
export function applyMergePlan(
  existingProjects: Project[],
  existingSprints: Sprint[],
  importData: StoryMapExportData,
  plan: MergePlan,
): { projects: Project[]; sprints: Sprint[] } {
  // Start with copies
  const projects = [...existingProjects]
  const sprints = [...existingSprints]
  const timestamp = now()

  for (const action of plan.actions) {
    if (action.type === 'update-existing' && action.existingProject) {
      const existingId = action.existingProject.id
      const idx = projects.findIndex((p) => p.id === existingId)
      if (idx === -1) continue

      // Replace milestones, preserve everything else
      projects[idx] = {
        ...projects[idx],
        milestones: freshMilestones(action.importedProject.milestones),
        // Fill optional fields from import if not already set
        sprintCadenceWeeks:
          projects[idx].sprintCadenceWeeks ?? action.importedProject.sprintCadenceWeeks,
        firstSprintStartDate:
          projects[idx].firstSprintStartDate ?? action.importedProject.firstSprintStartDate,
        updatedAt: timestamp,
      }

      // Add only non-overlapping sprints
      const existingSprintNumbers = new Set(
        sprints
          .filter((s) => s.projectId === existingId)
          .map((s) => s.sprintNumber),
      )

      const importedSprintsForProject = importData.sprints.filter(
        (s) => s.projectId === action.importedProject.id,
      )

      for (const s of importedSprintsForProject) {
        if (!existingSprintNumbers.has(s.sprintNumber)) {
          sprints.push({
            ...s,
            id: generateId(),
            projectId: existingId,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        }
      }
    } else if (action.type === 'add-new') {
      const newProjectId = generateId()

      projects.push({
        ...action.importedProject,
        id: newProjectId,
        milestones: freshMilestones(action.importedProject.milestones),
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      const importedSprintsForProject = importData.sprints.filter(
        (s) => s.projectId === action.importedProject.id,
      )

      for (const s of importedSprintsForProject) {
        sprints.push({
          ...s,
          id: generateId(),
          projectId: newProjectId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }
    }
  }

  return { projects, sprints }
}
