// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import type { FirestoreProjectDoc, SyncEvent } from '@/shared/firebase/types'
import type { Project } from '@/shared/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Hoisted so the auth mock factory below can reference it (factories run before
// module-level test code). mutableAuth.currentUser is set per test to drive the
// uid-guard added to setup() and the snapshot callback (Pass 5).
const mutableAuth = vi.hoisted(() => ({
  currentUser: { uid: 'user-1' } as import('firebase/auth').User | null,
}))

vi.mock('@/shared/firebase/firestore-driver', () => ({
  loadProjects: vi.fn(),
  saveProject: vi.fn(),
  saveProjectImmediate: vi.fn(),
  deleteProject: vi.fn(),
  cancelPendingSaves: vi.fn(),
  subscribeToUserProjects: vi.fn(),
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
  flushPendingSaves: vi.fn(),
  // Inlined rather than re-exported so the mock factory doesn't need the real module.
  SAVE_DEBOUNCE_MS: 200,
}))

vi.mock('@/shared/firebase/sync-bus', () => ({
  syncBus: {
    subscribe: vi.fn(),
    emit: vi.fn(),
  },
}))

vi.mock('@/shared/firebase/config', () => ({ auth: mutableAuth }))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import {
  loadProjects,
  saveProject,
  saveProjectImmediate,
  deleteProject,
  subscribeToUserProjects,
  loadSettings,
  SAVE_DEBOUNCE_MS,
} from '@/shared/firebase/firestore-driver'
import { syncBus } from '@/shared/firebase/sync-bus'
import { useCloudSync } from './useCloudSync'
import { toast } from 'sonner'
import type { Sprint } from '@/shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────
// Full FirestoreProjectDoc shape — all required fields per types.ts (verified
// pre-implementation: name, unitOfMeasure, sprints, createdAt, updatedAt,
// owner, members, schemaVersion). milestones and productivityAdjustments are
// optional but included for parity with production docs.
function makeFirestoreDoc(
  overrides: Partial<FirestoreProjectDoc> = {},
): FirestoreProjectDoc {
  return {
    name: 'Test Project',
    unitOfMeasure: 'points',
    sprints: [],
    milestones: [],
    productivityAdjustments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    owner: 'user-1',
    members: {},
    schemaVersion: 1,
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'Test Project',
    unitOfMeasure: 'points',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const mockUser = { uid: 'user-1' } as import('firebase/auth').User

// ── Handler captures ──────────────────────────────────────────────────────────
// Captured by mockImplementation in beforeEach. The snapshot callback is NOT
// auto-fired (tests control when docMetaRef gets populated). The syncBus
// handler is invoked directly to trigger the 'project:import' case block.
let capturedSnapshotCallback:
  | ((docs: Map<string, FirestoreProjectDoc>) => void)
  | undefined
let capturedSyncBusHandler: ((event: SyncEvent) => void) | undefined

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(() => {
  capturedSnapshotCallback = undefined
  capturedSyncBusHandler = undefined
  useProjectStore.setState({
    projects: [],
    sprints: [],
    cloudDataLoaded: false,
  })

  // vi.resetAllMocks resets call history AND implementations; re-apply defaults.
  vi.resetAllMocks()
  // mutableAuth.currentUser is a plain object property — resetAllMocks does
  // not touch it. Explicitly restore so tests that nullify it don't leak.
  mutableAuth.currentUser = mockUser
  vi.mocked(loadProjects).mockResolvedValue(new Map())
  vi.mocked(saveProjectImmediate).mockResolvedValue(undefined)
  vi.mocked(deleteProject).mockResolvedValue(undefined)
  vi.mocked(loadSettings).mockResolvedValue(null)

  // Capture snapshot callback WITHOUT firing it so tests control when docMetaRef
  // is populated (prevents replaceProjectsFromCloud from overwriting test state).
  vi.mocked(subscribeToUserProjects).mockImplementation((_uid, callback) => {
    capturedSnapshotCallback = callback
    return () => {}
  })

  // Capture sync-bus handler for direct invocation in tests.
  vi.mocked(syncBus.subscribe).mockImplementation((handler) => {
    capturedSyncBusHandler = handler as (event: SyncEvent) => void
    return () => {}
  })
})

afterEach(() => {
  // Belt-and-braces: ensure no test leaves mutableAuth.currentUser contaminated
  // for the next test, regardless of beforeEach ordering on next run.
  mutableAuth.currentUser = mockUser
})

// ── cloudDataLoaded hydration signal ─────────────────────────────────────────
describe('useCloudSync — cloudDataLoaded signal (pitfall #88)', () => {
  it('sets cloudDataLoaded true after successful loadProjects', async () => {
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() =>
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true),
    )
  })

  it('sets cloudDataLoaded true even when loadProjects throws (defensive)', async () => {
    vi.mocked(loadProjects).mockRejectedValue(new Error('network error'))
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() =>
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true),
    )
  })

  it('sets cloudDataLoaded true when data-loss guard fires (cloud empty, local non-empty)', async () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'local-1', name: 'Local' })],
    })
    vi.mocked(loadProjects).mockResolvedValue(new Map())
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() =>
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true),
    )
    // Local projects must NOT have been replaced by the empty cloud
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })

  it('resets cloudDataLoaded to false on cleanup', async () => {
    const { unmount } = renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() =>
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true),
    )
    act(() => {
      unmount()
    })
    expect(useProjectStore.getState().cloudDataLoaded).toBe(false)
  })

  it('registers pagehide alongside beforeunload; removes both on cleanup (D2)', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    try {
      const { unmount } = renderHook(() => useCloudSync(mockUser, 'cloud'))
      await waitFor(() =>
        expect(useProjectStore.getState().cloudDataLoaded).toBe(true),
      )
      expect(addSpy.mock.calls.filter(([e]) => e === 'beforeunload')).toHaveLength(1)
      expect(addSpy.mock.calls.filter(([e]) => e === 'pagehide')).toHaveLength(1)
      act(() => { unmount() })
      expect(removeSpy.mock.calls.filter(([e]) => e === 'beforeunload')).toHaveLength(1)
      expect(removeSpy.mock.calls.filter(([e]) => e === 'pagehide')).toHaveLength(1)
    } finally {
      addSpy.mockRestore()
      removeSpy.mockRestore()
    }
  })
})

