// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Module-level Monte Carlo generation counter (G1 fix).
//
// Bumped in performSignOutCleanup() only. handleRunForecast captures the
// counter before each await and discards the result if the counter has
// advanced — preventing simulation results that resolve after sign-out from
// being published into a cleared store.
//
// Moved here from features/forecast/lib/ in v0.36.0: the run record now lives
// in shared/state/forecast-results-store, so the discard check runs on the
// publish path in shared/ rather than inside the feature.
//
// NOT bumped on cloud→local mode switches. The switch handlers call
// clearForecastResults() directly, which drops the record and the per-project
// view state, so a simulation resolving after the switch has nothing stale to
// write into.
//
// HISTORICAL NOTE (v0.36.0): this comment previously said results live in
// component-local useState inside useForecastState, and used that as the
// reason a mode switch was safe. That premise no longer holds — results are
// store state now. Do not restore the old wording.

let _generation = 0

export function currentSimulationGeneration(): number {
  return _generation
}

export function bumpSimulationGeneration(): void {
  _generation++
}
