// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.50.0: useCloudSync hands a tile colour or archive change to the per-entry prefs write, under
// the signed-in user, even before the first cloud load (prefs events are not `project:` events, so
// holdBeforeBaseline lets them through; the cloud-loading panel covers every control that emits
// one until then). The cloud's map replaces the local one on the first load, `{}` included. The
// unload flush and the teardown cancel reach the prefs buffer through flushPendingSaves and
// cancelPendingSaves (firestore-prefs.test.ts proves both drain or empty it).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import type { FirestoreProjectDoc, FirestoreSettingsDoc, SyncEvent } from '@/shared/firebase/types'

const mutableAuth = vi.hoisted(() => ({ currentUser: { uid: 'user-1' } as import('firebase/auth').User | null }))

vi.mock('@/shared/firebase/firestore-driver', () => ({
  loadProjects: vi.fn(),
  saveProject: vi.fn(),
  saveProjectImmediate: vi.fn(),
  deleteProject: vi.fn(),
  cancelPendingSaves: vi.fn(),
  cancelPendingProjectSaves: vi.fn(),
  subscribeToUserProjects: vi.fn(),
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
  saveProjectPrefs: vi.fn(),
  flushPendingSaves: vi.fn(),
  isProjectSaveOutstanding: vi.fn(),
  SAVE_DEBOUNCE_MS: 200,
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { subscribe: vi.fn(), emit: vi.fn() } }))
vi.mock('@/shared/firebase/config', () => ({ auth: mutableAuth }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import {
  loadProjects,
  loadSettings,
  saveProjectPrefs,
  saveSettings,
  subscribeToUserProjects,
  flushPendingSaves,
  cancelPendingSaves,
} from '@/shared/firebase/firestore-driver'
import { syncBus } from '@/shared/firebase/sync-bus'
import { useCloudSync } from './useCloudSync'

const user = { uid: 'user-1' } as import('firebase/auth').User
const SEVEN: FirestoreSettingsDoc = {
  autoRecalculate: true,
  trialCount: 10000,
  defaultChartFontSize: 'medium',
  defaultCustomPercentile: 85,
  defaultCustomPercentile2: 50,
  defaultResultsPercentiles: [50, 80],
  distributionsEnabled: ['lognormal'],
}
let bus: ((event: SyncEvent) => void) | undefined

beforeEach(() => {
  bus = undefined
  vi.resetAllMocks()
  mutableAuth.currentUser = user
  useProjectStore.setState({ projects: [], sprints: [], cloudDataLoaded: false, cloudAccountId: '', viewingProjectId: null })
  useSettingsStore.setState({ projectPrefs: {}, _isCloudUpdate: false })
  vi.mocked(loadProjects).mockResolvedValue(new Map<string, FirestoreProjectDoc>())
  vi.mocked(loadSettings).mockResolvedValue(null)
  vi.mocked(subscribeToUserProjects).mockImplementation(() => () => {})
  vi.mocked(syncBus.subscribe).mockImplementation((handler) => {
    bus = handler as (e: SyncEvent) => void
    return () => {}
  })
})

const CHANGE: SyncEvent = { type: 'prefs:save', changes: [{ projectId: 'p1', field: 'color' }] }

describe('prefs:save', () => {
  it('goes to saveProjectPrefs (never saveSettings) with the uid, the pairs, and a reader of the CURRENT map', async () => {
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    act(() => bus!(CHANGE))
    expect(vi.mocked(saveSettings)).not.toHaveBeenCalled()
    expect(vi.mocked(saveProjectPrefs)).toHaveBeenCalledTimes(1)
    const [uid, changes, readPrefs] = vi.mocked(saveProjectPrefs).mock.calls[0]
    expect([uid, changes]).toEqual(['user-1', CHANGE.changes])
    useSettingsStore.setState({ projectPrefs: { p1: { color: 'pink' } } })
    expect(readPrefs()).toEqual({ p1: { color: 'pink' } })
  })

  it('is not held before the first cloud load', async () => {
    const pending = new Promise<Map<string, FirestoreProjectDoc>>(() => {})
    vi.mocked(loadProjects).mockReturnValue(pending)
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(bus).toBeDefined())
    expect(useProjectStore.getState().cloudDataLoaded).toBe(false)
    act(() => bus!(CHANGE))
    expect(vi.mocked(saveProjectPrefs)).toHaveBeenCalledTimes(1)
  })

  it('pagehide and beforeunload flush the pending saves, prefs among them; unmount cancels them', async () => {
    const { unmount } = renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new Event('beforeunload'))
    expect(vi.mocked(flushPendingSaves)).toHaveBeenCalledTimes(2)
    unmount()
    expect(vi.mocked(cancelPendingSaves)).toHaveBeenCalled()
  })
})

describe('the first load', () => {
  it("replaces the local map with the cloud's", async () => {
    useSettingsStore.setState({ projectPrefs: { stale: { color: 'blue' } } })
    vi.mocked(loadSettings).mockResolvedValue({ ...SEVEN, projectPrefs: { p1: { archived: true } } })
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    expect(useSettingsStore.getState().projectPrefs).toEqual({ p1: { archived: true } })
  })

  it("replaces it with {} when the cloud's settings document has no map", async () => {
    useSettingsStore.setState({ projectPrefs: { stale: { color: 'blue' } } })
    vi.mocked(loadSettings).mockResolvedValue({ ...SEVEN })
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    expect(useSettingsStore.getState().projectPrefs).toEqual({})
  })
})
