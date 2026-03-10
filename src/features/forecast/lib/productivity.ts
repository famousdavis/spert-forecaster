// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
  calculateSprintProductivityFactor,
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
    const factor = calculateSprintProductivityFactor(sprintStart, sprintEnd, relevantAdjustments)

    factors.push(factor)
  }

  return { factors }
}

/**
 * Check if any productivity adjustments have a non-1.0 factor.
 * Useful to determine if productivity adjustments will have any effect.
 */
export function hasActiveAdjustments(factors: number[]): boolean {
  return factors.some((f) => f !== 1.0)
}
