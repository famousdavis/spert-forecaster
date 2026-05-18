// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSampleProject, SAMPLE_PROJECT_NAME, generateUniqueProjectName } from './sample-project'
import { buildProjectSubsetExport } from './export-project'
import { useProjectStore } from '@/shared/state/project-store'
import { getLastSprintBacklog } from '@/features/forecast/hooks/useForecastInputs'
import { preCalculateSprintFactors } from '@/features/forecast/lib/productivity'
import { calculateSprintStartDate } from '@/shared/lib/dates'
import { validateImportData } from '@/shared/state/import-validation'

// sonner toast is a thin notification surface; mock to keep tests pure.
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function resetStore() {
  useProjectStore.setState({
    projects: [],
    sprints: [],
    viewingProjectId: null,
    forecastInputs: {},
    burnUpConfigs: {},
    shouldFocusNewProjectForm: false,
    _originRef: '',
    _changeLog: [],
  })
}

beforeEach(() => {
  resetStore()
})

describe('loadSampleProject', () => {
  it('creates exactly one project with the expected name and required fields', () => {
    loadSampleProject()
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)

    const sample = state.projects[0]
    expect(sample.name).toBe(SAMPLE_PROJECT_NAME)
    expect(sample.unitOfMeasure).toBe('story points')
    expect(sample.sprintCadenceWeeks).toBe(2)
    // firstSprintStartDate is technically optional in the Project type but ForecastTab
    // passes it with a non-null assertion. Seeder must always set it.
    expect(sample.firstSprintStartDate).toBeDefined()
    expect(sample.firstSprintStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('seeds exactly 8 sprints with includedInForecast: true', () => {
    loadSampleProject()
    const state = useProjectStore.getState()
    const sampleId = state.projects[0].id
    const projectSprints = state.sprints.filter((s) => s.projectId === sampleId)

    expect(projectSprints).toHaveLength(8)
    projectSprints.forEach((s) => {
      expect(s.includedInForecast).toBe(true)
      expect(s.doneValue).toBeGreaterThan(0)
      // Finish date must always land on a business day (Mon=1..Fri=5) — guarantee from
      // calculateSprintFinishDate via getPrecedingBusinessDay.
      const dow = new Date(s.sprintFinishDate + 'T00:00:00').getDay()
      expect(dow).toBeGreaterThanOrEqual(1)
      expect(dow).toBeLessThanOrEqual(5)
    })
  })

  it('seeds the last sprint with backlogAtSprintEnd = 200 (Delta D contract test)', () => {
    // This is the contract test that locks the auto-derivation chain. If any link breaks,
    // the sample project silently loses its "200 pre-fill" promise on the Forecast tab.
    loadSampleProject()
    const state = useProjectStore.getState()
    const sampleId = state.projects[0].id

    // Step 1: filter sprints to this project
    const projectSprints = state.sprints.filter((s) => s.projectId === sampleId)
    expect(projectSprints).toHaveLength(8)

    // Step 2: mirror useSprintData's filter (includedInForecast === true). Seeder must
    // set this on every sprint or auto-derivation excludes them silently.
    const includedSprints = projectSprints.filter((s) => s.includedInForecast === true)
    expect(includedSprints).toHaveLength(8)

    // Step 3: getLastSprintBacklog picks the largest sprintNumber with a defined
    // backlogAtSprintEnd. Final sprint in the sequence carries the 460 we promise.
    const backlog = getLastSprintBacklog(includedSprints)
    expect(backlog).toBe(460)
  })

  it('seeds four ordered milestones and one productivity adjustment', () => {
    loadSampleProject()
    const sample = useProjectStore.getState().projects[0]

    expect(sample.milestones).toHaveLength(4)
    // Order matters: milestones[0] ships first. MVP is seeded at backlogSize=0 to
    // demonstrate the "completed milestone" state (user-maintained model). The other
    // three sum to 460 (the seed's final remaining backlog).
    expect(sample.milestones?.[0]).toMatchObject({ name: 'MVP Release', backlogSize: 0, color: '#10b981' })
    expect(sample.milestones?.[1]).toMatchObject({ name: 'Beta Release', backlogSize: 100, color: '#3b82f6' })
    expect(sample.milestones?.[2]).toMatchObject({ name: 'GA Release', backlogSize: 150, color: '#f59e0b' })
    expect(sample.milestones?.[3]).toMatchObject({ name: 'v2 Release', backlogSize: 210, color: '#8b5cf6' })

    expect(sample.productivityAdjustments).toHaveLength(1)
    expect(sample.productivityAdjustments?.[0].name).toBe('Summer Break')
    expect(sample.productivityAdjustments?.[0].factor).toBe(0)
    expect(sample.productivityAdjustments?.[0].enabled).toBe(true)
  })

  it('Summer Break adjustment actually affects the forecast (regression guard)', () => {
    // Latent bug shipped in v0.31.1–v0.31.3: Spring Break was placed at week 10 from
    // firstSprintStartDate, which (with 8 completed sprints = 16 weeks of history) sits
    // ~6 weeks BEFORE the forecast period starts. preCalculateSprintFactors filters
    // adjustments whose endDate < firstForecastStart, so the seeded adjustment was
    // silently dropped — toggling it on/off produced no forecast change. This test
    // proves the v0.31.4 adjustment lives in the forecast period and its effect lands
    // at the expected sprint index.
    loadSampleProject()
    const sample = useProjectStore.getState().projects[0]
    const adj = sample.productivityAdjustments![0]
    const firstSprintStart = sample.firstSprintStartDate!
    const cadence = sample.sprintCadenceWeeks!

    // Forecast period begins at project sprint 9 (8 completed + 1).
    const forecastStartDate = calculateSprintStartDate(firstSprintStart, 9, cadence)

    // Position guard: adjustment must end on/after forecast start, otherwise it's
    // filtered out and the toggle has no effect.
    expect(adj.endDate >= forecastStartDate).toBe(true)

    // Effect guard: with the adjustment, the factors array must contain at least one
    // sprint at factor 0 (the wiped-out sprint). Without it, all 1.0s.
    const { factors: withAdj } = preCalculateSprintFactors(forecastStartDate, cadence, 1, [adj])
    const { factors: withoutAdj } = preCalculateSprintFactors(forecastStartDate, cadence, 1, [])

    expect(withAdj.some((f) => f === 0)).toBe(true)
    expect(withoutAdj.every((f) => f === 1)).toBe(true)

    // Placement guard: factor 0 should land at forecast sprint index 3 (project
    // sprint 12, since the seeder uses addWeeks(firstSprintStartDate, 22) and forecast
    // sprint 1 = project sprint 9). Locks in the pedagogical positioning.
    expect(withAdj[3]).toBe(0)
  })

  it('appends "(2)" on a second call: idempotency replaced with auto-rename in v0.33.2', () => {
    loadSampleProject()
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().projects[0].name).toBe(SAMPLE_PROJECT_NAME)

    loadSampleProject()
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(2)
    const names = state.projects.map((p) => p.name).sort()
    expect(names).toEqual([SAMPLE_PROJECT_NAME, `${SAMPLE_PROJECT_NAME} (2)`])
  })

  it('appends "(3)" when both the base name and "(2)" already exist (walker advances)', () => {
    loadSampleProject()
    loadSampleProject()
    loadSampleProject()
    const names = useProjectStore.getState().projects.map((p) => p.name).sort()
    expect(names).toEqual([
      SAMPLE_PROJECT_NAME,
      `${SAMPLE_PROJECT_NAME} (2)`,
      `${SAMPLE_PROJECT_NAME} (3)`,
    ])
  })

  it('uses "(2)" when a user-created project occupies the canonical sample name', () => {
    // User manually creates a project with the sample's exact name (different content).
    useProjectStore.getState().addProject({
      name: SAMPLE_PROJECT_NAME,
      unitOfMeasure: 'hours',
    })
    expect(useProjectStore.getState().projects).toHaveLength(1)

    loadSampleProject()

    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(2)
    // User's project is untouched (still 'hours'); the sample lands as "(2)".
    const user = state.projects.find((p) => p.unitOfMeasure === 'hours')
    const sample = state.projects.find((p) => p.unitOfMeasure === 'story points')
    expect(user?.name).toBe(SAMPLE_PROJECT_NAME)
    expect(sample?.name).toBe(`${SAMPLE_PROJECT_NAME} (2)`)
  })
})

describe('sample project export → import round-trip', () => {
  it('passes validateImportData after a full subset export (regression: v0.33.4 completed-milestone)', () => {
    // The seeded "MVP Release" milestone has backlogSize: 0 as the
    // "completed milestone" sentinel under the v0.31.2 user-maintained
    // milestone model. Before v0.33.4, the import validator rejected
    // backlogSize < 0.01, which made the exported sample project (and any
    // user project containing a completed milestone) unimportable. This
    // round-trip test guards the user-reported reproduction: load → export
    // → re-import.
    loadSampleProject()
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)
    const project = state.projects[0]

    // The completed milestone must actually be present in the seed — if
    // someone removes it later, the regression test is meaningless.
    const completed = project.milestones?.find((m) => m.backlogSize === 0)
    expect(completed).toBeDefined()
    expect(completed?.name).toBe('MVP Release')

    const payload = buildProjectSubsetExport([project.id], {
      projects: state.projects,
      sprints: state.sprints,
      originRef: '',
      storageRef: '',
      changeLog: [],
    })

    // Serialize and re-parse to exercise the same JSON round-trip a real
    // file export + file import would go through.
    const roundTripped = JSON.parse(JSON.stringify(payload))
    expect(() => validateImportData(roundTripped)).not.toThrow()
  })
})

describe('generateUniqueProjectName', () => {
  it('returns the base name when not in the existing set', () => {
    expect(generateUniqueProjectName('Foo', new Set())).toBe('Foo')
    expect(generateUniqueProjectName('Foo', new Set(['Bar', 'Baz']))).toBe('Foo')
  })

  it('returns "(2)" when only the base is taken', () => {
    expect(generateUniqueProjectName('Foo', new Set(['Foo']))).toBe('Foo (2)')
  })

  it('returns "(3)" when base and "(2)" are both taken', () => {
    expect(generateUniqueProjectName('Foo', new Set(['Foo', 'Foo (2)']))).toBe('Foo (3)')
  })

  it('skips gaps — returns "(2)" when only "(3)" is taken (base is still free)', () => {
    // Base name not taken → walker doesn't run, base is returned.
    expect(generateUniqueProjectName('Foo', new Set(['Foo (3)']))).toBe('Foo')
  })

  it('finds the next gap when "(2)" and "(4)" are taken but "(3)" is free', () => {
    expect(
      generateUniqueProjectName('Foo', new Set(['Foo', 'Foo (2)', 'Foo (4)'])),
    ).toBe('Foo (3)')
  })
})
