// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Module-level Monte Carlo generation counter (G1 fix).
//
// Bumped in performSignOutCleanup() only. handleRunForecast captures the
// counter before each await and discards the result if the counter has
// advanced — preventing simulation results that resolve after sign-out
// from being written into a cleared store.
//
// NOT bumped on cloud→local mode switches: simulation results live in
// component-local useState (useForecastState), not the Zustand store, and a
// mode-switch leaves project data intact, so a simulation completing after
// the switch is safe to display.

let _generation = 0

export function currentSimulationGeneration(): number {
  return _generation
}

export function bumpSimulationGeneration(): void {
  _generation++
}
