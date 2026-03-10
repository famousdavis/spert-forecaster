// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Forecast-specific constants

export const DEFAULT_TRIAL_COUNT = 10000

export const DEFAULT_PERCENTILES = [50, 60, 70, 80, 90] as const
export const MIN_PERCENTILE = 1
export const MAX_PERCENTILE = 99

/** All selectable percentile values for the results table toggle chips */
export const SELECTABLE_PERCENTILES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95] as const

/** Default selected percentiles for new sessions */
export const DEFAULT_SELECTED_PERCENTILES: readonly number[] = [10, 20, 50, 80, 90] as const

// Minimum number of included sprints required for bootstrap simulation
export const MIN_SPRINTS_FOR_BOOTSTRAP = 5

// Safety limit for maximum sprints in a single trial
// Prevents infinite loops when velocity is near zero
export const MAX_TRIAL_SPRINTS = 1000

// Milestone limits
export const MAX_MILESTONES = 10
export const MILESTONE_SOFT_LIMIT = 5

// Default colors for milestones (cycled through on creation)
export const DEFAULT_MILESTONE_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ef4444', // red
] as const

// ============================================================================
// Subjective forecasting (cold-start mode)
// ============================================================================

/** Minimum included sprints for history-based forecasting (also enables bootstrap) */
export const MIN_SPRINTS_FOR_HISTORY = MIN_SPRINTS_FOR_BOOTSTRAP

/** CV elicitation options for subjective mode */
export interface CVOption {
  label: string
  cv: number
}

export const CV_OPTIONS: CVOption[] = [
  { label: 'Very steady', cv: 0.15 },
  { label: 'Fairly consistent', cv: 0.25 },
  { label: 'Somewhat variable', cv: 0.35 },
  { label: 'Somewhat volatile', cv: 0.45 },
  { label: 'Quite volatile', cv: 0.55 },
  { label: 'Wildly uncertain', cv: 0.65 },
]

export const DEFAULT_CV = 0.35

// ============================================================================
// History mode volatility adjustment
// ============================================================================

/** Multiplier options for adjusting calculated SD in history mode */
export interface VolatilityOption {
  label: string
  multiplier: number
}

export const VOLATILITY_OPTIONS: VolatilityOption[] = [
  { label: 'Less volatile',          multiplier: 0.75 },
  { label: 'Match history',          multiplier: 1.0  },
  { label: 'Slightly more volatile', multiplier: 1.25 },
  { label: 'Much more volatile',     multiplier: 1.5  },
]

export const DEFAULT_VOLATILITY_MULTIPLIER = 1.0

/**
 * Get the rounding increment for cosmetic range display.
 * Goal: displayed numbers should look like rough, hand-wavy estimates.
 */
export function getRoundingIncrement(velocity: number): number {
  if (velocity < 50) return 2
  if (velocity < 100) return 5
  return 10
}

/**
 * Round a number to the nearest increment.
 */
export function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

/**
 * Compute the cosmetic display range for a velocity estimate and CV.
 * Returns rounded lower/upper bounds for display only.
 * The actual SD used in simulation is unrounded: velocity * cv.
 */
export function roundRange(velocity: number, cv: number): { displayLower: number; displayUpper: number } {
  const sd = velocity * cv
  const rawLower = Math.max(0, velocity - sd)
  const rawUpper = velocity + sd
  const increment = getRoundingIncrement(velocity)
  return {
    displayLower: Math.max(0, roundToNearest(rawLower, increment)),
    displayUpper: roundToNearest(rawUpper, increment),
  }
}
