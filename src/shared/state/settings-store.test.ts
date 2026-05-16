// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from './settings-store'
import { syncBus } from '@/shared/firebase/sync-bus'

describe('settings-store', () => {
  beforeEach(() => {
    // Reset to defaults between tests
    useSettingsStore.setState({
      distributionsEnabled: ['truncatedNormal'],
      _isCloudUpdate: false,
    })
  })

  describe('setDistributionsEnabled', () => {
    it('updates state', () => {
      useSettingsStore.getState().setDistributionsEnabled(['truncatedNormal', 'lognormal'])
      expect(useSettingsStore.getState().distributionsEnabled).toEqual([
        'truncatedNormal',
        'lognormal',
      ])
    })

    it('rejects empty array (validation must enforce at least one)', () => {
      useSettingsStore.getState().setDistributionsEnabled(['truncatedNormal', 'gamma'])
      useSettingsStore.getState().setDistributionsEnabled([])
      // Should still be the prior value
      expect(useSettingsStore.getState().distributionsEnabled).toEqual([
        'truncatedNormal',
        'gamma',
      ])
    })

    it('fires emitSettingsSave (no-cloud flag) when user-driven', () => {
      const spy = vi.spyOn(syncBus, 'emit')
      useSettingsStore.getState().setDistributionsEnabled(['truncatedNormal', 'lognormal'])
      expect(spy).toHaveBeenCalledWith({ type: 'settings:save' })
      spy.mockRestore()
    })

    it('suppresses sync emit during cloud restore', () => {
      // Simulate cloud-restore path: _isCloudUpdate flag active
      useSettingsStore.setState({ _isCloudUpdate: true })
      const spy = vi.spyOn(syncBus, 'emit')
      useSettingsStore.getState().setDistributionsEnabled(['gamma'])
      // Setter ran (state mutated)
      expect(useSettingsStore.getState().distributionsEnabled).toEqual(['gamma'])
      // But no sync emit fired — would echo the cloud restore back as a write
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('replaceSettingsFromCloud', () => {
    it('hydrates distributionsEnabled from cloud and does not echo emit', async () => {
      const spy = vi.spyOn(syncBus, 'emit')
      useSettingsStore.getState().replaceSettingsFromCloud({
        autoRecalculate: true,
        trialCount: 10000,
        defaultChartFontSize: 'medium',
        defaultCustomPercentile: 85,
        defaultCustomPercentile2: 50,
        defaultResultsPercentiles: [50, 80],
        distributionsEnabled: ['truncatedNormal', 'bootstrap'],
      })
      expect(useSettingsStore.getState().distributionsEnabled).toEqual([
        'truncatedNormal',
        'bootstrap',
      ])
      expect(spy).not.toHaveBeenCalledWith({ type: 'settings:save' })
      // Flag resets to false on next microtask so subsequent user-driven setters re-emit
      await Promise.resolve()
      expect(useSettingsStore.getState()._isCloudUpdate).toBe(false)
      spy.mockRestore()
    })
  })
})
