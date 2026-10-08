// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40 (B2): the first cloud load fails honestly. A failure a retry can cure
// (the cloud can't be reached) waits and retries; anything else — the cloud
// refusing the request, or a data error while applying the baseline — waits for
// Try again, and nothing automatic retries it. Fake timers throughout: these
// tests assert WHEN attempts happen, and that some never do.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import type { FirestoreProjectDoc } from '@/shared/firebase/types'

const mutableAuth = vi.hoisted(() => ({
  currentUser: { uid: 'user-1' } as import('firebase/auth').User | null,
}))

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
  flushPendingSaves: vi.fn(),
  isProjectSaveOutstanding: vi.fn(),
  SAVE_DEBOUNCE_MS: 200,
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { subscribe: vi.fn(() => () => {}), emit: vi.fn() } }))
vi.mock('@/shared/firebase/config', () => ({ auth: mutableAuth }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { loadProjects, loadSettings, subscribeToUserProjects, isProjectSaveOutstanding } from '@/shared/firebase/firestore-driver'
import { syncBus } from '@/shared/firebase/sync-bus'
import { toast } from 'sonner'
import { useCloudSync, loadErrorCode } from './useCloudSync'

const user = { uid: 'user-1' } as import('firebase/auth').User
const TS = '2026-01-01T00:00:00.000Z'
const unavailable = () => Object.assign(new Error('Failed to get documents from server.'), { code: 'unavailable' })
const refused = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
const state = () => useProjectStore.getState()
/** Advance fake time and let every promise chain the hook started settle. */
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const pressTryAgain = () => act(async () => { state().requestCloudLoadRetry(); await vi.advanceTimersByTimeAsync(0) })
const goOnline = () => act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })

