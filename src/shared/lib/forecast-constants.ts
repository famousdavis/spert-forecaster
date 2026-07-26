// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Forecast constants that the shared/ derivation functions depend on.
//
// These four were previously only in features/forecast/constants.ts. The pure
// derivations extracted from useForecastInputs and useSprintData reference
// them, and those derivations must be callable from outside React (by the
// staleness comparand and the snapshot builder), so they cannot live behind a
// features/ import.
//
// features/forecast/constants.ts re-exports all four, so the feature's
// existing import sites are unchanged. This module imports nothing, which is
// what keeps the settings-store → features/forecast/constants edge from
// closing into a cycle.
//
// MAX_TRIAL_SPRINTS deliberately stays in features/forecast/constants.ts: it
// is a simulation-engine limit with no shared/ consumer.

/** Minimum included sprints required for bootstrap simulation. */
export const MIN_SPRINTS_FOR_BOOTSTRAP = 5

/** Minimum included sprints for history-based forecasting (also enables bootstrap). */
export const MIN_SPRINTS_FOR_HISTORY = MIN_SPRINTS_FOR_BOOTSTRAP

/** Default coefficient of variation for subjective mode. */
export const DEFAULT_CV = 0.35

/** Default multiplier applied to calculated SD in history mode. */
export const DEFAULT_VOLATILITY_MULTIPLIER = 1.0
