// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { computeCumulativeScope, computeMilestoneCompletionInfo } from './milestones'
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
