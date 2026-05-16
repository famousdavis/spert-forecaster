// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { computeCumulativeScope, computeShippedMilestoneInfo } from './milestones'
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

  it('handles zero-size (shipped) milestones', () => {
    // MVP has been shipped (user zeroed it). Beta and GA are still ahead.
    const milestones = [m('MVP', 0), m('Beta', 100), m('GA', 150)]
    expect(computeCumulativeScope(milestones)).toEqual([0, 100, 250])
  })
})

describe('computeShippedMilestoneInfo', () => {
  it('returns empty array for empty milestones', () => {
    expect(computeShippedMilestoneInfo([])).toEqual([])
  })

  it('marks milestones with backlogSize === 0 as shipped', () => {
    const milestones = [m('MVP', 0), m('Beta', 100), m('GA', 150), m('v2', 210)]
    expect(computeShippedMilestoneInfo(milestones)).toEqual([
      { shipped: true },
      { shipped: false },
      { shipped: false },
      { shipped: false },
    ])
  })

  it('marks all milestones unshipped when every backlogSize is positive', () => {
    const milestones = [m('A', 10), m('B', 20), m('C', 30)]
    expect(computeShippedMilestoneInfo(milestones)).toEqual([
      { shipped: false },
      { shipped: false },
      { shipped: false },
    ])
  })

  it('marks all milestones shipped when every backlogSize is zero', () => {
    const milestones = [m('A', 0), m('B', 0)]
    expect(computeShippedMilestoneInfo(milestones)).toEqual([
      { shipped: true },
      { shipped: true },
    ])
  })

  it('does not depend on sprint history or order — pure function of backlogSize', () => {
    // A milestone in the middle of the list can be shipped while others around it
    // are not (e.g., a "kickoff" marker the user maintains at 0).
    const milestones = [m('A', 50), m('Kickoff', 0), m('B', 100)]
    expect(computeShippedMilestoneInfo(milestones)).toEqual([
      { shipped: false },
      { shipped: true },
      { shipped: false },
    ])
  })

  it('aligns the output array with the input milestones by index', () => {
    const milestones = [m('A', 10), m('B', 20)]
    const info = computeShippedMilestoneInfo(milestones)
    expect(info).toHaveLength(2)
    expect(info[0]).toEqual({ shipped: false })
    expect(info[1]).toEqual({ shipped: false })
  })
})
