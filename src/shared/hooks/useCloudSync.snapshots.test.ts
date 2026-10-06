// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40: how useCloudSync applies snapshots, and the first-load gate (R2).
// The driver is mocked; each test drives the captured snapshot callback and
// sync-bus handler directly, with the shapes the real SDK produces.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import type { FirestoreProjectDoc, SyncEvent } from '@/shared/firebase/types'
import type { Project, Sprint } from '@/shared/types'

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
  isProjectSaveOutstanding: vi.fn(),
  SAVE_DEBOUNCE_MS: 200,
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { subscribe: vi.fn(), emit: vi.fn() } }))
vi.mock('@/shared/firebase/config', () => ({ auth: mutableAuth }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import {
  loadProjects,
  saveProject,
  saveProjectImmediate,
  deleteProject,
  subscribeToUserProjects,
  loadSettings,
  isProjectSaveOutstanding,
} from '@/shared/firebase/firestore-driver'
import { syncBus } from '@/shared/firebase/sync-bus'
import { useCloudSync } from './useCloudSync'

const TS = '2026-01-01T00:00:00.000Z'
const user = { uid: 'user-1' } as import('firebase/auth').User

const sprint = (projectId: string, n: number): Sprint => ({
  id: `${projectId}-s${n}`, projectId, sprintNumber: n, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
  doneValue: 10, includedInForecast: true, createdAt: TS, updatedAt: TS,
})
const project = (id: string, name = id): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS })
function cloudDoc(id: string, name = id, sprints = 1, members: Record<string, 'editor' | 'viewer'> = {}): FirestoreProjectDoc {
  return {
    name, unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS, milestones: [], productivityAdjustments: [],
    sprints: Array.from({ length: sprints }, (_, i) => sprint(id, i + 1)), owner: 'user-1', members, schemaVersion: 1,
  }
}
const docs = (...entries: [string, FirestoreProjectDoc][]) => new Map(entries)
const order = () => useProjectStore.getState().projects.map((p) => p.id).join(',')
const nameOf = (id: string) => useProjectStore.getState().projects.find((p) => p.id === id)?.name
const sprintCount = (id: string) => useProjectStore.getState().sprints.filter((s) => s.projectId === id).length

let snapshot: ((d: Map<string, FirestoreProjectDoc>) => void) | undefined
let bus: ((event: SyncEvent) => void) | undefined
let storeWrites = 0
let unsubStore: (() => void) | undefined

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  snapshot = undefined
  bus = undefined
  vi.resetAllMocks()
  mutableAuth.currentUser = user
  useProjectStore.setState({
    projects: [], sprints: [], cloudDataLoaded: false, cloudLoadRetrying: false, cloudLoadError: null, viewingProjectId: null,
  })
  vi.mocked(loadProjects).mockResolvedValue(new Map())
  vi.mocked(loadSettings).mockResolvedValue(null)
  vi.mocked(saveProjectImmediate).mockResolvedValue(undefined)
  vi.mocked(deleteProject).mockResolvedValue(undefined)
  vi.mocked(isProjectSaveOutstanding).mockReturnValue(false)
  vi.mocked(subscribeToUserProjects).mockImplementation((_uid, cb) => { snapshot = cb; return () => {} })
  vi.mocked(syncBus.subscribe).mockImplementation((handler) => { bus = handler as (e: SyncEvent) => void; return () => {} })
  storeWrites = 0
  unsubStore = useProjectStore.subscribe((s, prev) => { if (s._isCloudUpdate && !prev._isCloudUpdate) storeWrites++ })
})
afterEach(() => {
  unsubStore?.()
})

/** Mount with the cloud already holding `cloud`, wait for the first load and the subscription. */
async function mounted(cloud: Map<string, FirestoreProjectDoc>) {
  vi.mocked(loadProjects).mockResolvedValue(cloud)
  const handle = renderHook(() => useCloudSync(user, 'cloud'))
  await waitFor(() => {
    expect(useProjectStore.getState().cloudDataLoaded).toBe(true)
    expect(snapshot).toBeDefined()
  })
  storeWrites = 0
  return handle
}

