// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Moved here from features/forecast/lib/scope.ts in v0.36.0: the summary
// scope selection is lifted view state now, so the forecast-results store
// needs this type and shared/ must not import features/.
// features/forecast/lib/scope.ts re-exports both names.

/** Sentinel for "Entire Project" in scope dropdowns (ForecastSummary, DeadlineProbabilityPanel).
 *  Milestone ids are unique non-empty strings, so this literal cannot collide. */
export const PROJECT_SCOPE = '__project__' as const

/** Either the "Entire Project" sentinel or a milestone id. */
export type ScopeSelection = typeof PROJECT_SCOPE | string
