// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  isStoryMapExport,
  buildMergePlan,
  applyMergePlan,
  type StoryMapExportData,
} from './merge-import'
import type { Project, Sprint } from '@/shared/types'

// --- Helpers ---

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    name: 'Test Project',
    unitOfMeasure: 'Story Points',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: crypto.randomUUID(),
    projectId: 'project-1',
    sprintNumber: 1,
    sprintStartDate: '2026-01-06',
    sprintFinishDate: '2026-01-17',
    doneValue: 20,
    includedInForecast: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeStoryMapExport(
  projects: Project[],
  sprints: Sprint[],
): StoryMapExportData {
  return {
    version: '0.19.0',
    exportedAt: '2026-02-15T00:00:00.000Z',
    source: 'spert-story-map',
    projects,
    sprints,
  }
}

// --- isStoryMapExport ---

describe('isStoryMapExport', () => {
  it('returns true for data with source "spert-story-map"', () => {
    expect(isStoryMapExport({ source: 'spert-story-map', version: '1', exportedAt: '', projects: [], sprints: [] })).toBe(true)
  })

  it('returns false for native Forecaster export (no source)', () => {
    expect(isStoryMapExport({ version: '1', exportedAt: '', projects: [], sprints: [] })).toBe(false)
  })

  it('returns false for different source value', () => {
    expect(isStoryMapExport({ source: 'other-app', version: '1', exportedAt: '', projects: [], sprints: [] })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isStoryMapExport(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isStoryMapExport(undefined)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isStoryMapExport('string')).toBe(false)
    expect(isStoryMapExport(42)).toBe(false)
  })
})

// --- buildMergePlan ---

describe('buildMergePlan', () => {
  it('matches project by name (case-insensitive)', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'My Project' })]
    const imported = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'my project' })],
      [],
    )

    const plan = buildMergePlan(existing, [], imported)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].type).toBe('update-existing')
    expect(plan.actions[0].existingProject?.id).toBe('ex-1')
  })

  it('matches project by name (trimmed)', () => {
    const existing = [makeProject({ id: 'ex-1', name: '  My Project  ' })]
    const imported = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'My Project' })],
      [],
    )

    const plan = buildMergePlan(existing, [], imported)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].type).toBe('update-existing')
  })

  it('creates add-new action when no name match', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Existing Project' })]
    const imported = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'New Project' })],
      [],
    )

    const plan = buildMergePlan(existing, [], imported)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].type).toBe('add-new')
    expect(plan.totalNewProjects).toBe(1)
    expect(plan.totalUpdatedProjects).toBe(0)
  })

  it('counts sprints correctly with partial overlap', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]
    const existingSprints = [
      makeSprint({ projectId: 'ex-1', sprintNumber: 1 }),
      makeSprint({ projectId: 'ex-1', sprintNumber: 2 }),
      makeSprint({ projectId: 'ex-1', sprintNumber: 3 }),
    ]

    const imported = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [
        makeSprint({ projectId: 'imp-1', sprintNumber: 2 }),
        makeSprint({ projectId: 'imp-1', sprintNumber: 3 }),
        makeSprint({ projectId: 'imp-1', sprintNumber: 4 }),
        makeSprint({ projectId: 'imp-1', sprintNumber: 5 }),
      ],
    )

    const plan = buildMergePlan(existing, existingSprints, imported)
    expect(plan.actions[0].newSprintCount).toBe(2) // sprints 4, 5
    expect(plan.actions[0].skippedSprintCount).toBe(2) // sprints 2, 3
    expect(plan.totalNewSprints).toBe(2)
  })

  it('counts all sprints as new when no overlap', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]
    const existingSprints = [
      makeSprint({ projectId: 'ex-1', sprintNumber: 1 }),
    ]

    const imported = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [
        makeSprint({ projectId: 'imp-1', sprintNumber: 2 }),
        makeSprint({ projectId: 'imp-1', sprintNumber: 3 }),
      ],
    )

    const plan = buildMergePlan(existing, existingSprints, imported)
    expect(plan.actions[0].newSprintCount).toBe(2)
    expect(plan.actions[0].skippedSprintCount).toBe(0)
  })

  it('counts all sprints as skipped when full overlap', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]
    const existingSprints = [
      makeSprint({ projectId: 'ex-1', sprintNumber: 1 }),
      makeSprint({ projectId: 'ex-1', sprintNumber: 2 }),
    ]

    const imported = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [
        makeSprint({ projectId: 'imp-1', sprintNumber: 1 }),
        makeSprint({ projectId: 'imp-1', sprintNumber: 2 }),
      ],
    )

    const plan = buildMergePlan(existing, existingSprints, imported)
    expect(plan.actions[0].newSprintCount).toBe(0)
    expect(plan.actions[0].skippedSprintCount).toBe(2)
  })

  it('counts milestones correctly for update-existing', () => {
    const existing = [
      makeProject({
        id: 'ex-1',
        name: 'Project A',
        milestones: [
          { id: 'm1', name: 'MVP', backlogSize: 50, color: '#10b981', createdAt: '', updatedAt: '' },
          { id: 'm2', name: 'Beta', backlogSize: 100, color: '#3b82f6', createdAt: '', updatedAt: '' },
          { id: 'm3', name: 'GA', backlogSize: 150, color: '#f59e0b', createdAt: '', updatedAt: '' },
        ],
      }),
    ]

    const imported = makeStoryMapExport(
      [
        makeProject({
          id: 'imp-1',
          name: 'Project A',
          milestones: [
            { id: 'im1', name: 'MVP', backlogSize: 60, color: '#10b981', createdAt: '', updatedAt: '' },
            { id: 'im2', name: 'Beta', backlogSize: 120, color: '#3b82f6', createdAt: '', updatedAt: '' },
            { id: 'im3', name: 'GA', backlogSize: 180, color: '#f59e0b', createdAt: '', updatedAt: '' },
            { id: 'im4', name: 'Post-GA', backlogSize: 220, color: '#8b5cf6', createdAt: '', updatedAt: '' },
            { id: 'im5', name: 'Sunset', backlogSize: 250, color: '#ef4444', createdAt: '', updatedAt: '' },
          ],
        }),
      ],
      [],
    )

    const plan = buildMergePlan(existing, [], imported)
    expect(plan.actions[0].milestonesReplaced).toBe(3)
    expect(plan.actions[0].milestonesIncoming).toBe(5)
  })

  it('counts milestones for add-new (no existing)', () => {
    const imported = makeStoryMapExport(
      [
        makeProject({
          id: 'imp-1',
          name: 'Brand New',
          milestones: [
            { id: 'im1', name: 'MVP', backlogSize: 60, color: '#10b981', createdAt: '', updatedAt: '' },
          ],
        }),
      ],
      [],
    )

    const plan = buildMergePlan([], [], imported)
    expect(plan.actions[0].milestonesReplaced).toBe(0)
    expect(plan.actions[0].milestonesIncoming).toBe(1)
  })

  it('handles existing project with no milestones', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]
    const imported = makeStoryMapExport(
      [
        makeProject({
          id: 'imp-1',
          name: 'Project A',
          milestones: [
            { id: 'im1', name: 'MVP', backlogSize: 60, color: '#10b981', createdAt: '', updatedAt: '' },
            { id: 'im2', name: 'Beta', backlogSize: 120, color: '#3b82f6', createdAt: '', updatedAt: '' },
          ],
        }),
      ],
      [],
    )

    const plan = buildMergePlan(existing, [], imported)
    expect(plan.actions[0].milestonesReplaced).toBe(0)
    expect(plan.actions[0].milestonesIncoming).toBe(2)
  })

  it('handles multiple imported projects (one match, one new)', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]

    const imported = makeStoryMapExport(
      [
        makeProject({ id: 'imp-1', name: 'Project A' }),
        makeProject({ id: 'imp-2', name: 'Project B' }),
      ],
      [],
    )

    const plan = buildMergePlan(existing, [], imported)
    expect(plan.actions).toHaveLength(2)
    expect(plan.actions[0].type).toBe('update-existing')
    expect(plan.actions[1].type).toBe('add-new')
    expect(plan.totalUpdatedProjects).toBe(1)
    expect(plan.totalNewProjects).toBe(1)
  })

  it('returns empty plan for empty import', () => {
    const plan = buildMergePlan(
      [makeProject({ id: 'ex-1', name: 'Existing' })],
      [],
      makeStoryMapExport([], []),
    )

    expect(plan.actions).toHaveLength(0)
    expect(plan.totalNewSprints).toBe(0)
    expect(plan.totalUpdatedProjects).toBe(0)
    expect(plan.totalNewProjects).toBe(0)
  })
})

