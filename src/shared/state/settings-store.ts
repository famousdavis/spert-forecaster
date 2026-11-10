// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { storage } from './storage'
import { type ChartFontSize, DEFAULT_CHART_FONT_SIZE, type DistributionType } from '@/shared/types/burn-up'
import { DEFAULT_TRIAL_COUNT, DEFAULT_SELECTED_PERCENTILES, SELECTABLE_PERCENTILES } from '@/features/forecast/constants'
import { syncBus } from '@/shared/firebase/sync-bus'
import {
  MAX_PROJECT_PREFS,
  PROJECT_COLORS,
  isUnsafePrefKey,
  projectPrefOf,
  sanitizeProjectPrefs,
  type ProjectColor,
  type ProjectPref,
  type ProjectPrefField,
  type ProjectPrefs,
} from '@/shared/lib/project-prefs'

const SETTINGS_STORAGE_KEY = 'spert-settings'

export type TrialCount = 1000 | 5000 | 10000 | 25000 | 50000

export const TRIAL_COUNT_OPTIONS: { value: TrialCount; label: string }[] = [
  { value: 1000, label: '1,000' },
  { value: 5000, label: '5,000' },
  { value: 10000, label: '10,000' },
  { value: 25000, label: '25,000' },
  { value: 50000, label: '50,000' },
]

interface SettingsState {
  // Simulation
  autoRecalculate: boolean
  trialCount: TrialCount

  // Chart defaults
  defaultChartFontSize: ChartFontSize
  defaultCustomPercentile: number // 1-99
  defaultCustomPercentile2: number // 1-99
  defaultResultsPercentiles: number[] // subset of [10,20,...,90]

  // Statistical methods to show — at least one must remain enabled.
  // Bootstrap inclusion is also gated per-project at render time on ≥5 sprints of history.
  distributionsEnabled: DistributionType[]

  // Export attribution
  exportName: string
  exportId: string

  // Notifications (local-only)
  suppressLocalStorageWarning: boolean

  // This person's tile colours and archived projects (v0.50.0), keyed by project id.
  // Written to the cloud entry by entry (`prefs:save`), never with the seven fields above.
  projectPrefs: ProjectPrefs

  // Cloud sync flag (transient)
  _isCloudUpdate: boolean

  // Actions
  setAutoRecalculate: (value: boolean) => void
  setTrialCount: (value: TrialCount) => void
  setDefaultChartFontSize: (value: ChartFontSize) => void
  setDefaultCustomPercentile: (value: number) => void
  setDefaultCustomPercentile2: (value: number) => void
  setDefaultResultsPercentiles: (value: number[]) => void
  setDistributionsEnabled: (value: DistributionType[]) => void
  setExportName: (value: string) => void
  setExportId: (value: string) => void
  setSuppressLocalStorageWarning: (value: boolean) => void

  // Tile colour and archive (v0.50.0). Each returns whether it applied: false for an unsafe
  // key, an unknown colour, or a new entry past MAX_PROJECT_PREFS. No role guard (D31): they
  // change only this person's settings, never a project.
  /** A colour, or null for none. */
  setProjectColor: (projectId: string, color: ProjectColor | null) => boolean
  setProjectArchived: (projectId: string, archived: boolean) => boolean
  /** A deleted project's entry goes with it. */
  dropProjectPref: (projectId: string) => boolean
  /** A clone takes its source's colour, never its archive. */
  copyProjectColor: (fromId: string, toId: string) => boolean
  /** D36: the target becomes exactly the source's entry (removed when the source has none), and the source goes. */
  moveProjectPref: (fromId: string, toId: string) => boolean

  // Sign-out action — clears user-identifying attribution fields so they
  // don't persist to the next user on a shared browser (F2/F3).
  clearSettingsOnSignOut: () => void

  // Cloud sync actions
  replaceSettingsFromCloud: (settings: {
    autoRecalculate: boolean
    trialCount: TrialCount
    defaultChartFontSize: ChartFontSize
    defaultCustomPercentile: number
    defaultCustomPercentile2: number
    defaultResultsPercentiles: number[]
    distributionsEnabled: DistributionType[]
    projectPrefs: ProjectPrefs
  }) => void
}

