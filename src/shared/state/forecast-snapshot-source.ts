// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

// The getState() bridge between the stores and the pure snapshot builder.
//
// TRAP 1 — THE STALENESS GATE MUST NOT SUBSCRIBE TO REACTIVE VALUES. The
// auto-recalculate effect's dependency array carries *debounced* inputs,
// while the derived values isRecordStale needs come from undebounced sources.
// Reading them directly in the effect body either trips
// react-hooks/exhaustive-deps or, if the array is widened to satisfy it,
// fires a simulation on every keystroke. Building from getState() closes over
// nothing reactive, so neither happens.
//
// This module exists so shared/lib/forecast-staleness.ts stays pure and
// store-free, and so project-store can import forecast-results-store for the
// purge without a cycle.

import type { Project } from '@/shared/types'
import { useProjectStore } from './project-store'
import { useSettingsStore } from './settings-store'
import { useForecastResultsStore, VIEW_STATE_LITERAL_SEEDS } from './forecast-results-store'
import {
  buildForecastInputSnapshot,
  type ForecastInputSnapshot,
  type ForecastSnapshotSource,
} from '@/shared/lib/forecast-staleness'

/** Assemble the builder's input from live store state. */
export function readForecastSnapshotSource(
  project: Project | undefined
): ForecastSnapshotSource {
  const projectState = useProjectStore.getState()
  const view = project ? useForecastResultsStore.getState().viewState[project.id] : undefined

  return {
    project,
    allSprints: projectState.sprints,
    storedInputs: project ? projectState.forecastInputs[project.id] : undefined,
    trialCount: useSettingsStore.getState().trialCount,
    scopeGrowth: {
      // A project whose view state has not been created yet reads as the
      // literal seeds — the same values a freshly-created entry would hold,
      // so the comparand does not depend on whether the tab has mounted.
      modelScopeGrowth: view?.modelScopeGrowth ?? VIEW_STATE_LITERAL_SEEDS.modelScopeGrowth,
      scopeGrowthMode: view?.scopeGrowthMode ?? VIEW_STATE_LITERAL_SEEDS.scopeGrowthMode,
      customScopeGrowth: view?.customScopeGrowth ?? VIEW_STATE_LITERAL_SEEDS.customScopeGrowth,
    },
  }
}

/**
 * Build the snapshot for a project from live store state.
 *
 * This is the call both sides make: handleRunForecast for the record's
 * runConfig (once, at run start) and the staleness check for the comparand.
 * See forecast-staleness.ts's header for why that matters.
 */
export function readForecastInputSnapshot(
  project: Project | undefined
): ForecastInputSnapshot {
  return buildForecastInputSnapshot(readForecastSnapshotSource(project))
}
