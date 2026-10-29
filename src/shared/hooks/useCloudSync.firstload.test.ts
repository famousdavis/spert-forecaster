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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { loadProjects, loadSettings, subscribeToUserProjects, isProjectSaveOutstanding, saveProject } from '@/shared/firebase/firestore-driver'
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

  it('P-PERM a data error while applying the baseline shows the error with the exception\'s name, and is not retried', async () => {
    // W4: a malformed DOCUMENT no longer throws here. It loads without what
    // failed its checks (the next describe). So the data error is raised by
    // the store instead, which is still a path the baseline can throw on.
    const doc = {
      name: 'p', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS, owner: 'user-1', members: {}, schemaVersion: 1, sprints: [],
    } as unknown as FirestoreProjectDoc
    const replace = state().replaceProjectsFromCloud
    useProjectStore.setState({ replaceProjectsFromCloud: () => { throw new TypeError('store refused') } })
    try {
      vi.mocked(loadProjects).mockImplementation(() => { loadTimes.push(Date.now()); return Promise.resolve(new Map([['p', doc]])) })
      renderHook(() => useCloudSync(user, 'cloud'))
      await advance(0)
      expect(state().cloudLoadError).toEqual({ code: 'TypeError' })
      expect(state().cloudDataLoaded).toBe(false)
      await advance(10 * 60_000)
      await goOnline()
      expect(loadTimes).toHaveLength(1)
    } finally {
      useProjectStore.setState({ replaceProjectsFromCloud: replace })
    }
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

describe('W4 — a project document another user wrote cannot block the first load', () => {
  const good = (name: string) => ({
    name, unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS, owner: 'user-1', members: {}, schemaVersion: 1, sprints: [],
  }) as unknown as FirestoreProjectDoc
  const malformed = { ...good('Shared with you'), owner: 'someone-else', members: { 'user-1': 'viewer' }, sprints: { x: 1 } } as unknown as FirestoreProjectDoc

  it('W4-L1 loads every project, the malformed one without its sprints, and tells the user once (known-bad: the error panel, for good)', async () => {
    vi.mocked(loadProjects).mockImplementation(() => Promise.resolve(new Map([['a', good('Alpha')], ['b', malformed], ['c', good('Gamma')]])))
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().cloudLoadError).toBeNull()
    expect(state().cloudDataLoaded).toBe(true)
    expect(state().projects.map((p) => p.name)).toEqual(['Alpha', 'Shared with you', 'Gamma'])
    expect(vi.mocked(toast.warning)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.warning).mock.calls[0]![0]).toContain('“Shared with you”')
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('[cloud-load] project b: list-not-a-list')
  })

  it('W4-L2 a snapshot carrying the same document still applies, and the user is not told again', async () => {
    let raise: ((docs: Map<string, FirestoreProjectDoc>) => void) | undefined
    vi.mocked(subscribeToUserProjects).mockImplementation((_uid, cb) => { raise = cb; return () => {} })
    vi.mocked(loadProjects).mockImplementation(() => Promise.resolve(new Map([['a', good('Alpha')], ['b', malformed]])))
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    await act(async () => { raise!(new Map([['a', good('Alpha renamed')], ['b', malformed]])) })
    expect(state().projects.map((p) => p.name)).toEqual(['Alpha renamed', 'Shared with you'])
    expect(vi.mocked(toast.warning)).toHaveBeenCalledTimes(1)
  })

  it('W4-B14 the next save of your own project carries only its own sprints (known-bad: a sprint another document named it in was saved into it)', async () => {
    let handle: ((event: import('@/shared/firebase/types').SyncEvent) => void) | undefined
    vi.mocked(syncBus.subscribe).mockImplementation((h) => { handle = h; return () => {} })
    const sprint = (id: string, projectId: string, sprintNumber: number) => ({
      id, projectId, sprintNumber, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
      doneValue: 10, includedInForecast: true, createdAt: TS, updatedAt: TS,
    })
    const mine = { ...good('Mine'), sprints: [sprint('x1', 'x', 1)] } as unknown as FirestoreProjectDoc
    // A document that lists you, carrying a sprint that names YOUR project.
    const other = { ...good('Shared with you'), owner: 'someone-else', members: { 'user-1': 'viewer' }, sprints: [sprint('planted', 'x', 2)] } as unknown as FirestoreProjectDoc
    vi.mocked(loadProjects).mockImplementation(() => Promise.resolve(new Map([['x', mine], ['y', other]])))
    renderHook(() => useCloudSync(user, 'cloud'))
    await advance(0)
    expect(state().sprints.filter((s) => s.projectId === 'x').map((s) => s.id)).toEqual(['x1'])

    act(() => handle!({ type: 'project:save', projectId: 'x' }))
    expect(vi.mocked(saveProject)).toHaveBeenCalledTimes(1)
    const [savedId, savedDoc] = vi.mocked(saveProject).mock.calls[0]!
    expect(savedId).toBe('x')
    expect(savedDoc.sprints.map((s) => s.id)).toEqual(['x1'])
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('[cloud-load] project y: sprint-of-another-project')
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