function emitSettingsSave(isCloudUpdate: boolean): void {
  if (!isCloudUpdate) {
    syncBus.emit({ type: 'settings:save' })
  }
}

/** The fields of `before` and `after` that differ. */
function changedFields(before: ProjectPref, after: ProjectPref): ProjectPrefField[] {
  const fields: ProjectPrefField[] = []
  if (before.color !== after.color) fields.push('color')
  if (before.archived !== after.archived) fields.push('archived')
  return fields
}

/**
 * The map with these entries set (an empty entry removes its key), and the (id, field) pairs
 * that changed; null when the result would grow past MAX_PROJECT_PREFS.
 */
function withEntries(
  prefs: ProjectPrefs,
  entries: [string, ProjectPref][],
): { prefs: ProjectPrefs; changes: { projectId: string; field: ProjectPrefField }[] } | null {
  const next: ProjectPrefs = { ...prefs }
  const changes: { projectId: string; field: ProjectPrefField }[] = []
  for (const [projectId, after] of entries) {
    const before = projectPrefOf(next, projectId)
    for (const field of changedFields(before, after)) changes.push({ projectId, field })
    const entry: ProjectPref = {}
    if (after.color) entry.color = after.color
    if (after.archived) entry.archived = true
    if (entry.color || entry.archived) next[projectId] = entry
    else delete next[projectId]
  }
  const size = Object.keys(next).length
  if (size > MAX_PROJECT_PREFS && size > Object.keys(prefs).length) return null
  return { prefs: next, changes }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      /** Sets these entries and emits the pairs that changed. False when refused (the bound). */
      const applyEntries = (entries: [string, ProjectPref][]): boolean => {
        const next = withEntries(get().projectPrefs, entries)
        if (!next) return false
        if (next.changes.length === 0) return true
        set({ projectPrefs: next.prefs })
        if (!get()._isCloudUpdate) syncBus.emit({ type: 'prefs:save', changes: next.changes })
        return true
      }
      return {
      // Defaults
      autoRecalculate: true,
      trialCount: DEFAULT_TRIAL_COUNT as TrialCount,
      defaultChartFontSize: DEFAULT_CHART_FONT_SIZE,
      defaultCustomPercentile: 85,
      defaultCustomPercentile2: 50,
      defaultResultsPercentiles: [...DEFAULT_SELECTED_PERCENTILES],

      // Statistical methods to show — default to Lognormal only for the cleanest first-touch
      // view. v0.32.0 promoted Lognormal from optional to default: it is naturally non-negative,
      // matches the empirical right-skew of sprint velocity, and avoids the upward mean bias
      // that truncation-at-zero introduces in T-Normal at high CV (σ/μ ≳ 0.3). Existing cloud
      // users arrive at this default through firestoreDocToSettings's defensive coercion
      // (missing / empty / corrupt arrays fall back to ['lognormal']); existing local users
      // keep their persisted selection unchanged.
      distributionsEnabled: ['lognormal'],

      // Export attribution
      exportName: '',
      exportId: '',

      // Notifications (local-only)
      suppressLocalStorageWarning: false,

      projectPrefs: {},

      _isCloudUpdate: false,

      // Actions — each emits to sync bus for cloud persistence
      setAutoRecalculate: (value) => {
        set({ autoRecalculate: value })
        emitSettingsSave(get()._isCloudUpdate)
      },
      setTrialCount: (value) => {
        set({ trialCount: value })
        emitSettingsSave(get()._isCloudUpdate)
      },
      setDefaultChartFontSize: (value) => {
        set({ defaultChartFontSize: value })
        emitSettingsSave(get()._isCloudUpdate)
      },
      setDefaultCustomPercentile: (value) => {
        set({ defaultCustomPercentile: Math.max(1, Math.min(99, Math.round(value))) })
        emitSettingsSave(get()._isCloudUpdate)
      },
      setDefaultCustomPercentile2: (value) => {
        set({ defaultCustomPercentile2: Math.max(1, Math.min(99, Math.round(value))) })
        emitSettingsSave(get()._isCloudUpdate)
      },
      setDefaultResultsPercentiles: (value) => {
        set({
          defaultResultsPercentiles: value
            .filter((p) => (SELECTABLE_PERCENTILES as readonly number[]).includes(p))
            .sort((a, b) => a - b),
        })
        emitSettingsSave(get()._isCloudUpdate)
      },
      setDistributionsEnabled: (value) => {
        // Validation: must have at least one. Reject empty arrays silently — callers
        // (e.g., Settings checkbox UI) should block last-uncheck before reaching here.
        if (value.length === 0) return
        set({ distributionsEnabled: value })
        emitSettingsSave(get()._isCloudUpdate)
      },
      // Export attribution and notifications are local-only — no sync bus emission
      setExportName: (value) => set({ exportName: value }),
      setExportId: (value) => set({ exportId: value }),
      setSuppressLocalStorageWarning: (value) => set({ suppressLocalStorageWarning: value }),

      // Tile colour and archive. Each change is its own sync event, carrying the (id, field)
      // pairs it changed — never `settings:save`, which writes the seven fields above.
      setProjectColor: (projectId, color) => {
        if (isUnsafePrefKey(projectId)) return false
        if (color !== null && !PROJECT_COLORS.includes(color)) return false
        const before = projectPrefOf(get().projectPrefs, projectId)
        return applyEntries([[projectId, { ...before, color: color ?? undefined }]])
      },
      setProjectArchived: (projectId, archived) => {
        if (isUnsafePrefKey(projectId)) return false
        const before = projectPrefOf(get().projectPrefs, projectId)
        return applyEntries([[projectId, { ...before, archived: archived ? true : undefined }]])
      },
      dropProjectPref: (projectId) => {
        if (isUnsafePrefKey(projectId)) return false
        return applyEntries([[projectId, {}]])
      },
      copyProjectColor: (fromId, toId) => {
        if (isUnsafePrefKey(fromId) || isUnsafePrefKey(toId)) return false
        const prefs = get().projectPrefs
        const color = projectPrefOf(prefs, fromId).color
        return applyEntries([[toId, { ...projectPrefOf(prefs, toId), color }]])
      },
      moveProjectPref: (fromId, toId) => {
        if (isUnsafePrefKey(fromId) || isUnsafePrefKey(toId)) return false
        if (fromId === toId) return true
        const source = projectPrefOf(get().projectPrefs, fromId)
        return applyEntries([[fromId, {}], [toId, source]])
      },

      // Sign-out and account change (the two callers): the attribution, and this person's
      // tile colours and archive, so the next account on this browser inherits neither
      // (RISK-G2). Straight to set(), emitting nothing: at sign-out the sync bus is still
      // subscribed after cancelPendingSaves (AuthProvider), so an emitting clear would queue
      // deletes into the signed-out account's settings document. Simulation and display
      // preferences are per-browser defaults and safe to carry forward. The two cloud→local
      // switches do NOT call this: they keep the map, so a backup restored after the switch
      // gets its colours back (D34).
      clearSettingsOnSignOut: () => set({ exportName: '', exportId: '', projectPrefs: {} }),

      replaceSettingsFromCloud: (settings) => {
        set({
          ...settings,
          _isCloudUpdate: true,
        })
        // Defer reset so all synchronous Zustand subscribers see the flag
        queueMicrotask(() => set({ _isCloudUpdate: false }))
      },
      }
    },
    {
      name: SETTINGS_STORAGE_KEY,
      // The default merge (`{ ...current, ...persisted }`), with the map sanitised: a corrupted
      // or hand-edited `spert-settings` never puts a bad entry or an unsafe key in the store.
      // Every other persisted setting comes through as before.
      merge: (persisted, current) => {
        const stored = persisted && typeof persisted === 'object' ? (persisted as Partial<SettingsState>) : {}
        return { ...current, ...stored, projectPrefs: sanitizeProjectPrefs(stored.projectPrefs) }
      },
      storage: {
        getItem: (name) => {
          const str = storage.getItem(name)
          return str ? JSON.parse(str) : null
        },
        setItem: (name, value) => {
          storage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          storage.removeItem(name)
        },
      },
    }
  )
)
