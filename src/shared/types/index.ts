// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Core domain types for SPERT

export interface ProductivityAdjustment {
  id: string
  name: string // e.g., "Holiday Season", "Team Vacation"
  startDate: string // ISO date string (YYYY-MM-DD)
  endDate: string // ISO date string (YYYY-MM-DD)
  factor: number // 0.0 to 1.0 (0 = no productivity, 1 = normal)
  enabled: boolean // Whether this adjustment is active for forecasting
  reason?: string // Optional description
  createdAt: string
  updatedAt: string
}

export interface Milestone {
  id: string
  name: string // e.g., "MVP", "Beta Release", "GA"
  backlogSize: number // Incremental work for this milestone (in project's unit of measure)
  color: string // Hex color for chart visualization
  showOnChart?: boolean // Whether to show reference line on burn-up chart (default true)
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  sprintCadenceWeeks?: 1 | 2 | 3 | 4 // Optional until configured on Sprint History tab
  projectStartDate?: string // ISO date string (YYYY-MM-DD)
  projectFinishDate?: string // ISO date string (YYYY-MM-DD)
  firstSprintStartDate?: string // ISO date string (YYYY-MM-DD) - when the team started their first sprint
  unitOfMeasure: string
  productivityAdjustments?: ProductivityAdjustment[] // Periods of reduced productivity for forecasting
  milestones?: Milestone[] // Ordered release milestones (first ships first)
  createdAt: string
  /**
   * ISO 8601. OPTIONAL since v0.40.4: `firestoreDocToProject` normalizes every
   * stored shape, and returns nothing when the value carries no recoverable
   * instant (an unresolved serverTimestamp sentinel, an absent field, or a
   * string `Date.parse` rejects). ⚠️ Never `null` — `sanitizeForFirestore`
   * strips `undefined` only, so a null would reach the document.
   */
  updatedAt?: string
}

export interface Sprint {
  id: string
  projectId: string
  sprintNumber: number // Sequential sprint number (1, 2, 3, ...)
  sprintStartDate: string // ISO date string (YYYY-MM-DD) - calculated from firstSprintStartDate + cadence
  sprintFinishDate: string // ISO date string (YYYY-MM-DD) - calculated, always a business day (Mon-Fri)
  customFinishDate?: string // ISO date string (YYYY-MM-DD) - user override for non-standard sprint durations
  doneValue: number
  backlogAtSprintEnd?: number // Optional: total backlog remaining at sprint end (for burn-up chart)
  includedInForecast: boolean
  createdAt: string
  updatedAt: string
}

export interface VelocityStats {
  count: number
  mean: number
  standardDeviation: number
}

export interface ForecastConfig {
  remainingBacklog: number
  velocityMean: number
  velocityStdDev: number
  startDate: string // ISO date string
  trialCount: number
}

export interface ForecastResult {
  percentile: number
  finishDate: string // ISO date string
  sprintsRequired: number
}

export interface PercentileResult {
  p50: ForecastResult
  p60: ForecastResult
  p70: ForecastResult
  p80: ForecastResult
  p90: ForecastResult
  custom?: ForecastResult
}

export type ForecastMode = 'history' | 'subjective'

/**
 * Session-only forecast inputs, held per project in the project store and
 * never persisted to localStorage.
 *
 * Declared here rather than in project-store.ts since v0.36.0:
 * deriveForecastInputs in shared/lib takes this shape as a parameter, and a
 * shared/lib -> shared/state import (even a type-only one) is a direction this
 * codebase does not otherwise take.
 */
export interface ForecastInputs {
  remainingBacklog: string
  velocityMean: string
  velocityStdDev: string
  forecastMode?: ForecastMode // undefined = auto-detect based on sprint count
  velocityEstimate?: string   // Subjective mode: user's velocity guess
  selectedCV?: number         // Subjective mode: selected coefficient of variation
  volatilityMultiplier?: number // History mode: SD multiplier (1.0 = match history)
}
