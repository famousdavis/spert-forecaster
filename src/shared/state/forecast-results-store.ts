// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

// Forecast results and view state, lifted out of useForecastState (v0.36.0).
//
// WHY THIS STORE EXISTS. All forecast results and view state used to live in
// useState inside useForecastState, and AppShell renders the Forecast tab
// conditionally — so leaving the tab destroyed every result and terminated
// the simulation worker. Nothing recorded which inputs produced the numbers
// on screen, so "are these results still current?" was not a decidable
// question.
//
// CREATED WITHOUT `persist`, DELIBERATELY. The record retains raw sorted
// trial arrays (six per scope, trialCount entries each) which must never be
// serialized, and results are session state by definition: they describe a
// run that happened in this browser, in this session.

import { create } from 'zustand'
import type { QuadResults, QuadSimulationData } from '@/shared/types/forecast-results'
import type { DistributionType } from '@/shared/types/burn-up'
import type { ScopeSelection } from '@/shared/types/scope'
import { PROJECT_SCOPE } from '@/shared/types/scope'
import type { RunConfig } from '@/shared/lib/forecast-staleness'

/**
 * One forecastable scope. With milestones present, `cumulative-final`
 * replaces the last `milestone` entry, so N milestones yield N scopes (D20).
 */
export interface ForecastScope {
  kind: 'project' | 'milestone' | 'cumulative-final'
  milestoneIndex: number | null
  label: string
  cumulativeThreshold: number
  thresholdUnreachable: boolean
}

export interface ForecastRunRecord {
  /** Resolved at RUN START, not at publish (trap 2). */
  projectId: string
  runAt: string
  runConfig: RunConfig
  /** Raw sorted arrays, one per scope. Retained for the record's life. Never serialized. */
  simData: QuadSimulationData[]
  /** The worker's own computed percentile objects, run-anchored, one per scope (D29). */
  quadResults: QuadResults[]
  scopes: ForecastScope[]
}

/**
 * Per-project view state. Outlives the record: it must still drive the
 * sliders on a project whose record is absent.
 */
export interface ForecastViewState {
  /** Indexes record.scopes, NOT milestones. Clamped on write. */
  selectedMilestoneIndex: number
  customPercentile: number
  customPercentile2: number
  selectedResultsPercentiles: number[]
  targetDate: string
  modelScopeGrowth: boolean
  scopeGrowthMode: 'calculated' | 'custom'
  customScopeGrowth: string
  summaryDistribution: DistributionType
  summaryPercentile: number
  summaryScope: ScopeSelection
}

/**
 * Seeds for the three cells that have no Settings default.
 *
 * These literals MUST match ForecastSummary's former useState initializers
 * exactly, or the byte-identity gate fails on first render.
 */
export const VIEW_STATE_LITERAL_SEEDS = {
  summaryDistribution: 'lognormal' as DistributionType,
  summaryPercentile: 80,
  summaryScope: PROJECT_SCOPE as ScopeSelection,
  selectedMilestoneIndex: 0,
  targetDate: '',
  modelScopeGrowth: false,
  scopeGrowthMode: 'calculated' as const,
  customScopeGrowth: '',
}

/** The cells whose defaults come from settings-store, supplied by the caller. */
export interface ViewStateSettingsSeed {
  customPercentile: number
  customPercentile2: number
  selectedResultsPercentiles: number[]
}

export function makeViewState(seed: ViewStateSettingsSeed): ForecastViewState {
  return { ...VIEW_STATE_LITERAL_SEEDS, ...seed }
}

interface ForecastResultsState {
  record: ForecastRunRecord | null
  /** {projectId, runToken} while a run is in flight, else null. */
  isSimulating: { projectId: string; runToken: number } | null
  viewState: Record<string, ForecastViewState>

  publishRecord: (record: ForecastRunRecord) => void
  clearRecord: () => void
  setIsSimulating: (value: { projectId: string; runToken: number } | null) => void
  /** Clears isSimulating only if the token still matches (trap 3). */
  clearIsSimulatingIfToken: (runToken: number) => void

  ensureViewState: (projectId: string, seed: ViewStateSettingsSeed) => void
  patchViewState: (projectId: string, patch: Partial<ForecastViewState>) => void
  /** Clamped to [0, scopeCount - 1]; a no-op when no scopes exist. */
  setSelectedMilestoneIndex: (projectId: string, index: number) => void

  /** deleteProject and merge-import's replaced ids. */
  clearForProject: (projectId: string) => void
  /** Clears the stale run but preserves viewState — the Story Map `update` path. */
  clearRecordForProject: (projectId: string) => void
  /** Sign-out, both cloud→local switches, and full import. */
  clearAll: () => void
}

export const useForecastResultsStore = create<ForecastResultsState>()((set, get) => ({
  record: null,
  isSimulating: null,
  viewState: {},

  publishRecord: (record) => set({ record }),
  clearRecord: () => set({ record: null }),
  setIsSimulating: (value) => set({ isSimulating: value }),

  clearIsSimulatingIfToken: (runToken) =>
    set((state) =>
      state.isSimulating?.runToken === runToken ? { isSimulating: null } : state
    ),

  ensureViewState: (projectId, seed) =>
    set((state) =>
      state.viewState[projectId]
        ? state
        : { viewState: { ...state.viewState, [projectId]: makeViewState(seed) } }
    ),

  patchViewState: (projectId, patch) =>
    set((state) => {
      const existing = state.viewState[projectId]
      // No entry yet means no consumer has mounted for this project, so there
      // is nothing for a patch to update. Creating one here would need a
      // settings seed this action does not have.
      if (!existing) return state
      return { viewState: { ...state.viewState, [projectId]: { ...existing, ...patch } } }
    }),

  setSelectedMilestoneIndex: (projectId, index) => {
    // Clamp on WRITE, against the live record. Deleting milestones without
    // re-running otherwise leaves an index that overruns the array it is
    // meant to index.
    const scopeCount = get().record?.scopes.length ?? 0
    if (scopeCount === 0) return
    const clamped = Math.max(0, Math.min(index, scopeCount - 1))
    get().patchViewState(projectId, { selectedMilestoneIndex: clamped })
  },

  clearForProject: (projectId) =>
    set((state) => {
      const { [projectId]: _dropped, ...remaining } = state.viewState
      return {
        viewState: remaining,
        record: state.record?.projectId === projectId ? null : state.record,
      }
    }),

  // The RECORD half of clearForProject, without touching viewState.
  //
  // A Story Map `update` invalidates the stale run — the sprint set moved — but
  // must NOT discard the view: target date, selected milestone and the
  // scope-growth triple are the user's own configuration, and preserving them
  // is the point of `update` versus `replace`. Auto-recalculate then fires on
  // an absent record (isRecordStale(null) === true), and both the read
  // (useForecastState) and write (setSelectedMilestoneIndex) clamp the
  // milestone index, so a view that outlives its record cannot overrun.
  clearRecordForProject: (projectId) =>
    set((state) => ({
      record: state.record?.projectId === projectId ? null : state.record,
    })),

  // Purges the view-state map alongside the record. clearProjectsOnSignOut
  // zeroes forecastInputs and _changeLog for stated shared-device reasons; a
  // surviving target date or percentile selection is the same shape of
  // residue, so both go at the same five sites.
  clearAll: () => set({ record: null, viewState: {}, isSimulating: null }),
}))

/** Read the record only when it belongs to the resolved project (D13). */
export function selectRecordFor(
  state: ForecastResultsState,
  projectId: string | undefined
): ForecastRunRecord | null {
  if (!projectId) return null
  return state.record?.projectId === projectId ? state.record : null
}