// --- applyMergePlan ---

describe('applyMergePlan', () => {
  it('replaces milestones with fresh IDs for update-existing', () => {
    const existing = [
      makeProject({
        id: 'ex-1',
        name: 'Project A',
        milestones: [
          { id: 'old-m1', name: 'MVP', backlogSize: 50, color: '#10b981', createdAt: '', updatedAt: '' },
        ],
      }),
    ]

    const importedMilestones = [
      { id: 'imp-m1', name: 'MVP', backlogSize: 60, color: '#10b981', createdAt: '', updatedAt: '' },
      { id: 'imp-m2', name: 'Beta', backlogSize: 120, color: '#3b82f6', createdAt: '', updatedAt: '' },
    ]

    const importData = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A', milestones: importedMilestones })],
      [],
    )

    const plan = buildMergePlan(existing, [], importData)
    const result = applyMergePlan(existing, [], importData, plan)

    const updated = result.projects.find((p) => p.id === 'ex-1')!
    expect(updated.milestones).toHaveLength(2)
    expect(updated.milestones![0].name).toBe('MVP')
    expect(updated.milestones![0].backlogSize).toBe(60) // updated from import
    expect(updated.milestones![1].name).toBe('Beta')
    // Fresh IDs (not the imported IDs)
    expect(updated.milestones![0].id).not.toBe('imp-m1')
    expect(updated.milestones![0].id).not.toBe('old-m1')
    expect(updated.milestones![1].id).not.toBe('imp-m2')
  })

  it('preserves productivity adjustments for update-existing', () => {
    const adjustments = [
      {
        id: 'adj-1',
        name: 'Holiday',
        startDate: '2026-12-20',
        endDate: '2026-12-31',
        factor: 0.5,
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]

    const existing = [
      makeProject({
        id: 'ex-1',
        name: 'Project A',
        productivityAdjustments: adjustments,
      }),
    ]

    const importData = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [],
    )

    const plan = buildMergePlan(existing, [], importData)
    const result = applyMergePlan(existing, [], importData, plan)

    const updated = result.projects.find((p) => p.id === 'ex-1')!
    expect(updated.productivityAdjustments).toEqual(adjustments)
  })

  it('preserves unitOfMeasure, sprintCadenceWeeks, firstSprintStartDate for update-existing', () => {
    const existing = [
      makeProject({
        id: 'ex-1',
        name: 'Project A',
        unitOfMeasure: 'Points',
        sprintCadenceWeeks: 2,
        firstSprintStartDate: '2026-01-06',
      }),
    ]

    const importData = makeStoryMapExport(
      [
        makeProject({
          id: 'imp-1',
          name: 'Project A',
          unitOfMeasure: 'Story Points',
          sprintCadenceWeeks: 3,
          firstSprintStartDate: '2026-02-01',
        }),
      ],
      [],
    )

    const plan = buildMergePlan(existing, [], importData)
    const result = applyMergePlan(existing, [], importData, plan)

    const updated = result.projects.find((p) => p.id === 'ex-1')!
    expect(updated.unitOfMeasure).toBe('Points') // preserved
    expect(updated.sprintCadenceWeeks).toBe(2) // preserved
    expect(updated.firstSprintStartDate).toBe('2026-01-06') // preserved
  })

  it('fills sprintCadenceWeeks and firstSprintStartDate from import when not set', () => {
    const existing = [
      makeProject({
        id: 'ex-1',
        name: 'Project A',
      }),
    ]

    const importData = makeStoryMapExport(
      [
        makeProject({
          id: 'imp-1',
          name: 'Project A',
          sprintCadenceWeeks: 2,
          firstSprintStartDate: '2026-01-06',
        }),
      ],
      [],
    )

    const plan = buildMergePlan(existing, [], importData)
    const result = applyMergePlan(existing, [], importData, plan)

    const updated = result.projects.find((p) => p.id === 'ex-1')!
    expect(updated.sprintCadenceWeeks).toBe(2) // filled from import
    expect(updated.firstSprintStartDate).toBe('2026-01-06') // filled from import
  })

  it('adds only non-overlapping sprints with fresh IDs and correct projectId', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]
    const existingSprints = [
      makeSprint({ id: 'es-1', projectId: 'ex-1', sprintNumber: 1, doneValue: 20 }),
      makeSprint({ id: 'es-2', projectId: 'ex-1', sprintNumber: 2, doneValue: 25 }),
    ]

    const importData = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [
        makeSprint({ id: 'is-1', projectId: 'imp-1', sprintNumber: 2, doneValue: 30 }),
        makeSprint({ id: 'is-2', projectId: 'imp-1', sprintNumber: 3, doneValue: 35 }),
      ],
    )

    const plan = buildMergePlan(existing, existingSprints, importData)
    const result = applyMergePlan(existing, existingSprints, importData, plan)

    // Existing sprints untouched
    expect(result.sprints.filter((s) => s.projectId === 'ex-1')).toHaveLength(3)
    const sprint2 = result.sprints.find((s) => s.sprintNumber === 2 && s.projectId === 'ex-1')!
    expect(sprint2.id).toBe('es-2') // original ID preserved
    expect(sprint2.doneValue).toBe(25) // original value preserved

    // New sprint added
    const sprint3 = result.sprints.find((s) => s.sprintNumber === 3 && s.projectId === 'ex-1')!
    expect(sprint3).toBeDefined()
    expect(sprint3.doneValue).toBe(35)
    expect(sprint3.projectId).toBe('ex-1') // remapped to existing project
    expect(sprint3.id).not.toBe('is-2') // fresh ID
  })

  it('does not modify existing sprints', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Project A' })]
    const existingSprints = [
      makeSprint({ id: 'es-1', projectId: 'ex-1', sprintNumber: 1, doneValue: 20 }),
    ]

    const importData = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [makeSprint({ id: 'is-1', projectId: 'imp-1', sprintNumber: 1, doneValue: 99 })],
    )

    const plan = buildMergePlan(existing, existingSprints, importData)
    const result = applyMergePlan(existing, existingSprints, importData, plan)

    // Existing sprint value unchanged (import value 99 not used)
    const sprint1 = result.sprints.find((s) => s.sprintNumber === 1)!
    expect(sprint1.doneValue).toBe(20)
    expect(sprint1.id).toBe('es-1')
  })

  it('adds new project with fresh ID and all sprints', () => {
    const existing = [makeProject({ id: 'ex-1', name: 'Existing' })]
    const existingSprints = [
      makeSprint({ id: 'es-1', projectId: 'ex-1', sprintNumber: 1 }),
    ]

    const importData = makeStoryMapExport(
      [
        makeProject({
          id: 'imp-1',
          name: 'Brand New',
          milestones: [
            { id: 'im1', name: 'MVP', backlogSize: 60, color: '#10b981', createdAt: '', updatedAt: '' },
          ],
        }),
      ],
      [
        makeSprint({ id: 'is-1', projectId: 'imp-1', sprintNumber: 1, doneValue: 15 }),
        makeSprint({ id: 'is-2', projectId: 'imp-1', sprintNumber: 2, doneValue: 20 }),
      ],
    )

    const plan = buildMergePlan(existing, existingSprints, importData)
    const result = applyMergePlan(existing, existingSprints, importData, plan)

    // Existing project unchanged
    expect(result.projects).toHaveLength(2)
    expect(result.projects[0].id).toBe('ex-1')

    // New project has fresh ID
    const newProject = result.projects[1]
    expect(newProject.name).toBe('Brand New')
    expect(newProject.id).not.toBe('imp-1')
    expect(newProject.milestones).toHaveLength(1)
    expect(newProject.milestones![0].id).not.toBe('im1') // fresh milestone ID

    // Sprints for new project
    const newSprints = result.sprints.filter((s) => s.projectId === newProject.id)
    expect(newSprints).toHaveLength(2)
    expect(newSprints[0].id).not.toBe('is-1')
    expect(newSprints[1].id).not.toBe('is-2')
  })

  it('preserves existing projects and sprints not in the import', () => {
    const existing = [
      makeProject({ id: 'ex-1', name: 'Project A' }),
      makeProject({ id: 'ex-2', name: 'Project B' }),
    ]
    const existingSprints = [
      makeSprint({ id: 'es-1', projectId: 'ex-1', sprintNumber: 1 }),
      makeSprint({ id: 'es-2', projectId: 'ex-2', sprintNumber: 1 }),
    ]

    // Import only touches Project A
    const importData = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })],
      [],
    )

    const plan = buildMergePlan(existing, existingSprints, importData)
    const result = applyMergePlan(existing, existingSprints, importData, plan)

    // Project B untouched
    expect(result.projects.find((p) => p.id === 'ex-2')).toBeDefined()
    expect(result.sprints.find((s) => s.id === 'es-2')).toBeDefined()
    // Project A sprints also untouched
    expect(result.sprints.find((s) => s.id === 'es-1')).toBeDefined()
  })

  it('handles import with no milestones', () => {
    const existing = [
      makeProject({
        id: 'ex-1',
        name: 'Project A',
        milestones: [
          { id: 'm1', name: 'MVP', backlogSize: 50, color: '#10b981', createdAt: '', updatedAt: '' },
        ],
      }),
    ]

    const importData = makeStoryMapExport(
      [makeProject({ id: 'imp-1', name: 'Project A' })], // no milestones
      [],
    )

    const plan = buildMergePlan(existing, [], importData)
    const result = applyMergePlan(existing, [], importData, plan)

    // Milestones replaced with empty (import has none)
    const updated = result.projects.find((p) => p.id === 'ex-1')!
    expect(updated.milestones).toHaveLength(0)
  })
})
