// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Re-export burn-up types from shared location to avoid circular dependencies
export {
  type DistributionType,
  type ForecastLineConfig,
  type BurnUpConfig,
  DEFAULT_BURN_UP_CONFIG,
  DISTRIBUTION_LABELS,
  type ChartFontSize,
  type ChartFontSizes,
  CHART_FONT_SIZES,
  CHART_FONT_SIZE_LABELS,
  DEFAULT_CHART_FONT_SIZE,
} from '@/shared/types/burn-up'

import type { DistributionType } from '@/shared/types/burn-up'
import type { ForecastMode } from '@/shared/types'

/**
 * Returns the list of distributions to display for a given forecast mode.
 *
 * Both modes share: T-Normal, Lognormal, Gamma, Triangular (4 common)
 * Subjective adds: Uniform (5 total — no Bootstrap without history)
 * History adds:    Bootstrap if 5+ sprints (4-5 total — no Uniform)
 */
export function getVisibleDistributions(
  forecastMode: ForecastMode,
  hasBootstrap: boolean,
  enabledDistributions?: readonly DistributionType[]
): DistributionType[] {
  // Compute the mode/bootstrap-appropriate set first, THEN intersect with enabledDistributions
  // if provided. Order matters: filtering enabledDistributions by mode rules first would change
  // the result when, e.g., a user has ['bootstrap', 'lognormal'] enabled in subjective mode.
  //
  // Order note: Lognormal is intentionally first since v0.33.1. It is the v0.32.0 default
  // distribution, and the Forecast Results table's first column is used as the reference
  // against which other distributions' percentile dates are highlighted in blue (when they
  // differ). With Lognormal first, "blue means differs from the default" is restored —
  // prior to v0.33.1 the reference column was T-Normal, which no longer matched the app
  // default. The Settings checkbox grid (via DISTRIBUTION_TYPES) sits in the same order
  // for consistency.
  let dists: DistributionType[]
  if (forecastMode === 'subjective') {
    dists = ['lognormal', 'truncatedNormal', 'gamma', 'triangular', 'uniform']
  } else {
    dists = ['lognormal', 'truncatedNormal', 'gamma', 'triangular']
    if (hasBootstrap) dists.push('bootstrap')
  }
  if (enabledDistributions) {
    return dists.filter((d) => enabledDistributions.includes(d))
  }
  return dists
}
