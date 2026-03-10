// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { validateImportData, type ExportData } from './import-validation'

/** Helper: minimal valid project */
function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'My Project',
    unitOfMeasure: 'story points',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Helper: minimal valid sprint */
function makeSprint(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sprint-1',
    projectId: 'proj-1',
    sprintNumber: 1,
    sprintStartDate: '2026-01-06',
    sprintFinishDate: '2026-01-17',
    doneValue: 10,
    includedInForecast: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Helper: minimal valid milestone */
function makeMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ms-1',
    name: 'MVP',
    backlogSize: 50,
    color: '#ff0000',
    showOnChart: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Helper: wrap projects/sprints in ExportData envelope */
function makeExportData(
  projects: unknown[] = [makeProject()],
  sprints: unknown[] = [],
  extra: Record<string, unknown> = {},
): unknown {
  return {
    version: '0.19.0',
    exportedAt: '2026-01-15T00:00:00Z',
    projects,
    sprints,
    ...extra,
  }
}

// ─── Top-level structure ───────────────────────────────────────────

describe('validateImportData – top-level structure', () => {
  it('rejects null', () => {
    expect(() => validateImportData(null)).toThrow('must be a JSON object')
  })

  it('rejects primitive', () => {
    expect(() => validateImportData('hello')).toThrow('must be a JSON object')
  })

  it('rejects missing projects array', () => {
    expect(() => validateImportData({ sprints: [] })).toThrow('missing a valid "projects" array')
  })

  it('rejects missing sprints array', () => {
    expect(() => validateImportData({ projects: [] })).toThrow('missing a valid "sprints" array')
  })

  it('accepts empty projects and sprints', () => {
    expect(validateImportData(makeExportData([], []))).toBe(true)
  })

  it('accepts optional source field', () => {
    expect(validateImportData(makeExportData([], [], { source: 'spert-story-map' }))).toBe(true)
  })
})

// ─── Project validation ────────────────────────────────────────────

describe('validateImportData – project validation', () => {
  it('rejects non-object project', () => {
    expect(() => validateImportData(makeExportData(['not-an-object']))).toThrow(
      'Project at index 0 is not a valid object',
    )
  })

  it('rejects null project', () => {
    expect(() => validateImportData(makeExportData([null]))).toThrow(
      'Project at index 0 is not a valid object',
    )
  })

  it('rejects project with missing id', () => {
    expect(() => validateImportData(makeExportData([makeProject({ id: '' })]))).toThrow(
      'missing a valid "id"',
    )
  })

  it('rejects project with non-string id', () => {
    expect(() => validateImportData(makeExportData([makeProject({ id: 42 })]))).toThrow(
      'missing a valid "id"',
    )
  })

  it('rejects duplicate project IDs', () => {
    const projects = [makeProject({ id: 'dup' }), makeProject({ id: 'dup', name: 'Another' })]
    expect(() => validateImportData(makeExportData(projects))).toThrow(
      'Duplicate project ID "dup"',
    )
  })

  it('rejects project with missing name', () => {
    expect(() => validateImportData(makeExportData([makeProject({ name: '' })]))).toThrow(
      'missing a valid "name"',
    )
  })

  it('accepts project name at exactly 200 chars', () => {
    const name = 'A'.repeat(200)
    expect(validateImportData(makeExportData([makeProject({ name })]))).toBe(true)
  })

  it('rejects project name at 201 chars', () => {
    const name = 'A'.repeat(201)
    expect(() => validateImportData(makeExportData([makeProject({ name })]))).toThrow(
      'name exceeding 200 characters',
    )
  })

  it('rejects project with missing unitOfMeasure', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ unitOfMeasure: 42 })])),
    ).toThrow('missing a valid "unitOfMeasure"')
  })

  it('accepts empty unitOfMeasure string', () => {
    expect(validateImportData(makeExportData([makeProject({ unitOfMeasure: '' })]))).toBe(true)
  })

  it('rejects unitOfMeasure exceeding 200 chars', () => {
    const unitOfMeasure = 'X'.repeat(201)
    expect(() =>
      validateImportData(makeExportData([makeProject({ unitOfMeasure })])),
    ).toThrow('unitOfMeasure exceeding 200 characters')
  })

  it('rejects sprintCadenceWeeks of 0', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ sprintCadenceWeeks: 0 })])),
    ).toThrow('invalid sprintCadenceWeeks')
  })

  it('rejects sprintCadenceWeeks of 53', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ sprintCadenceWeeks: 53 })])),
    ).toThrow('invalid sprintCadenceWeeks')
  })

  it('accepts sprintCadenceWeeks of 1', () => {
    expect(
      validateImportData(makeExportData([makeProject({ sprintCadenceWeeks: 1 })])),
    ).toBe(true)
  })

  it('accepts sprintCadenceWeeks of 52', () => {
    expect(
      validateImportData(makeExportData([makeProject({ sprintCadenceWeeks: 52 })])),
    ).toBe(true)
  })

  it('accepts undefined sprintCadenceWeeks', () => {
    expect(
      validateImportData(makeExportData([makeProject({ sprintCadenceWeeks: undefined })])),
    ).toBe(true)
  })

  it('rejects invalid firstSprintStartDate', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ firstSprintStartDate: 'not-a-date' })])),
    ).toThrow('invalid firstSprintStartDate')
  })

  it('accepts undefined firstSprintStartDate', () => {
    expect(
      validateImportData(makeExportData([makeProject({ firstSprintStartDate: undefined })])),
    ).toBe(true)
  })
})

