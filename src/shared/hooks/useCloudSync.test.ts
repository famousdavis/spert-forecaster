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
  saveProjectImmediate,
  deleteProject,
  subscribeToUserProjects,
  loadSettings,
} from '@/shared/firebase/firestore-driver'
import { syncBus } from '@/shared/firebase/sync-bus'
import { useCloudSync } from './useCloudSync'

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
