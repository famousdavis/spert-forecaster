// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The engine property v0.45.0's "Entire Project" scope rests on.
//
// When milestones add up to less than the remaining backlog, useForecastState
// appends the backlog itself to the milestone thresholds of the SAME run,
// instead of running the simulation twice. That is only sound if a threshold
// equal to the backlog is dated exactly where a run without milestones would
// date completion. It is: runTrialWithMilestones runs every trial to the full
// backlog, and its crossing test for a threshold T is `remaining <= B - T`,
// which for T = B is the loop's own exit condition, in the same iteration.
//
// Pinned two ways: with a deterministic sampler (exact sprint numbers), and
// with real samplers on a seeded stream, where the appended scope must be
// BYTE-IDENTICAL to runQuadrupleForecast — same trials, same order, every
// distribution, with productivity factors and scope growth both ways.

import { describe, it, expect, vi, afterEach } from 'vitest'

// A passthrough: the real samplers, unless a test sets a constant velocity.
const sampler = vi.hoisted(() => ({ constant: null as number | null }))
vi.mock('@/shared/lib/math', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/math')>()
  const pass = <A extends unknown[]>(real: (...a: A) => number) =>
    (...a: A) => (sampler.constant ?? real(...a))
  return {
    ...actual,
    randomTruncatedNormal: pass(actual.randomTruncatedNormal),
    randomLognormalFromMeanStdDev: pass(actual.randomLognormalFromMeanStdDev),
    randomGammaFromMeanStdDev: pass(actual.randomGammaFromMeanStdDev),
    randomTriangular: pass(actual.randomTriangular),
    randomUniform: pass(actual.randomUniform),
  }
})

import {
  runQuadrupleForecastWithMilestones,
  runQuadrupleForecast,
} from './monte-carlo'

const PARAMETRIC = ['truncatedNormal', 'lognormal', 'gamma', 'triangular', 'uniform'] as const
const ALL = [...PARAMETRIC, 'bootstrap'] as const

const cfg = (backlog: number, trialCount: number) => ({
  remainingBacklog: backlog, velocityMean: 10, velocityStdDev: 3,
  startDate: '2026-10-05', trialCount, sprintCadenceWeeks: 2,
})

afterEach(() => {
  sampler.constant = null
  vi.restoreAllMocks()
})

/** Every parametric sampler returns exactly `v`. */
function constantVelocity(v: number) {
  sampler.constant = v
}

/** The distinct sprint counts a milestone run recorded for each scope, across every distribution and trial. */
function crossings(backlog: number, thresholds: number[]): number[][] {
  const r = runQuadrupleForecastWithMilestones(cfg(backlog, 20), thresholds)
  return thresholds.map((_, m) => [...new Set(PARAMETRIC.flatMap((d) => r[d].milestoneResults[m].sprintsRequired))])
}

function completion(backlog: number): number[] {
  const r = runQuadrupleForecast(cfg(backlog, 20))
  return [...new Set(PARAMETRIC.flatMap((d) => r[d].sprintsRequired))]
}

describe('a threshold at the backlog dates project completion (deterministic, v = 10, B = 70)', () => {
  it('milestones [10, 40, 60] cross at 1, 4, 6; the project completes at 7', () => {
    constantVelocity(10)
    expect(crossings(70, [10, 40, 60])).toEqual([[1], [4], [6]])
    expect(completion(70)).toEqual([7])
  })

  it('appending the backlog adds exactly the completion sprint', () => {
    constantVelocity(10)
    expect(crossings(70, [10, 40, 60, 70])).toEqual([[1], [4], [6], [7]])
  })

  it('milestones past the backlog are dated at completion — [60, 110, 130] gives 6, 7, 7', () => {
    constantVelocity(10)
    expect(crossings(70, [60, 110, 130])).toEqual([[6], [7], [7]])
  })
})

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seeded(seed: number) {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed))
}

const HISTORY = [7, 12, 9, 14, 8, 11]

describe('the appended scope IS the project run (seeded, real samplers)', () => {
  const CASES: Array<{ name: string; factors?: number[]; growth?: number }> = [
    { name: 'plain' },
    { name: 'with productivity factors', factors: [1, 0.5, 0, 0.8, ...Array(60).fill(1)] },
    { name: 'with scope growth', growth: 2 },
    { name: 'with shrinking scope and factors', growth: -1, factors: [0.7, 1, 0.3, ...Array(60).fill(1)] },
  ]

  it.each(CASES)('$name — byte-identical for every distribution, bootstrap included', ({ factors, growth }) => {
    seeded(1234)
    const withMilestones = runQuadrupleForecastWithMilestones(cfg(70, 500), [10, 40, 60, 70], HISTORY, factors, growth)
    vi.restoreAllMocks()
    seeded(1234)
    const project = runQuadrupleForecast(cfg(70, 500), HISTORY, factors, growth)
    for (const d of ALL) {
      expect(withMilestones[d]!.milestoneResults[3].sprintsRequired, d).toEqual(project[d]!.sprintsRequired)
    }
  })

  it('CONTROL: a threshold half a point short of the backlog is NOT the project run', () => {
    // Without this, a comparison that could never fail would pass the cases above.
    seeded(99)
    const short = runQuadrupleForecastWithMilestones(cfg(70, 500), [10, 40, 60, 69.5], HISTORY)
    vi.restoreAllMocks()
    seeded(99)
    const project = runQuadrupleForecast(cfg(70, 500), HISTORY)
    const differing = ALL.filter((d) =>
      JSON.stringify(short[d]!.milestoneResults[3].sprintsRequired) !== JSON.stringify(project[d]!.sprintsRequired))
    expect(differing.length).toBeGreaterThan(0)
  })
})