// ─── Milestone validation ──────────────────────────────────────────

describe('validateImportData – milestone validation', () => {
  it('accepts project with no milestones field', () => {
    const proj = makeProject()
    delete (proj as Record<string, unknown>).milestones
    expect(validateImportData(makeExportData([proj]))).toBe(true)
  })

  it('accepts project with empty milestones array', () => {
    expect(validateImportData(makeExportData([makeProject({ milestones: [] })]))).toBe(true)
  })

  it('rejects milestones that is not an array', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ milestones: 'nope' })])),
    ).toThrow('invalid "milestones" (must be an array)')
  })

  it('rejects more than 10 milestones', () => {
    const milestones = Array.from({ length: 11 }, (_, i) =>
      makeMilestone({ id: `ms-${i}`, name: `MS ${i}`, backlogSize: 10 + i }),
    )
    expect(() =>
      validateImportData(makeExportData([makeProject({ milestones })])),
    ).toThrow('more than 10 milestones')
  })

  it('accepts exactly 10 milestones', () => {
    const milestones = Array.from({ length: 10 }, (_, i) =>
      makeMilestone({ id: `ms-${i}`, name: `MS ${i}`, backlogSize: 10 + i }),
    )
    expect(validateImportData(makeExportData([makeProject({ milestones })]))).toBe(true)
  })

  it('rejects non-object milestone', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ milestones: [42] })])),
    ).toThrow('milestone at index 0 is not a valid object')
  })

  it('rejects null milestone', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ milestones: [null] })])),
    ).toThrow('milestone at index 0 is not a valid object')
  })

  it('rejects milestone with missing id', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject({ milestones: [makeMilestone({ id: '' })] })])),
    ).toThrow('missing a valid "id"')
  })

  it('rejects duplicate milestone IDs', () => {
    const milestones = [
      makeMilestone({ id: 'dup-ms' }),
      makeMilestone({ id: 'dup-ms', name: 'Another' }),
    ]
    expect(() =>
      validateImportData(makeExportData([makeProject({ milestones })])),
    ).toThrow('duplicate milestone ID "dup-ms"')
  })

  it('rejects milestone with missing name', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ name: '' })] })]),
      ),
    ).toThrow('missing a valid "name"')
  })

  it('rejects milestone name exceeding 200 chars', () => {
    const name = 'M'.repeat(201)
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ name })] })]),
      ),
    ).toThrow('name exceeding 200 characters')
  })

  it('rejects backlogSize of 0', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ backlogSize: 0 })] })]),
      ),
    ).toThrow('invalid backlogSize')
  })

  it('rejects negative backlogSize', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ backlogSize: -5 })] })]),
      ),
    ).toThrow('invalid backlogSize')
  })

  it('rejects backlogSize exceeding 999999', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ backlogSize: 1000000 })] })]),
      ),
    ).toThrow('invalid backlogSize')
  })

  it('accepts backlogSize at boundary 0.01', () => {
    expect(
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ backlogSize: 0.01 })] })]),
      ),
    ).toBe(true)
  })

  it('accepts backlogSize at boundary 999999', () => {
    expect(
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ backlogSize: 999999 })] })]),
      ),
    ).toBe(true)
  })

  it('rejects milestone with missing color', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ color: '' })] })]),
      ),
    ).toThrow('missing a valid "color"')
  })

  it('rejects milestone with non-string color', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ color: 123 })] })]),
      ),
    ).toThrow('missing a valid "color"')
  })

  it('rejects non-boolean showOnChart', () => {
    expect(() =>
      validateImportData(
        makeExportData([
          makeProject({ milestones: [makeMilestone({ showOnChart: 'yes' })] }),
        ]),
      ),
    ).toThrow('invalid "showOnChart" (must be a boolean)')
  })

  it('accepts showOnChart as true', () => {
    expect(
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ showOnChart: true })] })]),
      ),
    ).toBe(true)
  })

  it('accepts showOnChart as false', () => {
    expect(
      validateImportData(
        makeExportData([makeProject({ milestones: [makeMilestone({ showOnChart: false })] })]),
      ),
    ).toBe(true)
  })

  it('accepts undefined showOnChart', () => {
    const ms = makeMilestone()
    delete (ms as Record<string, unknown>).showOnChart
    expect(
      validateImportData(makeExportData([makeProject({ milestones: [ms] })])),
    ).toBe(true)
  })
})

