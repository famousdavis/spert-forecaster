// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { computeCumulativeScope, computeShippedMilestoneInfo } from './milestones'
import type { Milestone, Sprint } from '@/shared/types'

function m(name: string, backlogSize: number, opts: Partial<Milestone> = {}): Milestone {
  return {
    id: opts.id ?? `m-${name}`,
    name,
    backlogSize,
    color: opts.color ?? '#000000',
    showOnChart: opts.showOnChart ?? true,
    createdAt: opts.createdAt ?? '2026-01-01',
    updatedAt: opts.updatedAt ?? '2026-01-01',
  }
}

function s(sprintNumber: number, doneValue: number, finishDate = '2026-01-15'): Sprint {
  return {
    id: `s-${sprintNumber}`,
    projectId: 'p',
    sprintNumber,
    sprintStartDate: '2026-01-01',
    sprintFinishDate: finishDate,
    doneValue,
    includedInForecast: true,
  }
}

describe('computeCumulativeScope', () => {
  it('returns empty array for empty milestones', () => {
    expect(computeCumulativeScope([])).toEqual([])
  })

  it('accumulates backlogSize across milestones in order', () => {
    const milestones = [m('MVP', 150), m('Beta', 200), m('GA', 250), m('v2', 200)]
    expect(computeCumulativeScope(milestones)).toEqual([150, 350, 600, 800])
  })

  it('handles a single milestone', () => {
    expect(computeCumulativeScope([m('MVP', 100)])).toEqual([100])
  })

  it('handles zero-size milestones as no-op markers', () => {
    const milestones = [m('Kickoff', 0), m('MVP', 100)]
    expect(computeCumulativeScope(milestones)).toEqual([0, 100])
  })
})

describe('computeShippedMilestoneInfo', () => {
  it('returns empty array for empty milestones', () => {
    expect(computeShippedMilestoneInfo([], undefined)).toEqual([])
    expect(computeShippedMilestoneInfo([], [])).toEqual([])
  })

  it('returns all-not-shipped when no sprint history provided', () => {
    const milestones = [m('MVP', 150), m('Beta', 200)]
    expect(computeShippedMilestoneInfo(milestones, undefined)).toEqual([
      { shipped: false },
      { shipped: false },
    ])
    expect(computeShippedMilestoneInfo(milestones, [])).toEqual([
      { shipped: false },
      { shipped: false },
    ])
  })

  it('marks shipped milestones with the sprint number where the threshold was crossed', () => {
    // MVP at cumulative 100, team delivers [40, 30, 40, 50] = cumulative [40, 70, 110, 160]
    // 100 crossed at sprint 3 (cumulative 110).
    const milestones = [m('MVP', 100)]
    const sprints = [
      s(1, 40, '2026-01-15'),
      s(2, 30, '2026-01-29'),
      s(3, 40, '2026-02-12'),
      s(4, 50, '2026-02-26'),
    ]
    const info = computeShippedMilestoneInfo(milestones, sprints)
    expect(info[0]).toEqual({
      shipped: true,
      shippedAtSprintNumber: 3,
      shippedAtFinishDate: '2026-02-12',
    })
  })

  it('marks each milestone at its own crossing sprint when multiple ship in the same trial', () => {
    // Cumulative scope: [50, 120, 200]
    // Sprint velocities: [30, 30, 70, 80] → cumulative work [30, 60, 130, 210]
    // Milestone[0] (50) crossed at sprint 2 (60 ≥ 50)
    // Milestone[1] (120) crossed at sprint 3 (130 ≥ 120)
    // Milestone[2] (200) crossed at sprint 4 (210 ≥ 200)
    const milestones = [m('A', 50), m('B', 70), m('C', 80)]
    const sprints = [
      s(1, 30, '2026-01-15'),
      s(2, 30, '2026-01-29'),
      s(3, 70, '2026-02-12'),
      s(4, 80, '2026-02-26'),
    ]
    const info = computeShippedMilestoneInfo(milestones, sprints)
    expect(info[0]).toMatchObject({ shipped: true, shippedAtSprintNumber: 2 })
    expect(info[1]).toMatchObject({ shipped: true, shippedAtSprintNumber: 3 })
    expect(info[2]).toMatchObject({ shipped: true, shippedAtSprintNumber: 4 })
  })

  it('marks multiple milestones at the same sprint when one big delivery crosses several', () => {
    // Cumulative scope: [10, 20, 30]
    // Sprint 1 delivers 50 → crosses all three thresholds in a single sprint.
    const milestones = [m('A', 10), m('B', 10), m('C', 10)]
    const sprints = [s(1, 50, '2026-01-15')]
    const info = computeShippedMilestoneInfo(milestones, sprints)
    expect(info[0]).toMatchObject({ shipped: true, shippedAtSprintNumber: 1 })
    expect(info[1]).toMatchObject({ shipped: true, shippedAtSprintNumber: 1 })
    expect(info[2]).toMatchObject({ shipped: true, shippedAtSprintNumber: 1 })
  })

  it('leaves later milestones unshipped when work falls short', () => {
    const milestones = [m('MVP', 100), m('Beta', 200), m('GA', 300)]
    const sprints = [s(1, 50, '2026-01-15'), s(2, 80, '2026-01-29')] // cumulative 130
    const info = computeShippedMilestoneInfo(milestones, sprints)
    expect(info[0]).toMatchObject({ shipped: true }) // 100 ≤ 130
    expect(info[1]).toEqual({ shipped: false }) // 200 > 130
    expect(info[2]).toEqual({ shipped: false }) // 300 > 130
  })

  it('handles sprints arriving in unsorted order', () => {
    const milestones = [m('MVP', 100)]
    const sprints = [s(3, 40, '2026-02-12'), s(1, 30, '2026-01-15'), s(2, 40, '2026-01-29')]
    const info = computeShippedMilestoneInfo(milestones, sprints)
    // Cumulative by sorted order: 30, 70, 110 → 100 crossed at sprint 3.
    expect(info[0]).toMatchObject({ shipped: true, shippedAtSprintNumber: 3 })
  })

  it('aligns the output array with the input milestones by index', () => {
    const milestones = [m('A', 10), m('B', 10)]
    const info = computeShippedMilestoneInfo(milestones, [])
    expect(info).toHaveLength(2)
    expect(info[0]).toEqual({ shipped: false })
    expect(info[1]).toEqual({ shipped: false })
  })
})
