// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  computeCumulativeScope,
  computeMilestoneCompletionInfo,
  computeVisibleForecastMilestones,
  buildMilestonePickerOptions,
  pickerFallback,
  planMilestoneRun,
  runMilestoneTotal,
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

describe('buildMilestonePickerOptions', () => {
  it('offers charted, not-completed milestones by their index into the scopes', () => {
    const ms = [m('MVP', 0), m('Beta', 30), m('GA', 50, { showOnChart: false }), m('v2', 20)]
    const opts = buildMilestonePickerOptions(ms, computeMilestoneCompletionInfo(ms))
    expect(opts.map((o) => o.value)).toEqual([1, 3])
  })

  it('puts "(Total)" on the last option only, and only when there are several', () => {
    const two = [m('Beta', 30), m('GA', 50)]
    expect(buildMilestonePickerOptions(two, computeMilestoneCompletionInfo(two)).map((o) => o.label))
      .toEqual(['Beta', 'GA (Total)'])
    const one = [m('Beta', 30)]
    expect(buildMilestonePickerOptions(one, computeMilestoneCompletionInfo(one)).map((o) => o.label))
      .toEqual(['Beta'])
  })

  it('offers nothing when every milestone is complete', () => {
    const ms = [m('MVP', 0), m('Beta', 0)]
    expect(buildMilestonePickerOptions(ms, computeMilestoneCompletionInfo(ms))).toEqual([])
  })
})

describe('pickerFallback', () => {
  it('is the LAST option, never the first', () => {
    expect(pickerFallback([{ value: 0, label: 'MVP' }, { value: 1, label: 'Beta (Total)' }])).toBe(1)
  })

  it('is null when nothing is offered', () => {
    expect(pickerFallback([])).toBeNull()
  })
})

describe('buildMilestonePickerOptions with an Entire Project scope', () => {
  it('offers it last as "Entire Project (Total)", and no milestone is the total', () => {
    const ms = [m('MVP', 10), m('Beta', 30)]
    const opts = buildMilestonePickerOptions(ms, computeMilestoneCompletionInfo(ms), 2)
    expect(opts).toEqual([
      { value: 0, label: 'MVP' },
      { value: 1, label: 'Beta' },
      { value: 2, label: 'Entire Project (Total)' },
    ])
    expect(pickerFallback(opts)).toBe(2)
  })

  it('still offers it when every milestone is complete', () => {
    const ms = [m('MVP', 0), m('Beta', 0)]
    expect(buildMilestonePickerOptions(ms, computeMilestoneCompletionInfo(ms), 2))
      .toEqual([{ value: 2, label: 'Entire Project (Total)' }])
  })
})

describe('planMilestoneRun', () => {
  it('milestones short of the backlog: appends the backlog and a trailing project scope', () => {
    const plan = planMilestoneRun([40, 60], ['Alpha', 'Beta'], 100, 'Demo')
    expect(plan.runThresholds).toEqual([40, 60, 100])
    expect(plan.scopes.map((s) => [s.kind, s.milestoneIndex, s.label, s.cumulativeThreshold])).toEqual([
      ['milestone', 0, 'Alpha', 40],
      ['milestone', 1, 'Beta', 60],
      ['project', null, 'Demo', 100],
    ])
  })

  it('milestones covering the backlog, within rounding: D20 — N scopes, the last cumulative-final', () => {
    for (const [t, b] of [[[40, 100], 100], [[0.12, 0.24], 0.25], [[0.13, 0.26], 0.25]] as const) {
      const plan = planMilestoneRun([...t], ['A', 'B'], b, 'Demo')
      expect(plan.runThresholds, `${t} vs ${b}`).toEqual([...t])
      expect(plan.scopes.map((s) => s.kind)).toEqual(['milestone', 'cumulative-final'])
    }
  })

  it('milestones past the backlog: D20, with the ones past it flagged', () => {
    const plan = planMilestoneRun([60, 110, 130], ['A', 'B', 'C'], 70, 'Demo')
    expect(plan.runThresholds).toEqual([60, 110, 130])
    expect(plan.scopes.map((s) => s.thresholdUnreachable)).toEqual([false, true, true])
    expect(plan.scopes.at(-1)!.kind).toBe('cumulative-final')
  })

  it('names a milestone it has no name for', () => {
    expect(planMilestoneRun([10], [], 10, 'Demo').scopes[0].label).toBe('Milestone 1')
  })
})

describe('runMilestoneTotal', () => {
  it('reads the milestone scopes, not a trailing project scope', () => {
    const { scopes } = planMilestoneRun([40, 60], ['A', 'B'], 100, 'Demo')
    expect(runMilestoneTotal(scopes)).toEqual({ total: 60, count: 2 })
  })

  it('is null for a run without milestones', () => {
    expect(runMilestoneTotal([
      { kind: 'project', milestoneIndex: null, label: 'Demo', cumulativeThreshold: 100, thresholdUnreachable: false },
    ])).toBeNull()
  })
})