describe('snapshots are merged, not replaced (Brief 40)', () => {
  it('U-H1 a project with an outstanding save keeps the store version AT ITS INDEX; the rest take the snapshot (known-bads: no protection, append-last)', async () => {
    await mounted(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')], ['c', cloudDoc('c')]))
    expect(order()).toBe('a,b,c')
    act(() => {
      useProjectStore.getState().addSprint({
        projectId: 'b', sprintNumber: 2, sprintStartDate: '2026-01-19', sprintFinishDate: '2026-01-30', doneValue: 12, includedInForecast: true,
      })
    })
    vi.mocked(isProjectSaveOutstanding).mockImplementation((id) => id === 'b')
    // A collaborator's change to `a` arrives while b's save waits in its debounce timer.
    act(() => { snapshot!(docs(['a', cloudDoc('a', 'A by collaborator')], ['b', cloudDoc('b')], ['c', cloudDoc('c')])) })
    expect(order()).toBe('a,b,c')
    expect(nameOf('a')).toBe('A by collaborator')
    expect(sprintCount('b')).toBe(2)
  })

  it('U-H2 an own write\'s echo equal to the store writes nothing to the store (known-bad: always rebuild)', async () => {
    await mounted(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')]))
    act(() => { snapshot!(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')])) })
    expect(storeWrites).toBe(0)
  })

  it('U-H3 a mutator called by a synchronous store subscriber during a cloud merge emits nothing (known-bad: _isCloudUpdate not set)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    let fired = 0
    // Fires on the remote change itself, NOT on _isCloudUpdate: a trigger keyed on the flag could not fire when the
    // flag is missing — the very known-bad this test exists to catch.
    const off = useProjectStore.subscribe((s, prev) => {
      const now = s.projects.find((p) => p.id === 'a')?.name
      const before = prev.projects.find((p) => p.id === 'a')?.name
      if (now === 'renamed remotely' && before !== 'renamed remotely') {
        fired++
        useProjectStore.getState().updateProject('a', { unitOfMeasure: 'hours' })
      }
    })
    vi.mocked(syncBus.emit).mockClear()
    act(() => { snapshot!(docs(['a', cloudDoc('a', 'renamed remotely')])) })
    off()
    expect(nameOf('a')).toBe('renamed remotely')
    expect(fired).toBe(1)
    expect(vi.mocked(syncBus.emit).mock.calls.filter(([e]) => e.type.startsWith('project:'))).toEqual([])
  })

  it('U-H4 a project deleted here is not appended back by a snapshot taken before the delete landed (known-bad: no tombstone)', async () => {
    await mounted(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')]))
    const del = deferred()
    vi.mocked(deleteProject).mockReturnValueOnce(del.promise)
    act(() => { useProjectStore.getState().deleteProject('b') })
    act(() => { bus!({ type: 'project:delete', projectId: 'b' }) })
    act(() => { snapshot!(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')])) })
    expect(order()).toBe('a')
    // Once the delete settles, the cloud view is believed again: a refused
    // delete's rollback brings the project back, honestly.
    await act(async () => { del.resolve(); await Promise.resolve(); await Promise.resolve() })
    act(() => { snapshot!(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')])) })
    expect(order()).toBe('a,b')
  })

  it('B5 a raise that changes only `members` reaches the import\'s save (known-bad: refresh docMetaRef only when the merge changed the store)', async () => {
    await mounted(docs(['p', cloudDoc('p')]))
    // The owner shares p (an updateDoc on members.x): its raise equals the store,
    // because the store holds no members.
    act(() => { snapshot!(docs(['p', cloudDoc('p', 'p', 1, { 'user-2': 'editor' })])) })
    expect(storeWrites).toBe(0)
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map() }) })
    const writes = vi.mocked(saveProjectImmediate).mock.calls.filter(([id]) => id === 'p')
    expect(writes).toHaveLength(1)
    expect(writes[0][1].members).toEqual({ 'user-2': 'editor' })
  })
})

describe('the first load is the baseline (Brief 40, R2)', () => {
  it('U-H5 a save made before the first load never reaches the cloud, and the cloud version wins (known-bad: no hold — a create that resets members)', async () => {
    useProjectStore.setState({ projects: [project('p', 'stale local copy')], sprints: [sprint('p', 1)] })
    const load = deferred<Map<string, FirestoreProjectDoc>>()
    vi.mocked(loadProjects).mockReturnValue(load.promise)
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(bus).toBeDefined())
    act(() => { bus!({ type: 'project:save', projectId: 'p' }) })
    await act(async () => { load.resolve(docs(['p', cloudDoc('p', 'cloud', 2, { 'user-2': 'editor' })])); await Promise.resolve() })
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    await act(async () => { await new Promise((r) => setTimeout(r, 400)) })
    expect(vi.mocked(saveProjectImmediate)).not.toHaveBeenCalled()
    expect(vi.mocked(saveProject)).not.toHaveBeenCalled()
    expect(nameOf('p')).toBe('cloud')
    expect(sprintCount('p')).toBe(2)
  })

  it('U-H6 a project created before the first load, and unknown to the cloud, is kept in place and created after it (known-bad: held creates never replayed)', async () => {
    useProjectStore.setState({ projects: [project('p'), project('new')], sprints: [] })
    const load = deferred<Map<string, FirestoreProjectDoc>>()
    vi.mocked(loadProjects).mockReturnValue(load.promise)
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(bus).toBeDefined())
    act(() => { bus!({ type: 'project:save', projectId: 'new' }) })
    await act(async () => { load.resolve(docs(['p', cloudDoc('p')])); await Promise.resolve() })
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    expect(order()).toBe('p,new')
    await act(async () => { await new Promise((r) => setTimeout(r, 400)) })
    expect(vi.mocked(saveProjectImmediate)).toHaveBeenCalledTimes(1)
    const [id, written] = vi.mocked(saveProjectImmediate).mock.calls[0]
    expect([id, written.owner]).toEqual(['new', 'user-1'])
  })

  it('U-H8 the first load keeps this device\'s project order (known-bad: replace in cloud order)', async () => {
    useProjectStore.setState({ projects: [project('b'), project('a')], sprints: [] })
    await mounted(docs(['a', cloudDoc('a')], ['b', cloudDoc('b')]))
    expect(order()).toBe('b,a')
  })
})
