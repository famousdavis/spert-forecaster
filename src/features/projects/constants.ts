// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Project-specific constants

export const SPRINT_CADENCE_OPTIONS = [1, 2, 3, 4] as const
export type SprintCadence = (typeof SPRINT_CADENCE_OPTIONS)[number]

export const DEFAULT_SPRINT_CADENCE: SprintCadence = 2
export const DEFAULT_UNIT_OF_MEASURE = 'story points'
