// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { getLastSprintBacklog } from './useForecastInputs'
import type { Sprint } from '@/shared/types'

function createSprint(overrides: Partial<Sprint> & { sprintNumber: number }): Sprint {
  return {
    id: `sprint-${overrides.sprintNumber}`,
    projectId: 'project-1',
    doneValue: 10,
    includedInForecast: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('getLastSprintBacklog', () => {
  it('returns undefined for empty sprints array', () => {
    expect(getLastSprintBacklog([])).toBeUndefined()
  })

  it('returns backlogAtSprintEnd for a single sprint', () => {
    const sprints = [createSprint({ sprintNumber: 1, backlogAtSprintEnd: 100 })]
    expect(getLastSprintBacklog(sprints)).toBe(100)
  })

  it('returns the last sprint backlog when sprints are in order', () => {
    const sprints = [
      createSprint({ sprintNumber: 1, backlogAtSprintEnd: 100 }),
      createSprint({ sprintNumber: 2, backlogAtSprintEnd: 80 }),
      createSprint({ sprintNumber: 3, backlogAtSprintEnd: 60 }),
    ]
    expect(getLastSprintBacklog(sprints)).toBe(60)
  })

  it('returns the highest sprint number backlog when sprints are out of order', () => {
    const sprints = [
      createSprint({ sprintNumber: 5, backlogAtSprintEnd: 50 }),
      createSprint({ sprintNumber: 3, backlogAtSprintEnd: 70 }),
      createSprint({ sprintNumber: 7, backlogAtSprintEnd: 30 }),
      createSprint({ sprintNumber: 1, backlogAtSprintEnd: 100 }),
    ]
    expect(getLastSprintBacklog(sprints)).toBe(30) // sprint 7 has highest number
  })

  it('returns undefined when highest sprint has no backlog field', () => {
    const sprints = [
      createSprint({ sprintNumber: 1, backlogAtSprintEnd: 100 }),
      createSprint({ sprintNumber: 2 }), // backlogAtSprintEnd is undefined
    ]
    expect(getLastSprintBacklog(sprints)).toBeUndefined()
  })

  it('returns 0 when highest sprint has zero backlog (falsy but valid)', () => {
    const sprints = [
      createSprint({ sprintNumber: 1, backlogAtSprintEnd: 100 }),
      createSprint({ sprintNumber: 2, backlogAtSprintEnd: 0 }),
    ]
    expect(getLastSprintBacklog(sprints)).toBe(0)
  })
})
