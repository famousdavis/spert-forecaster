// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Monte Carlo result shapes.
//
// These live in shared/ rather than features/forecast/lib/monte-carlo.ts
// because the forecast-results store retains the worker's own QuadResults
// and QuadSimulationData for the life of a run record, and shared/ must not
// import features/. monte-carlo.ts re-exports every name below, so the
// feature's existing import sites are unaffected.

import type { ForecastResult } from './index'

/**
 * The five standard percentile outcomes the worker computes for one
 * distribution over one scope.
 */
export interface PercentileResults {
  p50: ForecastResult
  p60: ForecastResult
  p70: ForecastResult
  p80: ForecastResult
  p90: ForecastResult
}

/**
 * Percentile results for all distributions (used by results table, summary,
 * CSV export, and the ForecastSummary hero sentence).
 */
export interface QuadResults {
  truncatedNormal: PercentileResults
  lognormal: PercentileResults
  gamma: PercentileResults
  bootstrap: PercentileResults | null
  triangular: PercentileResults
  uniform: PercentileResults
}

/**
 * Raw sorted sprint counts from each distribution — one array per
 * distribution, six per scope. Never serialized (D17).
 */
export interface QuadSimulationData {
  truncatedNormal: number[]
  lognormal: number[]
  gamma: number[]
  bootstrap: number[] | null
  triangular: number[]
  uniform: number[]
}

/**
 * Custom percentile results for all distributions
 */
export interface QuadCustomResults {
  truncatedNormal: ForecastResult | null
  lognormal: ForecastResult | null
  gamma: ForecastResult | null
  bootstrap: ForecastResult | null
  triangular: ForecastResult | null
  uniform: ForecastResult | null
}