// ─── Sprint validation ─────────────────────────────────────────────

describe('validateImportData – sprint validation', () => {
  it('rejects non-object sprint', () => {
    expect(() => validateImportData(makeExportData([makeProject()], ['not-an-object']))).toThrow(
      'Sprint at index 0 is not a valid object',
    )
  })

  it('rejects null sprint', () => {
    expect(() => validateImportData(makeExportData([makeProject()], [null]))).toThrow(
      'Sprint at index 0 is not a valid object',
    )
  })

  it('rejects sprint with missing id', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject()], [makeSprint({ id: '' })])),
    ).toThrow('missing a valid "id"')
  })

  it('rejects duplicate sprint IDs', () => {
    const sprints = [
      makeSprint({ id: 'dup-s' }),
      makeSprint({ id: 'dup-s', sprintNumber: 2 }),
    ]
    expect(() => validateImportData(makeExportData([makeProject()], sprints))).toThrow(
      'Duplicate sprint ID "dup-s"',
    )
  })

  it('rejects sprint with missing projectId', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject()], [makeSprint({ projectId: '' })])),
    ).toThrow('missing a valid "projectId"')
  })

  it('rejects sprintNumber of 0', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject()], [makeSprint({ sprintNumber: 0 })])),
    ).toThrow('invalid sprintNumber (must be 1-10000)')
  })

  it('rejects sprintNumber of 10001', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject()], [makeSprint({ sprintNumber: 10001 })])),
    ).toThrow('invalid sprintNumber (must be 1-10000)')
  })

  it('accepts sprintNumber at boundary 1', () => {
    expect(
      validateImportData(makeExportData([makeProject()], [makeSprint({ sprintNumber: 1 })])),
    ).toBe(true)
  })

  it('accepts sprintNumber at boundary 10000', () => {
    expect(
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ sprintNumber: 10000 })]),
      ),
    ).toBe(true)
  })

  it('rejects fractional sprintNumber', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject()], [makeSprint({ sprintNumber: 1.5 })])),
    ).toThrow('non-integer sprintNumber')
  })

  it('rejects negative doneValue', () => {
    expect(() =>
      validateImportData(makeExportData([makeProject()], [makeSprint({ doneValue: -1 })])),
    ).toThrow('invalid doneValue')
  })

  it('accepts doneValue of 0', () => {
    expect(
      validateImportData(makeExportData([makeProject()], [makeSprint({ doneValue: 0 })])),
    ).toBe(true)
  })

  it('rejects doneValue exceeding 999999', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ doneValue: 1000000 })]),
      ),
    ).toThrow('invalid doneValue')
  })

  it('rejects negative backlogAtSprintEnd', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ backlogAtSprintEnd: -1 })]),
      ),
    ).toThrow('invalid backlogAtSprintEnd')
  })

  it('accepts backlogAtSprintEnd of 0', () => {
    expect(
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ backlogAtSprintEnd: 0 })]),
      ),
    ).toBe(true)
  })

  it('accepts undefined backlogAtSprintEnd', () => {
    const sprint = makeSprint()
    delete (sprint as Record<string, unknown>).backlogAtSprintEnd
    expect(validateImportData(makeExportData([makeProject()], [sprint]))).toBe(true)
  })

  it('rejects invalid sprintStartDate format', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ sprintStartDate: '01/06/2026' })]),
      ),
    ).toThrow('invalid sprintStartDate')
  })

  it('rejects invalid sprintFinishDate format', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ sprintFinishDate: 'bad-date' })]),
      ),
    ).toThrow('invalid sprintFinishDate')
  })
})