// ── Phase 5: project:import owner pre-seed (pitfall #7) ──────────────────────
describe('useCloudSync — project:import owner pre-seed (pitfall #7)', () => {
  // Renders the hook, waits for hydration AND both handler captures, fires the
  // snapshot callback to populate docMetaRef, then resets state to reflect the
  // post-import Zustand state (winner in store, existing gone).
  //
  // The snapshot callback calls replaceProjectsFromCloud internally, which would
  // overwrite state.projects — the setState AFTER the callback corrects for this.
  async function setupForImportTest(
    existingId: string,
    winnerId: string,
    existingDoc: FirestoreProjectDoc,
  ) {
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    // Assert all three conditions in one waitFor to avoid the race between
    // setCloudDataLoaded(true) (in finally) and subscribeToUserProjects() (called
    // synchronously after finally, but with an async polling gap in waitFor).
    await waitFor(() => {
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true)
      expect(capturedSnapshotCallback).toBeDefined()
      expect(capturedSyncBusHandler).toBeDefined()
    })
    // Populate docMetaRef via the captured snapshot callback.
    act(() => {
      capturedSnapshotCallback!(new Map([[existingId, existingDoc]]))
    })
    // Reset to post-import state: winner in the store, existing gone.
    // Wrapped in act() because setState triggers Zustand subscriber notifications.
    act(() => {
      useProjectStore.setState({
        projects: [makeProject({ id: winnerId, name: 'Alpha' })],
        sprints: [],
      })
    })
  }

  it('pre-seeds docMetaRef with existing owner/members when current user owns the doc', async () => {
    const existingId = 'existing-1'
    const winnerId = 'winner-1'
    const existingDoc = makeFirestoreDoc({
      owner: 'user-1', // current user IS the owner
      members: { collab: 'editor' },
    })
    await setupForImportTest(existingId, winnerId, existingDoc)

    act(() => {
      capturedSyncBusHandler!({
        type: 'project:import',
        replacedIdMap: new Map([[existingId, winnerId]]),
      })
    })

    await waitFor(() => expect(saveProjectImmediate).toHaveBeenCalled())

    const calls = vi.mocked(saveProjectImmediate).mock.calls
    const winnerCall = calls.find(([id]) => id === winnerId)
    expect(winnerCall).toBeDefined()
    // Pre-seed populated docMetaRef[winnerId] with the old doc, so
    // projectToFirestoreDoc writes the old owner and members to the new doc.
    expect(winnerCall![1]).toMatchObject({
      owner: 'user-1',
      members: { collab: 'editor' },
    })
  })

  it('does NOT pre-seed when current user is not the owner — members are not preserved', async () => {
    const existingId = 'existing-1'
    const winnerId = 'winner-1'
    const existingDoc = makeFirestoreDoc({
      owner: 'someone-else', // a different user owns this doc
      members: { 'user-1': 'editor', collab: 'editor' },
    })
    await setupForImportTest(existingId, winnerId, existingDoc)

    act(() => {
      capturedSyncBusHandler!({
        type: 'project:import',
        replacedIdMap: new Map([[existingId, winnerId]]),
      })
    })

    await waitFor(() => expect(saveProjectImmediate).toHaveBeenCalled())

    const calls = vi.mocked(saveProjectImmediate).mock.calls
    const winnerCall = calls.find(([id]) => id === winnerId)
    expect(winnerCall).toBeDefined()
    // Pre-seed was skipped (owner guard failed).
    // projectToFirestoreDoc falls back: existingDoc=undefined → owner: uid, members: {}
    expect(winnerCall![1]).toMatchObject({ owner: 'user-1', members: {} })
    // Old members were NOT carried over
    expect(winnerCall![1].members).not.toHaveProperty('collab')
  })
})

