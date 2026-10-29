// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
  countWorkingDays,
  getWorkingDaysInRange,
} from '@/shared/lib/dates'
import type { ProductivityAdjustment } from '@/shared/types'
import { MAX_TRIAL_SPRINTS } from '../constants'

export interface SprintProductivityFactors {
  factors: number[] // Indexed by relative sprint (0 = first forecast sprint)
}

/**
 * Pre-calculate productivity factors for upcoming sprints.
 *
 * This function computes the productivity factor for each future sprint
 * based on the defined adjustment periods. The factors are returned as
 * an array indexed by relative sprint number (0 = first forecast sprint).
 *
 * @param firstSprintStartDate - Project's first sprint start date (ISO)
 * @param sprintCadenceWeeks - Sprint length in weeks (1-4)
 * @param startingSprintNumber - First sprint to calculate (typically completedSprintCount + 1)
 * @param adjustments - Productivity adjustments to apply
 * @param maxSprintsToCalculate - Maximum number of future sprints to pre-calculate (default 200)
 * @returns Object containing array of productivity factors
 */
export function preCalculateSprintFactors(
  firstSprintStartDate: string,
  sprintCadenceWeeks: number,
  startingSprintNumber: number,
  adjustments: ProductivityAdjustment[],
  maxSprintsToCalculate: number = MAX_TRIAL_SPRINTS
): SprintProductivityFactors {
  const factors: number[] = []

  // If no adjustments, return array of 1.0s for efficiency
  if (!adjustments || adjustments.length === 0) {
    return { factors: new Array(maxSprintsToCalculate).fill(1.0) }
  }

  // Calculate the first forecast sprint's start date
  const firstForecastStart = calculateSprintStartDate(
    firstSprintStartDate,
    startingSprintNumber,
    sprintCadenceWeeks
  )

  // Filter to only include adjustments that could affect the forecast period
  // (adjustments whose end date is >= first forecast sprint start)
  const relevantAdjustments = adjustments.filter((adj) => adj.endDate >= firstForecastStart)

  // If no relevant adjustments, return array of 1.0s
  if (relevantAdjustments.length === 0) {
    return { factors: new Array(maxSprintsToCalculate).fill(1.0) }
  }

  // Find the last adjustment end date to know when we can stop calculating
  const lastAdjustmentEnd = relevantAdjustments.reduce(
    (latest, adj) => (adj.endDate > latest ? adj.endDate : latest),
    relevantAdjustments[0].endDate
  )
  const ranked = rankAdjustments(relevantAdjustments)

  // Calculate factor for each sprint, but stop early once past all adjustments
  for (let i = 0; i < maxSprintsToCalculate; i++) {
    const sprintNumber = startingSprintNumber + i
    const sprintStart = calculateSprintStartDate(
      firstSprintStartDate,
      sprintNumber,
      sprintCadenceWeeks
    )

    // If this sprint starts after all adjustments end, fill the rest with 1.0
    if (sprintStart > lastAdjustmentEnd) {
      // Fill remaining sprints with 1.0
      while (factors.length < maxSprintsToCalculate) {
        factors.push(1.0)
      }
      break
    }

    const sprintEnd = calculateSprintFinishDate(sprintStart, sprintCadenceWeeks)
    const factor = rankedSprintFactor(sprintStart, sprintEnd, ranked)

    factors.push(factor)
  }

  return { factors }
}

// ── The sprint factor, with work bounded by the sprint, not by the adjustments ──
//
// ⚠️ Equal to `calculateSprintProductivityFactor` (dates.ts) for every input:
// productivity.factors.test.ts compares the two over random and malformed
// adjustment lists. That function asks, for every working day, which of the
// sprint's overlapping adjustments cover it, and takes their minimum. With many
// adjustments that is days × adjustments per sprint. A 1 MiB project can carry
// thousands, and the forecast walks up to MAX_TRIAL_SPRINTS sprints, on the main
// thread: 5,000 adjustments at a 52-week cadence ran past 15 s (W4).
//
// Here the adjustments are ranked once, in the order `Math.min` would decide
// between their factors. A day's factor is then the FIRST covering adjustment
// in that order, and the scan stops there. An adjustment passed over without
// covering the day must start or end inside this sprint (one that spans the
// sprint covers every day of it), and each adjustment has only two ends, so a
// forecast's scans stay within a few times (sprints × days + adjustments).

interface RankedAdjustment {
  startDate: unknown
  endDate: unknown
  /** The factor as `Math.min` reads it: ToNumber, so NaN for anything unreadable. */
  rank: number
}

/**
 * NaN first (`Math.min` returns NaN when any argument is NaN), then ascending.
 * A stable sort, so equal factors keep their order; +0 and -0 give the same
 * day total either way, because the total starts at +0.
 */
function rankAdjustments(adjustments: ProductivityAdjustment[]): RankedAdjustment[] {
  return adjustments
    .map((adj) => ({ startDate: adj.startDate, endDate: adj.endDate, rank: Number(adj.factor) }))
    .sort((a, b) => {
      if (Number.isNaN(a.rank) || Number.isNaN(b.rank)) return Number(!Number.isNaN(a.rank)) - Number(!Number.isNaN(b.rank))
      if (a.rank < b.rank) return -1
      return a.rank > b.rank ? 1 : 0
    })
}

/** `calculateSprintProductivityFactor`, given adjustments already ranked. */
function rankedSprintFactor(sprintStart: string, sprintEnd: string, ranked: RankedAdjustment[]): number {
  if (countWorkingDays(sprintStart, sprintEnd) === 0) return 1.0

  // The comparisons are the original's, operand for operand, so a malformed
  // date compares exactly as it did there.
  const overlapping = ranked.filter(
    (adj) => (adj.endDate as string) >= sprintStart && (adj.startDate as string) <= sprintEnd
  )
  if (overlapping.length === 0) return 1.0

  const workingDays = getWorkingDaysInRange(sprintStart, sprintEnd)
  let totalFactor = 0
  for (const day of workingDays) {
    const first = overlapping.find((adj) => day >= (adj.startDate as string) && day <= (adj.endDate as string))
    totalFactor += first ? first.rank : 1.0
  }
  return totalFactor / workingDays.length
}

/**
 * Check if any productivity adjustments have a non-1.0 factor.
 * Useful to determine if productivity adjustments will have any effect.
 */
export function hasActiveAdjustments(factors: number[]): boolean {
  return factors.some((f) => f !== 1.0)
}