// ─── Date validation edge cases ────────────────────────────────────

describe('validateImportData – date edge cases', () => {
  it('rejects auto-corrected date Feb 30', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ firstSprintStartDate: '2026-02-30' })]),
      ),
    ).toThrow('invalid firstSprintStartDate')
  })

  it('rejects invalid leap year date (2025-02-29)', () => {
    // 2025 is not a leap year
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ firstSprintStartDate: '2025-02-29' })]),
      ),
    ).toThrow('invalid firstSprintStartDate')
  })

  it('accepts valid leap year date (2024-02-29)', () => {
    expect(
      validateImportData(
        makeExportData([makeProject({ firstSprintStartDate: '2024-02-29' })]),
      ),
    ).toBe(true)
  })

  it('rejects auto-corrected sprint start date (month 13)', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ sprintStartDate: '2026-13-01' })]),
      ),
    ).toThrow('invalid sprintStartDate')
  })

  it('rejects auto-corrected sprint finish date (day 32)', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject()], [makeSprint({ sprintFinishDate: '2026-01-32' })]),
      ),
    ).toThrow('invalid sprintFinishDate')
  })

  it('rejects non-string date', () => {
    expect(() =>
      validateImportData(
        makeExportData([makeProject({ firstSprintStartDate: 20260101 })]),
      ),
    ).toThrow('invalid firstSprintStartDate')
  })
})

// ─── Full valid export ─────────────────────────────────────────────

describe('validateImportData – full valid data', () => {
  it('accepts complete export with source field, projects, sprints, and milestones', () => {
    const data = makeExportData(
      [
        makeProject({
          id: 'p1',
          sprintCadenceWeeks: 2,
          firstSprintStartDate: '2026-01-06',
          milestones: [
            makeMilestone({ id: 'ms-1', backlogSize: 50 }),
            makeMilestone({ id: 'ms-2', name: 'GA', backlogSize: 100 }),
          ],
        }),
      ],
      [
        makeSprint({ id: 's1', sprintNumber: 1 }),
        makeSprint({ id: 's2', sprintNumber: 2, doneValue: 15, backlogAtSprintEnd: 85 }),
      ],
      { source: 'spert-story-map' },
    )
    expect(validateImportData(data)).toBe(true)
  })

  it('accepts multiple projects with separate sprints', () => {
    const data = makeExportData(
      [
        makeProject({ id: 'p1', name: 'Alpha' }),
        makeProject({ id: 'p2', name: 'Beta' }),
      ],
      [
        makeSprint({ id: 's1', projectId: 'p1', sprintNumber: 1 }),
        makeSprint({ id: 's2', projectId: 'p2', sprintNumber: 1 }),
      ],
    )
    expect(validateImportData(data)).toBe(true)
  })
})