// ── Pass 5: snapshot user-guard and data-loss sentinel (H2 + I1) ─────────────
//
// The existing 'sets cloudDataLoaded true when data-loss guard fires' test
// above covers the INITIAL-LOAD guard inside setup(). The tests here cover
// the snapshot-callback guard and the closure-local sentinel that allows
// access-revocation events to propagate after the first non-empty snapshot.
//
describe('useCloudSync — snapshot user-guard and data-loss sentinel', () => {
  it('user-guard: rejects snapshot when auth.currentUser is null (post-sign-out)', async () => {
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() => {
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true)
      expect(capturedSnapshotCallback).toBeDefined()
    })
    mutableAuth.currentUser = null
    await act(async () => {
      capturedSnapshotCallback!(new Map([['p1', makeFirestoreDoc()]]))
    })
    expect(useProjectStore.getState().projects).toHaveLength(0)
  })

  it('user-guard: rejects snapshot when a different user is signed in (user-switch race)', async () => {
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() => expect(capturedSnapshotCallback).toBeDefined())
    mutableAuth.currentUser = { uid: 'user-2' } as import('firebase/auth').User
    await act(async () => {
      capturedSnapshotCallback!(new Map([['p1', makeFirestoreDoc()]]))
    })
    expect(useProjectStore.getState().projects).toHaveLength(0)
  })

  it('sentinel: skips first snapshot when cloud is empty and local has projects', async () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'local-1' })], sprints: [] })
    vi.mocked(loadProjects).mockResolvedValue(new Map())
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() => expect(capturedSnapshotCallback).toBeDefined())
    await act(async () => { capturedSnapshotCallback!(new Map()) })
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })

  it('sentinel: second empty snapshot propagates (revocation reaches local store)', async () => {
    vi.mocked(loadProjects).mockResolvedValue(new Map())
    renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() => expect(capturedSnapshotCallback).toBeDefined())
    // First snapshot — non-empty, populates store and flips sentinel = true
    await act(async () => {
      capturedSnapshotCallback!(new Map([['p1', makeFirestoreDoc()]]))
    })
    await waitFor(() => expect(useProjectStore.getState().projects).toHaveLength(1))
    // Second snapshot — empty, propagates (access revocation reaches store)
    await act(async () => { capturedSnapshotCallback!(new Map()) })
    await waitFor(() => expect(useProjectStore.getState().projects).toHaveLength(0))
  })

  it('sentinel: resets on sign-out and re-sign-in (new effect closure)', async () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'local-1' })], sprints: [] })
    vi.mocked(loadProjects).mockResolvedValue(new Map())
    const { rerender } = renderHook(
      ({ user, mode }: { user: typeof mockUser | null; mode: 'cloud' | 'local' }) =>
        useCloudSync(user, mode),
      { initialProps: { user: mockUser, mode: 'cloud' as const } },
    )
    await waitFor(() => {
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true)
      expect(capturedSnapshotCallback).toBeDefined()
    })
    // First session: empty first snapshot → sentinel fires, local preserved
    await act(async () => { capturedSnapshotCallback!(new Map()) })
    expect(useProjectStore.getState().projects).toHaveLength(1)
    // Sign out — teardown discards the first closure (its sentinel goes with it)
    act(() => { rerender({ user: null, mode: 'local' }) })
    // Restore local state for second session
    useProjectStore.setState({
      projects: [makeProject({ id: 'local-1' })],
      sprints: [],
      cloudDataLoaded: false,
    })
    // Re-sign-in — new effect, new closure, snapshotEverReceived = false
    act(() => { rerender({ user: mockUser, mode: 'cloud' }) })
    await waitFor(() => {
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true)
      expect(capturedSnapshotCallback).toBeDefined()
    })
    // Second session: empty first snapshot → guard fires AGAIN (sentinel reset)
    await act(async () => { capturedSnapshotCallback!(new Map()) })
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })
})

