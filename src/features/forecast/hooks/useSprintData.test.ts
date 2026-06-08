// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { today } from '@/shared/lib/dates'
import type { Project, Sprint } from '@/shared/types'
import { useSprintData } from './useSprintData'

const PROJECT_ID = 'test-project'
const FIRST_SPRINT_START = '2026-08-17' // a Monday, in the future relative to "today"

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: 'Brand New Project',
    unitOfMeasure: 'points',
    sprintCadenceWeeks: 3,
    firstSprintStartDate: FIRST_SPRINT_START,
    createdAt: '2026-06-08T00:00:00Z',
    updatedAt: '2026-06-08T00:00:00Z',
    ...overrides,
  }
}

function makeSprint(sprintNumber: number): Sprint {
  return {
    id: `sprint-${sprintNumber}`,
    projectId: PROJECT_ID,
    sprintNumber,
    sprintStartDate: FIRST_SPRINT_START,
    sprintFinishDate: '2026-09-04',
    doneValue: 20,
    includedInForecast: true,
    createdAt: '2026-08-17T00:00:00Z',
    updatedAt: '2026-08-17T00:00:00Z',
  }
}

function setStore(project: Project, sprints: Sprint[]) {
  useProjectStore.setState({
    projects: [project],
    sprints,
    viewingProjectId: project.id,
  })
}

describe('useSprintData — forecastStartDate', () => {
  beforeEach(() => {
    setStore(makeProject(), [])
  })

  // Regression for v0.35.4: an unstarted project (cadence + first-sprint date set,
  // zero logged sprints) must anchor the forecast on its first sprint's start date,
  // NOT today(). The old `projectSprints.length === 0 → today()` short-circuit made a
  // brand-new project forecast from the current date, so every derived date (sprint
  // labels, CDF, burn-up, deadline panel) was wrong until the first sprint was logged.
  it('defaults to firstSprintStartDate when the project has no logged sprints', () => {
    setStore(makeProject(), [])
    const { result } = renderHook(() => useSprintData())
    expect(result.current.forecastStartDate).toBe(FIRST_SPRINT_START)
    expect(result.current.forecastStartDate).not.toBe(today())
  })

  // The today() fallback is retained for the genuinely-unconfigured case: a project
  // whose first-sprint date hasn't been set yet on the Sprint History tab.
  it('falls back to today() when firstSprintStartDate is unset', () => {
    setStore(makeProject({ firstSprintStartDate: undefined }), [])
    const { result } = renderHook(() => useSprintData())
    expect(result.current.forecastStartDate).toBe(today())
  })

  it('falls back to today() when sprintCadenceWeeks is unset', () => {
    setStore(makeProject({ sprintCadenceWeeks: undefined }), [])
    const { result } = renderHook(() => useSprintData())
    expect(result.current.forecastStartDate).toBe(today())
  })

  // The history path is unaffected: with a logged sprint the anchor cascades forward
  // to the next sprint's start (later than the first-sprint date, never today()).
  it('cascades forward past firstSprintStartDate once a sprint is logged', () => {
    setStore(makeProject(), [makeSprint(1)])
    const { result } = renderHook(() => useSprintData())
    expect(result.current.forecastStartDate > FIRST_SPRINT_START).toBe(true)
    expect(result.current.forecastStartDate).not.toBe(today())
  })
})
