// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  targetDateToSprintCount,
  calculateDeadlineProbability,
} from './deadline'
import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
} from '@/shared/lib/dates'
import { MAX_TRIAL_SPRINTS } from '../constants'

// A real-app forecast start (a Monday). All sprint math in this suite uses
// a 2-week cadence, which is what the seeded sample project uses.
const FORECAST_START = '2026-05-18'
const CADENCE = 2

/** Helper: forecast-sprint N's finish date for the constants above. */
function finishOf(n: number): string {
  return calculateSprintFinishDate(
    calculateSprintStartDate(FORECAST_START, n, CADENCE),
    CADENCE,
  )
}

describe('targetDateToSprintCount', () => {
  it('returns sprintCount 0 for a target date well before the forecast start', () => {
    // Six months before forecast start — no forecast sprint can have completed.
    const out = targetDateToSprintCount('2025-11-15', FORECAST_START, CADENCE)
    expect(out.sprintCount).toBe(0)
  })

  it('returns sprintCount 0 for a target date equal to the forecast start (sprint 1 not yet ended)', () => {
    const out = targetDateToSprintCount(FORECAST_START, FORECAST_START, CADENCE)
    expect(out.sprintCount).toBe(0)
  })

  it('returns the sprint-0 finish date when target equals the business day before forecast start (exact match, sprintCount 0)', () => {
    // Sprint 0's finish date is the last business day before forecast sprint 1
    // starts — the binary search returns sprintCount: 0 because no forecast
    // sprint has completed by then, but isExactMatch is true because the
    // target lands exactly on sprint 0's finish.
    const sprintZeroFinish = finishOf(0)
    const out = targetDateToSprintCount(sprintZeroFinish, FORECAST_START, CADENCE)
    expect(out.sprintCount).toBe(0)
    expect(out.sprintFinishDate).toBe(sprintZeroFinish)
    expect(out.isExactMatch).toBe(true)
  })

  it('returns isExactMatch true when target equals the sprint-1 finish date', () => {
    const sprint1Finish = finishOf(1)
    const out = targetDateToSprintCount(sprint1Finish, FORECAST_START, CADENCE)
    expect(out.sprintCount).toBe(1)
    expect(out.sprintFinishDate).toBe(sprint1Finish)
    expect(out.isExactMatch).toBe(true)
  })

  it('returns isExactMatch true when target equals the sprint-4 finish date', () => {
    const sprint4Finish = finishOf(4)
    const out = targetDateToSprintCount(sprint4Finish, FORECAST_START, CADENCE)
    expect(out.sprintCount).toBe(4)
    expect(out.sprintFinishDate).toBe(sprint4Finish)
    expect(out.isExactMatch).toBe(true)
  })

  it('returns sprintCount N, isExactMatch false when target falls mid-sprint (after N, before N+1)', () => {
    const sprint2Finish = finishOf(2)
    const sprint3Finish = finishOf(3)
    // Pick a date strictly between sprint-2 finish and sprint-3 finish so the
    // binary search must report sprintCount: 2 (last sprint that finished by
    // the target).
    const midDate = '2026-06-20'
    expect(midDate > sprint2Finish).toBe(true)
    expect(midDate < sprint3Finish).toBe(true)

    const out = targetDateToSprintCount(midDate, FORECAST_START, CADENCE)
    expect(out.sprintCount).toBe(2)
    expect(out.sprintFinishDate).toBe(sprint2Finish)
    expect(out.isExactMatch).toBe(false)
  })

  it('handles a target date that falls on a weekend without throwing', () => {
    // Pick a date that we know is a Saturday or Sunday in the forecast window.
    // 2026-06-07 is a Sunday given a 2026-05-18 (Monday) forecast start +
    // three weeks. The function should still return a sensible sprintCount
    // and sprintFinishDate (a business day).
    const out = targetDateToSprintCount('2026-06-07', FORECAST_START, CADENCE)
    expect(out.sprintCount).toBeGreaterThanOrEqual(0)
    expect(out.sprintCount).toBeLessThanOrEqual(MAX_TRIAL_SPRINTS)
    // Returned finish date is always a business day (Mon–Fri):
    const dow = new Date(out.sprintFinishDate + 'T00:00:00').getDay()
    expect(dow).toBeGreaterThanOrEqual(1)
    expect(dow).toBeLessThanOrEqual(5)
  })

  it('clamps at MAX_TRIAL_SPRINTS for target dates far beyond the forecast horizon', () => {
    // At 1-week cadence from 2026-05-18, sprint 1000 lands at ~2045. A
    // target of 2050-12-31 is well past that, so the binary search must
    // clamp at MAX_TRIAL_SPRINTS rather than walk further. (2-week cadence
    // can't be used for this test — 1000 sprints × 2 weeks ≈ 38 years
    // pushes past isValidDateRange's 2050 ceiling.)
    const out = targetDateToSprintCount('2050-12-31', FORECAST_START, 1)
    expect(out.sprintCount).toBe(MAX_TRIAL_SPRINTS)
  })
})