let loadTimes: number[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mutableAuth.currentUser = user
  useProjectStore.setState({ projects: [], sprints: [], cloudDataLoaded: false, cloudLoadRetrying: false, cloudLoadError: null })
  loadTimes = []
  vi.mocked(loadSettings).mockResolvedValue(null)
  vi.mocked(isProjectSaveOutstanding).mockReturnValue(false)
  vi.mocked(subscribeToUserProjects).mockImplementation(() => () => {})
  vi.mocked(syncBus.subscribe).mockImplementation(() => () => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** loadProjects fails with each of `failures` in turn, then succeeds with an empty cloud. */
function loadsFailing(...failures: unknown[]) {
  vi.mocked(loadProjects).mockImplementation(() => {
    loadTimes.push(Date.now())
    const failure = failures.shift()
    return failure === undefined ? Promise.resolve(new Map()) : Promise.reject(failure)
  })
}

describe('a transient first-load failure (the cloud can\'t be reached)', () => {
  it('W-3 retries after 2, 4, 8, 16, 30 and 30 seconds, toasting once (known-bad: no wait between attempts)', async () => {
    loadsFailing(...Array.from({ length: 6 }, unavailable))
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().cloudLoadRetrying).toBe(true)
    expect(state().cloudLoadError).toBeNull()
    await advance(2000 + 4000 + 8000 + 16000 + 30000 + 30000)
    expect(loadTimes.map((t, i) => (i === 0 ? 0 : t - loadTimes[i - 1]))).toEqual([0, 2000, 4000, 8000, 16000, 30000, 30000])
    expect(state().cloudDataLoaded).toBe(true)
    expect(state().cloudLoadRetrying).toBe(false)
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
  })

  it('Try again retries at once, without waiting for the backoff (known-bad: Try again does nothing)', async () => {
    loadsFailing(unavailable())
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(loadTimes).toHaveLength(1)
    await pressTryAgain()
    expect(loadTimes).toHaveLength(2)
    expect(loadTimes[1] - loadTimes[0]).toBe(0)
    expect(state().cloudDataLoaded).toBe(true)
  })
})

describe('any other first-load failure waits for Try again (known-bad: retry everything)', () => {
  it('permission-denied shows the error, and neither time nor an online event retries it; Try again does', async () => {
    loadsFailing(refused())
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().cloudLoadError).toEqual({ code: 'permission-denied' })
    expect(state().cloudLoadRetrying).toBe(false)
    expect(state().cloudDataLoaded).toBe(false)
    await advance(10 * 60_000)
    await goOnline()
    expect(loadTimes).toHaveLength(1)
    await pressTryAgain()
    expect(loadTimes).toHaveLength(2)
    expect(state().cloudDataLoaded).toBe(true)
    expect(state().cloudLoadError).toBeNull()
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
  })

  it('P-PERM a malformed project (a data error while applying the baseline) shows the error with the exception\'s name, and is not retried', async () => {
    const malformed = {
      name: 'p', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS, owner: 'user-1', members: {}, schemaVersion: 1,
      sprints: { x: 1 },
    } as unknown as FirestoreProjectDoc
    vi.mocked(loadProjects).mockImplementation(() => { loadTimes.push(Date.now()); return Promise.resolve(new Map([['p', malformed]])) })
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().cloudLoadError).toEqual({ code: 'TypeError' })
    expect(state().cloudDataLoaded).toBe(false)
    await advance(10 * 60_000)
    await goOnline()
    expect(loadTimes).toHaveLength(1)
  })

  it('a codeless, nameless exception shows "unknown"', async () => {
    loadsFailing({})
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().cloudLoadError).toEqual({ code: 'unknown' })
  })

  it('Try again while an attempt is in flight does nothing', async () => {
    let finish!: (docs: Map<string, FirestoreProjectDoc>) => void
    vi.mocked(loadProjects)
      .mockImplementationOnce(() => { loadTimes.push(Date.now()); return Promise.reject(refused()) })
      .mockImplementationOnce(() => { loadTimes.push(Date.now()); return new Promise((resolve) => { finish = resolve }) })
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    await pressTryAgain()
    expect(loadTimes).toHaveLength(2)
    await pressTryAgain()
    await pressTryAgain()
    expect(loadTimes).toHaveLength(2)
    await act(async () => { finish(new Map()); await vi.advanceTimersByTimeAsync(0) })
    expect(state().cloudDataLoaded).toBe(true)
  })
})

describe('teardown during a first-load wait', () => {
  it('wakes the wait, clears the failure state, and nothing sets it again', async () => {
    loadsFailing(refused())
    const { unmount } = renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().cloudLoadError).toEqual({ code: 'permission-denied' })
    unmount()
    expect(state().cloudLoadError).toBeNull()
    expect(state().cloudLoadRetrying).toBe(false)
    await advance(60_000)
    await pressTryAgain()
    expect(loadTimes).toHaveLength(1)
    expect(state().cloudLoadError).toBeNull()
    expect(state().cloudDataLoaded).toBe(false)
  })

  it('clearProjectsOnSignOut clears the failure state too', () => {
    useProjectStore.setState({ cloudLoadRetrying: true, cloudLoadError: { code: 'permission-denied' } })
    state().clearProjectsOnSignOut()
    expect(state().cloudLoadRetrying).toBe(false)
    expect(state().cloudLoadError).toBeNull()
  })
})

describe('loadErrorCode — what the error panel shows (C5)', () => {
  it('is the Firestore code, else the error\'s name, else "unknown"', () => {
    expect(loadErrorCode(refused())).toBe('permission-denied')
    expect(loadErrorCode(new TypeError('x'))).toBe('TypeError')
    expect(loadErrorCode(new Error('x'))).toBe('Error')
    expect(loadErrorCode(Object.assign(new Error('x'), { code: '' }))).toBe('Error')
    expect(loadErrorCode({})).toBe('unknown')
    expect(loadErrorCode(null)).toBe('unknown')
    expect(loadErrorCode('a string')).toBe('unknown')
  })
})
