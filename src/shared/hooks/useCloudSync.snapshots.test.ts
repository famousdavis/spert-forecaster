// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40: how useCloudSync applies snapshots, and the first-load gate (R2).
// The driver is mocked; each test drives the captured snapshot callback and
// sync-bus handler directly, with the shapes the real SDK produces.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { currentSimulationGeneration } from '@/shared/lib/simulation-generation'
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
  cancelPendingProjectSaves: vi.fn(),
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
  cancelPendingSaves,
  cancelPendingProjectSaves,
} from '@/shared/firebase/firestore-driver'
import { syncBus } from '@/shared/firebase/sync-bus'
import { toast } from 'sonner'
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
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['p'], deletedIds: [] }) })
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

describe('Brief 39 — the role reaches the store; an import writes only its own footprint', () => {
  const sharedDoc = (id: string, role: 'editor' | 'viewer'): FirestoreProjectDoc => ({ ...cloudDoc(id), owner: 'other', members: { 'user-1': role } })
  const roles = () => useProjectStore.getState().projectRoles
  beforeEach(() => { useProjectStore.setState({ projectRoles: {} }) })

  it('B39-U1 the first load derives each role: owner wins, editor, viewer', async () => {
    await mounted(docs(['o', cloudDoc('o')], ['e', sharedDoc('e', 'editor')], ['v', sharedDoc('v', 'viewer')]))
    expect(roles()).toEqual({ o: 'owner', e: 'editor', v: 'viewer' })
  })

  it('B39-U2 a raise that changes only `members` delivers the new role (known-bad: roles written only when the merge changed the store)', async () => {
    await mounted(docs(['s', sharedDoc('s', 'editor')]))
    act(() => { snapshot!(docs(['s', sharedDoc('s', 'viewer')])) })
    expect([storeWrites, roles()]).toEqual([0, { s: 'viewer' }])
  })

  it('B39-U3 a project newly shared with the user arrives with its role in the same store write (known-bad: roles in a second set())', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    const seen: (string | undefined)[] = []
    const off = useProjectStore.subscribe((s) => { if (seen.length === 0 && s.projects.some((p) => p.id === 'n')) seen.push(s.projectRoles.n) })
    act(() => { snapshot!(docs(['a', cloudDoc('a')], ['n', sharedDoc('n', 'viewer')])) })
    off()
    expect(seen).toEqual(['viewer'])
  })

  it('B39-U4 teardown clears the roles (known-bad: a stale map outlives the session)', async () => {
    const handle = await mounted(docs(['v', sharedDoc('v', 'viewer')]))
    handle.unmount()
    expect(roles()).toEqual({})
  })

  it('B39-U5 an import saves exactly its savedIds and deletes nothing else (known-bads: Brief 40\'s save-all; the delete loop over docMetaRef)', async () => {
    await mounted(docs(['a', cloudDoc('a')], ['gone', cloudDoc('gone')]))
    act(() => { snapshot!(docs(['a', cloudDoc('a')])) }) // 'gone' unshared or deleted elsewhere: it leaves the store, not docMetaRef
    act(() => { useProjectStore.setState({ projects: [...useProjectStore.getState().projects, project('imp')] }) })
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['imp'], deletedIds: [] }) })
    expect([vi.mocked(saveProjectImmediate).mock.calls.map(([id]) => id), vi.mocked(deleteProject).mock.calls.length]).toEqual([['imp'], 0])
  })

  it('B39-U6 an import cancels only the writes it supersedes (known-bad: cancelPendingSaves for every project)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['imp'], deletedIds: ['old'] }) })
    expect([vi.mocked(cancelPendingSaves).mock.calls.length, vi.mocked(cancelPendingProjectSaves).mock.calls]).toEqual([0, [[['imp', 'old']]]])
  })

  it('B39-U7 an owner\'s name-conflict replace: the winner keeps the sharing, the original is deleted once', async () => {
    await mounted(docs(['old', cloudDoc('old', 'old', 1, { 'user-2': 'editor' })]))
    act(() => { useProjectStore.setState({ projects: [project('win', 'old')] }) })
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map([['old', 'win']]), savedIds: ['win'], deletedIds: ['old'] }) })
    const win = vi.mocked(saveProjectImmediate).mock.calls.find(([id]) => id === 'win')
    expect([win?.[1].members, vi.mocked(deleteProject).mock.calls.map(([id]) => id)]).toEqual([{ 'user-2': 'editor' }, ['old']])
  })

  it('B39-U8 a refused import CREATE says it was refused and will leave the list; any other failure keeps its text (known-bads: always the connection text; the update text for a create)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    act(() => { useProjectStore.setState({ projects: [project('a'), project('x', 'X'), project('y', 'Y')] }) })
    vi.mocked(saveProjectImmediate)
      .mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'permission-denied' }))
      .mockRejectedValueOnce(Object.assign(new Error('big'), { code: 'invalid-argument' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['x', 'y'], deletedIds: [] }) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(vi.mocked(toast.error).mock.calls.map(([t]) => t)).toEqual([
      '"X" wasn\'t saved — the cloud refused it, so it will leave your list.',
      'Failed to save imported project "Y" to the cloud.',
    ])
  })
})

