// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSampleProject, SAMPLE_PROJECT_NAME } from './sample-project'
import { useProjectStore } from '@/shared/state/project-store'
import { getLastSprintBacklog } from '@/features/forecast/hooks/useForecastInputs'

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
    // backlogAtSprintEnd. Final sprint in the sequence carries the 200 we promise.
    const backlog = getLastSprintBacklog(includedSprints)
    expect(backlog).toBe(200)
  })

  it('seeds one milestone and one productivity adjustment', () => {
    loadSampleProject()
    const sample = useProjectStore.getState().projects[0]
    expect(sample.milestones).toHaveLength(1)
    expect(sample.milestones?.[0].name).toBe('MVP Release')
    expect(sample.milestones?.[0].backlogSize).toBe(100)

    expect(sample.productivityAdjustments).toHaveLength(1)
    expect(sample.productivityAdjustments?.[0].name).toBe('Production Issues')
    expect(sample.productivityAdjustments?.[0].factor).toBe(0.5)
    expect(sample.productivityAdjustments?.[0].enabled).toBe(true)
  })

  it('is idempotent against double-click: the second call no-ops', () => {
    loadSampleProject()
    const firstCount = useProjectStore.getState().projects.length

    loadSampleProject()
    const secondCount = useProjectStore.getState().projects.length

    expect(firstCount).toBe(1)
    expect(secondCount).toBe(1)
  })

  it('no-ops when a project with the sample name already exists (any origin)', () => {
    // User manually creates a project with the sample's exact name.
    useProjectStore.getState().addProject({
      name: SAMPLE_PROJECT_NAME,
      unitOfMeasure: 'hours',
    })
    expect(useProjectStore.getState().projects).toHaveLength(1)

    loadSampleProject()
    // Still only one project — the user's. No duplicate seeded.
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().projects[0].unitOfMeasure).toBe('hours')
  })
})
