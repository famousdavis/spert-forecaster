// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Deadline Probability primitives (v0.33.0).
//
// The DeadlineProbabilityPanel inverts the existing forecast question. Where the
// hero callout and the Custom Percentile selector answer "given percentile X, what
// date does this scope land?", this module answers "given target date D, what
// percent of trials finish on or before D?"
//
// The implementation is intentionally light — no new simulation runs. Both
// functions are pure reads against the already-computed `sortedSprintsRequired`
// array (one of `QuadSimulationData`'s six per-distribution arrays) plus a date
// → sprint quantization step.

import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
} from '@/shared/lib/dates'
import { MAX_TRIAL_SPRINTS } from '../constants'
import { calculateCumulativePercentage } from './cdf'

/** Result of mapping a user-entered target date to a forecast-sprint quantization.
 *
 *  `sprintCount` is the *forecast-relative* sprint index (1-based) of the last
 *  complete forecast sprint whose finish date is ≤ targetDate. Zero means no
 *  forecast sprint has completed by then (target is before the first forecast
 *  sprint's finish date). Callers that want to display the absolute sprint
 *  number to the user must add `completedSprintCount`.
 *
 *  `sprintFinishDate` is the finish date of `sprintCount` (or of sprint 0 — i.e.
 *  the business day before the first forecast sprint — when sprintCount is 0;
 *  see `isExactMatch` note below).
 *
 *  `isExactMatch` is true when `sprintFinishDate === targetDate` exactly. The
 *  panel uses this to choose between case-1 ("…by **June 19**") and case-2
 *  ("…by **June 19**, which is before your **June 20** target") wording. */
export interface SprintAtDate {
  sprintCount: number
  sprintFinishDate: string
  isExactMatch: boolean
}

/** Result of evaluating the deadline probability for one distribution.
 *
 *  `value` is the display-ready probability in the integer range [0, 99]. The
 *  cap at 99 is product policy: no forward-looking forecast claims complete
 *  certainty. The cap is applied AFTER `Math.round` so that 99.4 displays as
 *  "99% (not capped)" but 99.5 — which rounds to 100 — displays as "99%
 *  (capped)".
 *
 *  `wasCapped` is true when the raw rounded value was ≥ 100, i.e. when the cap
 *  actually changed the displayed number. Drives the per-panel cap footnote
 *  rendering — we only mention the cap when it's load-bearing. */
export interface DeadlineProbabilityResult {
  value: number
  wasCapped: boolean
}

/**
 * Find the largest forecast sprint N such that the finish date of sprint N is
 * on or before `targetDate`. Returns 0 if no forecast sprint finishes by the
 * target date.
 *
 * Binary search is used (rather than the floor-division formula one might
 * expect from a regular cadence) because `calculateSprintFinishDate` applies
 * a weekend-adjustment offset via `getPrecedingBusinessDay`. That offset
 * varies by up to two days depending on which day of the week the raw
 * cadence boundary lands on, so the sprint-finish-date sequence is not a
 * perfectly arithmetic progression. Binary search is exact and costs only
 * ⌈log₂(MAX_TRIAL_SPRINTS)⌉ ≈ 10 calls to the date helpers for any input.
 */
export function targetDateToSprintCount(
  targetDate: string,
  forecastStartDate: string,
  sprintCadenceWeeks: number,
): SprintAtDate {
  let lo = 0
  let hi = MAX_TRIAL_SPRINTS

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const finishDate = calculateSprintFinishDate(
      calculateSprintStartDate(forecastStartDate, mid, sprintCadenceWeeks),
      sprintCadenceWeeks,
    )
    if (finishDate <= targetDate) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  const sprintFinishDate = calculateSprintFinishDate(
    calculateSprintStartDate(forecastStartDate, lo, sprintCadenceWeeks),
    sprintCadenceWeeks,
  )

  return {
    sprintCount: lo,
    sprintFinishDate,
    isExactMatch: sprintFinishDate === targetDate,
  }
}

/**
 * Probability of completing within `sprintCount` sprints under the given
 * simulation distribution, returned as a display-ready integer percentage in
 * [0, 99].
 *
 * Two guards bracket the call to `calculateCumulativePercentage`:
 *  1. `sprintCount <= 0` — no forecast sprint has completed yet at the target
 *     date, so by definition zero trials have finished by then. Skips the
 *     CDF call.
 *  2. `sortedSprintsRequired.length === 0` — `calculateCumulativePercentage`
 *     computes `(low / sortedData.length) * 100` and returns `NaN` when the
 *     array is empty (0/0 × 100 = NaN). This happens in the milestone-scope
 *     race frame where the user selects a milestone whose simulation data
 *     hasn't been computed yet (or has just been cleared by a project switch).
 *     Returning 0 here keeps the UI numeric.
 */
export function calculateDeadlineProbability(
  sortedSprintsRequired: number[],
  sprintCount: number,
): DeadlineProbabilityResult {
  if (sprintCount <= 0 || sortedSprintsRequired.length === 0) {
    return { value: 0, wasCapped: false }
  }

  const raw = calculateCumulativePercentage(sortedSprintsRequired, sprintCount)
  const rounded = Math.round(raw)

  // Cap AFTER round so 99.4 → 99 (not capped) but 99.5 → 100 → 99 (capped).
  // The cap is the headline-probability ceiling; the underlying CDF can still
  // reach 100% mathematically, but no forward-looking assertion claims it.
  return { value: Math.min(99, rounded), wasCapped: rounded >= 100 }
}