// ── v0.35.1: new-project first-write path (Branches A/B/C + delete cases) ────
//
// The fix routes first-ever Firestore writes for newly-created projects through
// saveProjectImmediate (full setDoc, includes owner) instead of the debounced
// saveProject (mergeFields write that strips owner → fails the create rule).
// Tests drive the sync-bus handler DIRECTLY via capturedSyncBusHandler — the
// real syncBus is mocked at the top of this file, so calling addProject on the
// store would route through the mock and not reach the handler.
//
// Timer strategy: render the hook and wait for cloudDataLoaded under REAL
// timers (waitFor's internal polling uses setTimeout). Switch to fake timers
// AFTER hydration so the SAVE_DEBOUNCE_MS timer inside Branch A is mockable.
// vi.advanceTimersByTimeAsync interleaves timer drainage with microtask
// drainage, which is required because Branch A's promise chain mixes
// setTimeout with .then/.catch/.finally.
describe('useCloudSync — new-project create path (v0.35.1)', () => {
  function deferred() {
    let resolve!: () => void
    let reject!: (e: unknown) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  // Minimal Sprint stub. The Firestore converter filters by projectId and
  // passes through whatever Sprint[] we provide; field validation happens
  // server-side, not in the local conversion pipeline.
  function makeSprint(projectId: string, sprintNumber: number): Sprint {
    return {
      id: `s-${sprintNumber}`,
      projectId,
      sprintNumber,
      sprintStartDate: '2026-01-01',
      sprintFinishDate: '2026-01-12',
      doneValue: 0,
      includedInForecast: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  async function setupHook() {
    const handle = renderHook(() => useCloudSync(mockUser, 'cloud'))
    await waitFor(() => {
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true)
      expect(capturedSyncBusHandler).toBeDefined()
    })
    vi.useFakeTimers()
    return handle
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Test 1: burst coalescing — state grows between events, single write captures final state', async () => {
    const projectId = 'p1'
    useProjectStore.setState({
      projects: [makeProject({ id: projectId, name: 'Sample' })],
      sprints: [],
    })

    await setupHook()

    // Emit project:save, grow store, emit again — 9 emits total, accumulating
    // 0 → 8 sprints. If state were read at event time, the first write would
    // capture 0 sprints. Reading at fire time captures all 8.
    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    for (let i = 1; i <= 8; i++) {
      act(() => {
        useProjectStore.setState((s) => ({
          ...s,
          sprints: [...s.sprints, makeSprint(projectId, i)],
        }))
        capturedSyncBusHandler!({ type: 'project:save', projectId })
      })
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProject)).not.toHaveBeenCalled()
    const [, doc] = vi.mocked(saveProjectImmediate).mock.calls[0]
    expect(doc.sprints).toHaveLength(8)
  })

  it('Test 2: single new-project event produces one saveProjectImmediate (no saveProject)', async () => {
    const projectId = 'p1'
    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProject)).not.toHaveBeenCalled()
  })

  it('Test 3: create payload includes owner === current user uid', async () => {
    const projectId = 'p1'
    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    const [, doc] = vi.mocked(saveProjectImmediate).mock.calls[0]
    expect(doc.owner).toBe('user-1')
  })

  it('Test 4: after create success, next project:save routes through saveProject (update path)', async () => {
    const projectId = 'p1'
    const d = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(d.promise)

    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })
    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1)

    // Resolve create; Branch A's .then sets docMetaRef.
    await act(async () => {
      d.resolve()
      await vi.advanceTimersByTimeAsync(0) // drain microtasks
    })

    // Next save sees docMetaRef populated → Branch C → saveProject.
    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1) // unchanged
    expect(vi.mocked(saveProject)).toHaveBeenCalledTimes(1)
  })

  it('Test 5: after create failure, docMetaRef stays unset and next save retries via Branch A', async () => {
    const projectId = 'p1'
    const d = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValueOnce(d.promise)
    vi.mocked(saveProjectImmediate).mockResolvedValue(undefined) // retry succeeds

    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    // Fail the create.
    await act(async () => {
      d.reject(new Error('PERMISSION_DENIED'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)

    // Retry via Branch A.
    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(2) // retry hit
    expect(vi.mocked(saveProject)).not.toHaveBeenCalled() // never used update path
  })

  it('Test 6: delete BEFORE create timer fires — timer cancelled, no cloud calls', async () => {
    const projectId = 'p1'
    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    // Don't advance timers — timer still pending.
    act(() => {
      capturedSyncBusHandler!({ type: 'project:delete', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate)).not.toHaveBeenCalled()
    expect(vi.mocked(deleteProject)).not.toHaveBeenCalled()
  })

  it('Test 7: delete DURING in-flight create — chained, fires once after create confirms', async () => {
    const projectId = 'p1'
    const d = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(d.promise)

    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    // Create now in flight. Issue delete — should NOT call deleteProject yet.
    act(() => {
      capturedSyncBusHandler!({ type: 'project:delete', projectId })
    })
    expect(vi.mocked(deleteProject)).not.toHaveBeenCalled()

    // Resolve create — chained delete fires.
    await act(async () => {
      d.resolve()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(vi.mocked(deleteProject)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deleteProject)).toHaveBeenCalledWith(projectId)
  })

  it('Test 8: delete DURING in-flight create (create fails) — no delete issued', async () => {
    const projectId = 'p1'
    const d = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(d.promise)

    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    act(() => {
      capturedSyncBusHandler!({ type: 'project:delete', projectId })
    })

    await act(async () => {
      d.reject(new Error('PERMISSION_DENIED'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(vi.mocked(deleteProject)).not.toHaveBeenCalled()
  })

  it('Test 9: edit DURING in-flight create — chained update fires via Branch B', async () => {
    const projectId = 'p1'
    const d = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(d.promise)

    useProjectStore.setState({
      projects: [makeProject({ id: projectId, name: 'Original' })],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })
    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProject)).not.toHaveBeenCalled()

    // Edit during round-trip → Branch B.
    act(() => {
      useProjectStore.setState((s) => ({
        ...s,
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, name: 'Renamed' } : p,
        ),
      }))
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    expect(vi.mocked(saveProject)).not.toHaveBeenCalled() // still chained

    // Resolve create — chained update fires.
    await act(async () => {
      d.resolve()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1) // no second create
    expect(vi.mocked(saveProject)).toHaveBeenCalledTimes(1) // chained update fired
  })

  it('Test 10: project:import cancels pending create timers', async () => {
    useProjectStore.setState({
      projects: [
        makeProject({ id: 'p1' }),
        makeProject({ id: 'p2' }),
      ],
      sprints: [],
    })
    await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId: 'p1' })
      capturedSyncBusHandler!({ type: 'project:save', projectId: 'p2' })
    })
    // Don't advance — timers still pending.

    act(() => {
      capturedSyncBusHandler!({
        type: 'project:import',
        replacedIdMap: new Map(),
      })
    })

    // saveProjectImmediate IS called for each project in the import loop. But
    // the timers from before were cancelled — drain them and verify the count
    // hasn't grown (i.e. the timer-driven creates didn't fire).
    const importCallCount = vi.mocked(saveProjectImmediate).mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate).mock.calls.length).toBe(importCallCount)
  })

  it('Test 11: effect teardown cancels pending create timers', async () => {
    const projectId = 'p1'
    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    const handle = await setupHook()

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })
    // Timer pending. Unmount triggers cleanup.
    act(() => {
      handle.unmount()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    expect(vi.mocked(saveProjectImmediate)).not.toHaveBeenCalled()
  })

  it('Test 12: existing project (docMetaRef populated) routes to saveProject, not the create path', async () => {
    const projectId = 'p1'
    useProjectStore.setState({
      projects: [makeProject({ id: projectId })],
      sprints: [],
    })
    await setupHook()

    // Simulate the snapshot listener having previously populated docMetaRef
    // for this project (i.e. it already exists in Firestore). The capturedSnapshotCallback
    // is the public way to set docMetaRef; firing it routes through processProjectDocs.
    act(() => {
      capturedSnapshotCallback!(
        new Map([[projectId, makeFirestoreDoc({ name: 'Existing' })]]),
      )
    })

    act(() => {
      capturedSyncBusHandler!({ type: 'project:save', projectId })
    })

    expect(vi.mocked(saveProject)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProjectImmediate)).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })

    // Still no create-path activity after timer drainage — proves no Branch-A timer
    // was scheduled (observable proxy for "no pendingCreateTimers entry exists").
    expect(vi.mocked(saveProjectImmediate)).not.toHaveBeenCalled()
  })
})
