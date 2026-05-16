// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { storage } from './storage'
import { type ChartFontSize, DEFAULT_CHART_FONT_SIZE } from '@/shared/types/burn-up'
import { DEFAULT_TRIAL_COUNT, DEFAULT_SELECTED_PERCENTILES, SELECTABLE_PERCENTILES } from '@/features/forecast/constants'
import { syncBus } from '@/shared/firebase/sync-bus'

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

  // Export attribution
  exportName: string
  exportId: string

  // Notifications (local-only)
  suppressLocalStorageWarning: boolean

  // Cloud sync flag (transient)
  _isCloudUpdate: boolean

  // Actions
  setAutoRecalculate: (value: boolean) => void
  setTrialCount: (value: TrialCount) => void
  setDefaultChartFontSize: (value: ChartFontSize) => void
  setDefaultCustomPercentile: (value: number) => void
  setDefaultCustomPercentile2: (value: number) => void
  setDefaultResultsPercentiles: (value: number[]) => void
  setExportName: (value: string) => void
  setExportId: (value: string) => void
  setSuppressLocalStorageWarning: (value: boolean) => void

  // Cloud sync actions
  replaceSettingsFromCloud: (settings: {
    autoRecalculate: boolean
    trialCount: TrialCount
    defaultChartFontSize: ChartFontSize
    defaultCustomPercentile: number
    defaultCustomPercentile2: number
    defaultResultsPercentiles: number[]
  }) => void
}

function emitSettingsSave(isCloudUpdate: boolean): void {
  if (!isCloudUpdate) {
    syncBus.emit({ type: 'settings:save' })
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Defaults
      autoRecalculate: true,
      trialCount: DEFAULT_TRIAL_COUNT as TrialCount,
      defaultChartFontSize: DEFAULT_CHART_FONT_SIZE,
      defaultCustomPercentile: 85,
      defaultCustomPercentile2: 50,
      defaultResultsPercentiles: [...DEFAULT_SELECTED_PERCENTILES],

      // Export attribution
      exportName: '',
      exportId: '',

      // Notifications (local-only)
      suppressLocalStorageWarning: false,

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
      // Export attribution and notifications are local-only — no sync bus emission
      setExportName: (value) => set({ exportName: value }),
      setExportId: (value) => set({ exportId: value }),
      setSuppressLocalStorageWarning: (value) => set({ suppressLocalStorageWarning: value }),

      replaceSettingsFromCloud: (settings) => {
        set({
          ...settings,
          _isCloudUpdate: true,
        })
        // Defer reset so all synchronous Zustand subscribers see the flag
        queueMicrotask(() => set({ _isCloudUpdate: false }))
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
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
