// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  computeCumulativeScope,
  computeMilestoneCompletionInfo,
  computeVisibleForecastMilestones,
} from './milestones'
import type { Milestone } from '@/shared/types'

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

describe('computeCumulativeScope', () => {
  it('returns empty array for empty milestones', () => {
    expect(computeCumulativeScope([])).toEqual([])
  })

  it('accumulates backlogSize across milestones in order', () => {
    const milestones = [m('MVP', 100), m('Beta', 130), m('GA', 150), m('v2', 210)]
    expect(computeCumulativeScope(milestones)).toEqual([100, 230, 380, 590])
  })

  it('handles a single milestone', () => {
    expect(computeCumulativeScope([m('MVP', 100)])).toEqual([100])
  })

  it('handles zero-size (completed) milestones', () => {
    // MVP has been completed (user zeroed it). Beta and GA are still ahead.
    const milestones = [m('MVP', 0), m('Beta', 100), m('GA', 150)]
    expect(computeCumulativeScope(milestones)).toEqual([0, 100, 250])
  })
})

describe('computeMilestoneCompletionInfo', () => {
  it('returns empty array for empty milestones', () => {
    expect(computeMilestoneCompletionInfo([])).toEqual([])
  })

  it('marks milestones with backlogSize === 0 as completed', () => {
    const milestones = [m('MVP', 0), m('Beta', 100), m('GA', 150), m('v2', 210)]
    expect(computeMilestoneCompletionInfo(milestones)).toEqual([
      { completed: true },
      { completed: false },
      { completed: false },
      { completed: false },
    ])
  })

  it('marks all milestones not-completed when every backlogSize is positive', () => {
    const milestones = [m('A', 10), m('B', 20), m('C', 30)]
    expect(computeMilestoneCompletionInfo(milestones)).toEqual([
      { completed: false },
      { completed: false },
      { completed: false },
    ])
  })

  it('marks all milestones completed when every backlogSize is zero', () => {
    const milestones = [m('A', 0), m('B', 0)]
    expect(computeMilestoneCompletionInfo(milestones)).toEqual([
      { completed: true },
      { completed: true },
    ])
  })

  it('is order-independent and pure — driven only by backlogSize', () => {
    // A milestone in the middle of the list can be completed while others around it
    // are not (e.g., a "kickoff" marker the user maintains at 0).
    const milestones = [m('A', 50), m('Kickoff', 0), m('B', 100)]
    expect(computeMilestoneCompletionInfo(milestones)).toEqual([
      { completed: false },
      { completed: true },
      { completed: false },
    ])
  })

  it('aligns the output array with the input milestones by index', () => {
    const milestones = [m('A', 10), m('B', 20)]
    const info = computeMilestoneCompletionInfo(milestones)
    expect(info).toHaveLength(2)
    expect(info[0]).toEqual({ completed: false })
    expect(info[1]).toEqual({ completed: false })
  })
})

describe('computeVisibleForecastMilestones', () => {
  it('returns all milestones with original indices when none are completed or hidden', () => {
    const milestones = [m('A', 50), m('B', 30), m('C', 20)]
    const info = computeMilestoneCompletionInfo(milestones)
    const visible = computeVisibleForecastMilestones(milestones, info)
    expect(visible).toEqual([
      { milestone: milestones[0], originalIndex: 0 },
      { milestone: milestones[1], originalIndex: 1 },
      { milestone: milestones[2], originalIndex: 2 },
    ])
  })

  it('filters out milestones the user has unchecked via showOnChart=false', () => {
    const milestones = [
      m('A', 50, { showOnChart: false }),
      m('B', 30),
      m('C', 20, { showOnChart: false }),
    ]
    const info = computeMilestoneCompletionInfo(milestones)
    const visible = computeVisibleForecastMilestones(milestones, info)
    expect(visible).toHaveLength(1)
    expect(visible[0]).toEqual({ milestone: milestones[1], originalIndex: 1 })
  })

  it('filters out completed milestones (backlogSize=0)', () => {
    // v0.32.1: completed milestones have a cumulative threshold equal to the
    // preceding milestone's, so offering them in a forecast control would
    // duplicate a different milestone's forecast under a misleading label.
    const milestones = [m('A', 50), m('Done', 0), m('C', 20)]
    const info = computeMilestoneCompletionInfo(milestones)
    const visible = computeVisibleForecastMilestones(milestones, info)
    expect(visible).toHaveLength(2)
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 2])
    expect(visible[1].milestone.name).toBe('C')
  })

  it('composes both filters (hidden AND completed)', () => {
    const milestones = [
      m('A', 50),
      m('Hidden', 30, { showOnChart: false }),
      m('Done', 0),
      m('B', 20),
    ]
    const info = computeMilestoneCompletionInfo(milestones)
    const visible = computeVisibleForecastMilestones(milestones, info)
    expect(visible).toHaveLength(2)
    expect(visible.map((v) => v.originalIndex)).toEqual([0, 3])
  })

  it('returns empty array when all milestones are completed', () => {
    const milestones = [m('A', 0), m('B', 0), m('C', 0)]
    const info = computeMilestoneCompletionInfo(milestones)
    expect(computeVisibleForecastMilestones(milestones, info)).toEqual([])
  })

  it('preserves originalIndex so callers can reference back into the source array', () => {
    // The originalIndex carries the position in the source milestones[] array,
    // which is what selectedMilestoneIndex and cumulativeThresholds[] both key on.
    const milestones = [m('A', 0), m('B', 30), m('C', 0), m('D', 10)]
    const info = computeMilestoneCompletionInfo(milestones)
    const visible = computeVisibleForecastMilestones(milestones, info)
    expect(visible.map((v) => v.originalIndex)).toEqual([1, 3])
  })

  it('defaults missing completionInfo to all-visible (no completion filter applied)', () => {
    // Callers that haven't computed completionInfo yet — or that pass undefined
    // legitimately — should see all showOnChart-eligible milestones.
    const milestones = [m('A', 50), m('B', 30)]
    const visible = computeVisibleForecastMilestones(milestones)
    expect(visible).toHaveLength(2)
  })
})