describe('calculateDeadlineProbability', () => {
  // Use a simulated array where we can predict the CDF exactly.
  // sortedSprintsRequired = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  // calculateCumulativePercentage(sorted, N) → (count of entries ≤ N) / 10 × 100
  //   N=5 → 50, N=10 → 100, N=1 → 10, N=0 → 0

  it('returns value 0 and wasCapped false for sprintCount = 0', () => {
    const sorted = [1, 2, 3, 4, 5]
    const out = calculateDeadlineProbability(sorted, 0)
    expect(out.value).toBe(0)
    expect(out.wasCapped).toBe(false)
  })

  it('returns value 0 and wasCapped false for negative sprintCount', () => {
    const out = calculateDeadlineProbability([1, 2, 3], -1)
    expect(out.value).toBe(0)
    expect(out.wasCapped).toBe(false)
  })

  it('returns value 0 and wasCapped false for an empty sorted array (NaN guard)', () => {
    // calculateCumulativePercentage([], N) computes 0/0 * 100 = NaN. The guard
    // in calculateDeadlineProbability short-circuits before that division so
    // the panel doesn't render "NaN%".
    const out = calculateDeadlineProbability([], 5)
    expect(out.value).toBe(0)
    expect(out.wasCapped).toBe(false)
  })

  it('returns the rounded CDF value for a mid-range sprintCount', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const out = calculateDeadlineProbability(sorted, 5)
    expect(out.value).toBe(50)
    expect(out.wasCapped).toBe(false)
  })

  it('returns 10 for a sprintCount equal to the first array element', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const out = calculateDeadlineProbability(sorted, 1)
    expect(out.value).toBe(10)
    expect(out.wasCapped).toBe(false)
  })

  it('caps a raw 100 value at 99 with wasCapped true', () => {
    // sortedSprintsRequired all ≤ 10 → CDF at 10 is exactly 100.
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const out = calculateDeadlineProbability(sorted, 10)
    expect(out.value).toBe(99)
    expect(out.wasCapped).toBe(true)
  })

  it('caps a raw value that rounds to 100 at 99 with wasCapped true', () => {
    // Construct a sorted array of length 200 where 199 entries are ≤ N and
    // one entry is > N → raw = 199/200 × 100 = 99.5 → rounds to 100 → caps to 99.
    const sorted = Array.from({ length: 199 }, (_, i) => i + 1).concat([1000])
    const out = calculateDeadlineProbability(sorted, 199)
    expect(out.value).toBe(99)
    expect(out.wasCapped).toBe(true)
  })

  it('does NOT cap a raw value that rounds to 99 (just under the cap)', () => {
    // Construct a sorted array of length 1000 where 994 entries are ≤ N
    // → raw = 994/1000 × 100 = 99.4 → rounds to 99 → naturally below cap.
    const sorted = Array.from({ length: 994 }, (_, i) => i + 1).concat(
      Array.from({ length: 6 }, () => 1000),
    )
    const out = calculateDeadlineProbability(sorted, 994)
    expect(out.value).toBe(99)
    expect(out.wasCapped).toBe(false)
  })
})