describe('Brief 39 v3 — V1, the account change, E2, F4, W3, W4', () => {
  const sharedDoc = (id: string, role: 'editor' | 'viewer'): FirestoreProjectDoc => ({ ...cloudDoc(id), owner: 'other', members: { 'user-1': role } })
  const roles = () => useProjectStore.getState().projectRoles
  const toasts = () => vi.mocked(toast.error).mock.calls.map(([t]) => t)
  const refused = () => Object.assign(new Error('no'), { code: 'permission-denied' })
  beforeEach(() => {
    useProjectStore.setState({ projectRoles: {}, cloudAccountId: '' })
    useStorageModeStore.setState({ mode: 'cloud' })
  })
  afterEach(() => {
    useStorageModeStore.setState({ mode: 'local' })
    useSettingsStore.setState({ exportName: '', exportId: '' })
  })

  it('V1-U1 a zero-project load marks every held project not-in-cloud, except one created here during the load (known-bads: the guard writes {}; held-new caught)', async () => {
    useProjectStore.setState({ projects: [project('v'), project('new')], sprints: [] })
    const load = deferred<Map<string, FirestoreProjectDoc>>()
    vi.mocked(loadProjects).mockReturnValue(load.promise)
    renderHook(() => useCloudSync(user, 'cloud'))
    await waitFor(() => expect(bus).toBeDefined())
    act(() => { bus!({ type: 'project:save', projectId: 'new' }) })
    await act(async () => { load.resolve(new Map()); await Promise.resolve() })
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    expect([order(), roles()]).toEqual(['v,new', { v: 'not-in-cloud' }])
  })

  it('V1-U2 the first snapshot\'s zero-project guard marks held projects not-in-cloud, except one being created (known-bad: no entry → owner)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    act(() => { useProjectStore.getState().addProject({ name: 'brand new', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'brand new')!.id
    act(() => { bus!({ type: 'project:save', projectId: created }) }) // the bus is mocked: deliver the store's emit
    act(() => { snapshot!(new Map()) })
    expect([order().split(',').length, roles()]).toEqual([2, { a: 'not-in-cloud' }])
    expect(roles()[created]).toBeUndefined()
  })

  it('V1-U3 a successful load records the account; a different account\'s mount clears the stored projects first (known-bads: no tag; no clear)', async () => {
    useProjectStore.setState({ projects: [project('a-proj')], sprints: [sprint('a-proj', 1)], cloudAccountId: 'user-0', _changeLog: [{ t: 1, op: 'add', entity: 'project' }] })
    const load = deferred<Map<string, FirestoreProjectDoc>>()
    vi.mocked(loadProjects).mockReturnValue(load.promise)
    renderHook(() => useCloudSync(user, 'cloud'))
    const cleared = [order(), useProjectStore.getState().sprints.length, useProjectStore.getState()._changeLog.length]
    expect(vi.mocked(syncBus.emit)).toHaveBeenCalledWith({ type: 'ai:session-teardown', reason: 'signout' })
    await act(async () => { load.resolve(docs(['b', cloudDoc('b')])); await Promise.resolve() })
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true))
    expect([cleared, order(), useProjectStore.getState().cloudAccountId]).toEqual([['', 0, 0], 'b', 'user-1'])
  })

  it.each([
    ['user-1', 'kept'], // the same account
    ['', 'kept'], // no tag: local data, or a copy from before the tag existed
  ] as const)('V1-U4 a mount with account tag %j keeps the stored projects, Export Attribution and running simulations (%s)', async (tag, _kept) => {
    useProjectStore.setState({ projects: [project('p')], sprints: [], cloudAccountId: tag })
    useSettingsStore.setState({ exportName: 'Alice Example', exportId: 'A-12345' })
    const generation = currentSimulationGeneration()
    renderHook(() => useCloudSync(user, 'cloud'))
    const s = useSettingsStore.getState()
    expect([order(), s.exportName, s.exportId, currentSimulationGeneration() - generation]).toEqual(['p', 'Alice Example', 'A-12345', 0])
  })

  it('V1-U7 an account change also clears Export Attribution and discards running simulations, as a sign-out does (known-bads K-ACCT-ATTR, K-ACCT-GEN)', async () => {
    useProjectStore.setState({ projects: [project('a-proj')], sprints: [], cloudAccountId: 'user-0' })
    useSettingsStore.setState({ exportName: 'Alice Example', exportId: 'A-12345' })
    const generation = currentSimulationGeneration()
    renderHook(() => useCloudSync(user, 'cloud'))
    const s = useSettingsStore.getState()
    expect([s.exportName, s.exportId, currentSimulationGeneration() - generation]).toEqual(['', '', 1])
  })

  it('V1-U5 an edit never creates a not-in-cloud project: nothing is sent and the user is told once (known-bad K-NIC-CREATE); a project added after that load IS created (control)', async () => {
    useProjectStore.setState({ projects: [project('held')], sprints: [] })
    await mounted(new Map()) // the cloud holds nothing for this account: the guard keeps 'held'
    expect(roles()).toEqual({ held: 'not-in-cloud' })
    act(() => { bus!({ type: 'project:save', projectId: 'held' }) }) // an edit's event (the bus is mocked)
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect([vi.mocked(saveProjectImmediate).mock.calls.length, toasts()]).toEqual([0, ["Your change wasn't saved — this project isn't in your cloud account."]])
    act(() => { useProjectStore.getState().addProject({ name: 'after', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'after')!.id
    act(() => { bus!({ type: 'project:save', projectId: created }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect(vi.mocked(saveProjectImmediate).mock.calls.map(([id, d]) => [id, d.owner])).toEqual([[created, 'user-1']])
  })

  it('V1-U6 a tab close inside the debounce never creates a not-in-cloud project either: the flush skips it, silently (known-bad K-NIC-FLUSH); a project added after that load IS flushed (control)', async () => {
    useProjectStore.setState({ projects: [project('held')], sprints: [] })
    await mounted(new Map())
    act(() => { useProjectStore.getState().addProject({ name: 'after', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'after')!.id
    act(() => {
      bus!({ type: 'project:save', projectId: 'held' })
      bus!({ type: 'project:save', projectId: created })
    })
    act(() => { window.dispatchEvent(new Event('beforeunload')) })
    const atUnload = vi.mocked(saveProjectImmediate).mock.calls.map(([id]) => id)
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect([atUnload, vi.mocked(saveProjectImmediate).mock.calls.map(([id]) => id), toasts()]).toEqual([[created], [created], []])
  })

  it('E2-U1 an owner\'s name-conflict winner is protected while its save is in flight: a raise built before the import keeps it in place (known-bad: "new" decided by docMetaRef after the pre-seed)', async () => {
    await mounted(docs(['o', cloudDoc('o')], ['x', cloudDoc('x')]))
    const save = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(save.promise)
    act(() => {
      useProjectStore.setState({ projects: [project('w', 'o'), project('x')] })
      bus!({ type: 'project:import', replacedIdMap: new Map([['o', 'w']]), savedIds: ['w'], deletedIds: ['o'] })
    })
    act(() => { snapshot!(docs(['x', cloudDoc('x')])) }) // built before the import reached the SDK
    expect(order()).toBe('w,x')
    expect(vi.mocked(saveProjectImmediate).mock.calls[0][1].owner).toBe('user-1')
  })

  it('E2-U2 a project an import ADDS is protected while its save is in flight: a raise built before the import keeps it (known-bad: importCreatesInFlight not consulted)', async () => {
    await mounted(docs(['x', cloudDoc('x')]))
    const save = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(save.promise)
    act(() => {
      useProjectStore.setState({ projects: [project('x'), project('n')] })
      bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['n'], deletedIds: [] })
    })
    act(() => { snapshot!(docs(['x', cloudDoc('x')])) })
    expect(order()).toBe('x,n')
  })

  it('K01-U1 a project in the view that an import REWRITES keeps the imported version against a raise built before the import (known-bad: import saves not in isProtected)', async () => {
    await mounted(docs(['p', cloudDoc('p', 'old')]))
    const save = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValue(save.promise)
    act(() => {
      useProjectStore.setState({ projects: [project('p', 'imported')] })
      bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['p'], deletedIds: [] })
    })
    act(() => { snapshot!(docs(['p', cloudDoc('p', 'old')])) })
    expect(nameOf('p')).toBe('imported')
  })

  it('F4-U1 re-importing a project whose document left the view creates it fresh: no stale owner or members (known-bad: owner/members from any docMetaRef entry)', async () => {
    await mounted(docs(['a', cloudDoc('a')], ['gone', { ...cloudDoc('gone'), members: { alice: 'editor' } }]))
    act(() => { snapshot!(docs(['a', cloudDoc('a')])) }) // 'gone' deleted elsewhere: it leaves the view
    act(() => {
      useProjectStore.setState({ projects: [project('a'), project('gone')] })
      bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['gone'], deletedIds: [] })
    })
    const [, written] = vi.mocked(saveProjectImmediate).mock.calls[0]
    expect([written.owner, written.members]).toEqual(['user-1', {}])
  })

  it('W4-U1 an import never deletes an id no view contains: never written, or held not-in-cloud (known-bad: a delete for every deleted id)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    act(() => { useProjectStore.getState().addProject({ name: 'unwritten', unitOfMeasure: 'pts' }) }) // create timer pending
    const unwritten = useProjectStore.getState().projects.find((p) => p.name === 'unwritten')!.id
    act(() => {
      useProjectStore.setState({ projects: [project('ra')] })
      bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['ra'], deletedIds: ['a', unwritten, 'held'] })
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect(vi.mocked(deleteProject).mock.calls.map(([id]) => id)).toEqual(['a'])
    expect(vi.mocked(saveProjectImmediate).mock.calls.map(([id]) => id)).toEqual(['ra'])
  })

  it('W4-U2 an id held not-in-cloud is never deleted, even with a docMetaRef entry from the baseline (known-bad: the delete check reads docMetaRef)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    act(() => { snapshot!(new Map()) }) // the first snapshot finds nothing: a is held, not-in-cloud; docMetaRef still has it
    expect(roles()).toEqual({ a: 'not-in-cloud' })
    act(() => {
      useProjectStore.setState({ projects: [project('ra')] })
      bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['ra'], deletedIds: ['a'] })
    })
    await act(async () => { await Promise.resolve() })
    expect(vi.mocked(deleteProject)).not.toHaveBeenCalled()
  })

  it('W3-U6 a refused update chained behind a create (Branch B) gets the owner save text (known-bad: no onError for Branch B)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    const create = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValueOnce(create.promise)
    act(() => { useProjectStore.getState().addProject({ name: 'n', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'n')!.id
    act(() => { bus!({ type: 'project:save', projectId: created }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) }) // the create is in flight
    act(() => { bus!({ type: 'project:save', projectId: created }) }) // Branch B: chained behind the create
    await act(async () => { create.resolve(); await new Promise((r) => setTimeout(r, 0)) })
    const onError = vi.mocked(saveProject).mock.calls[0]?.[2]
    onError?.(refused())
    expect(toasts()).toEqual(["Your change wasn't saved — the cloud refused it. If this project was deleted on another device, it will leave your list."])
  })

  it.each([
    ['owner', "Your change wasn't saved — the cloud refused it. If this project was deleted on another device, it will leave your list."],
    ['editor', "Your change wasn't saved — the cloud refused it. Your access to this project may have changed."],
    ['viewer', "Your change wasn't saved — you can only view this project."],
  ] as const)('W3-U1 a refused debounced save, %s, gets its text — never "permission" for an owner (known-bad: the driver\'s generic text)', async (role, text) => {
    await mounted(docs(['p', role === 'owner' ? cloudDoc('p') : sharedDoc('p', role)]))
    act(() => { bus!({ type: 'project:save', projectId: 'p' }) })
    const onError = vi.mocked(saveProject).mock.calls[0][2]!
    onError(refused())
    onError(Object.assign(new Error('big'), { code: 'invalid-argument' }))
    expect(toasts()).toEqual([text, 'Failed to save changes to the cloud. Please check your connection.'])
  })

  it('W3-U2 a refused create (Branch A) says the new project will leave the list (known-bad: the save text)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    vi.mocked(saveProjectImmediate).mockRejectedValueOnce(refused())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { useProjectStore.getState().addProject({ name: 'n', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'n')!.id
    act(() => { bus!({ type: 'project:save', projectId: created }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect(toasts()).toEqual(["Your new project wasn't saved — the cloud refused it, so it will leave your list."])
  })

  it.each([
    ['owner', 'The cloud refused to delete this project. If it was already deleted on another device, there is nothing more to do.'],
    ['viewer', "The project wasn't deleted — only its owner can delete it."],
  ] as const)('W3-U3 a refused delete (Case 3), %s, gets its text (known-bad: the old text)', async (role, text) => {
    await mounted(docs(['p', role === 'owner' ? cloudDoc('p') : sharedDoc('p', role)]))
    vi.mocked(deleteProject).mockRejectedValueOnce(refused())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { bus!({ type: 'project:delete', projectId: 'p' }) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(toasts()).toEqual([text])
  })

  it('W3-U4 a refused delete chained behind a create (Case 2) gets the owner text (known-bad: the old text)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    const create = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValueOnce(create.promise)
    vi.mocked(deleteProject).mockRejectedValueOnce(refused())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { useProjectStore.getState().addProject({ name: 'n', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'n')!.id
    act(() => { bus!({ type: 'project:save', projectId: created }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) }) // the create is in flight
    act(() => { bus!({ type: 'project:delete', projectId: created }) })
    await act(async () => { create.resolve(); await new Promise((r) => setTimeout(r, 0)) })
    expect(toasts()).toEqual(['The cloud refused to delete this project. If it was already deleted on another device, there is nothing more to do.'])
  })

  it('W3-U5 a refused import save of a project in the view keeps the cloud version, and says so (known-bad: the create text)', async () => {
    await mounted(docs(['p', cloudDoc('p', 'P')]))
    vi.mocked(saveProjectImmediate).mockRejectedValueOnce(refused())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => { bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: ['p'], deletedIds: [] }) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(toasts()).toEqual(['"P" wasn\'t saved — the cloud refused it, so your list keeps the version in the cloud.'])
  })

  it('W4-U3 an import that removes a project whose create is in flight deletes it once the create settles (known-bad X8: in-flight creates not deleted)', async () => {
    await mounted(docs(['a', cloudDoc('a')]))
    const create = deferred()
    vi.mocked(saveProjectImmediate).mockReturnValueOnce(create.promise)
    act(() => { useProjectStore.getState().addProject({ name: 'n', unitOfMeasure: 'pts' }) })
    const created = useProjectStore.getState().projects.find((p) => p.name === 'n')!.id
    act(() => { bus!({ type: 'project:save', projectId: created }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) }) // the create is in flight; no view holds it
    act(() => {
      useProjectStore.setState({ projects: [project('a')] })
      bus!({ type: 'project:import', replacedIdMap: new Map(), savedIds: [], deletedIds: [created] })
    })
    const beforeSettle = vi.mocked(deleteProject).mock.calls.length
    await act(async () => { create.resolve(); await new Promise((r) => setTimeout(r, 0)) })
    expect([beforeSettle, vi.mocked(deleteProject).mock.calls.map(([id]) => id)]).toEqual([0, [created]])
  })

  it('W3-U7 a save issued as an editor and refused after a demotion to viewer gets the editor text: the access is read when the write is issued (known-bad X5: read when it settles)', async () => {
    await mounted(docs(['p', sharedDoc('p', 'editor')]))
    act(() => { bus!({ type: 'project:save', projectId: 'p' }) }) // issued as an editor (Branch C)
    act(() => { snapshot!(docs(['p', sharedDoc('p', 'viewer')])) }) // demoted before the refusal settles
    expect(roles()).toEqual({ p: 'viewer' })
    vi.mocked(saveProject).mock.calls[0][2]!(refused())
    expect(toasts()).toEqual(["Your change wasn't saved — the cloud refused it. Your access to this project may have changed."])
  })
})
