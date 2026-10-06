// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40. No fake Firestore: each test scripts the exact raises the real SDK
// (firebase 12.12.1) produces, as measured against the emulator —
//   - an own write raises ONE snapshot, hasPendingWrites: true; the
//     acknowledgement raises nothing (includeMetadataChanges is off);
//   - a listener's FIRST raise can itself be pending, or served from cache;
//   - a refused write settles its promise before the rollback raise;
//   - each listener's raise is its own setTimeout(0), editor before viewer, so
//     a role change arrives as two raises (B1).
// A fake that cannot produce a pending first raise let the deadlock it was
// meant to catch pass (Brief 40 review, 1-2 F-4 / 1-3 F-4).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const H = vi.hoisted(() => ({
  next: [] as ((snapshot: unknown) => void)[],
  unsubscribed: 0,
  setDoc: vi.fn(),
}))

vi.mock('./config', () => ({ db: { __db: true }, auth: null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getDocsFromServer: vi.fn(),
  setDoc: (...args: unknown[]) => H.setDoc(...args),
  deleteDoc: vi.fn(),
  deleteField: () => ({ __deleteField: true }),
  onSnapshot: (_query: unknown, next: (snapshot: unknown) => void) => {
    H.next.push(next)
    return () => { H.unsubscribed++ }
  },
  query: vi.fn(),
  where: vi.fn(),
}))

import { getDocs, getDocsFromServer } from 'firebase/firestore'
import {
  subscribeToUserProjects,
  saveProject,
  flushPendingSaves,
  isProjectSaveOutstanding,
  loadProjects,
  SAVE_DEBOUNCE_MS,
} from './firestore-driver'
import type { FirestoreProjectDoc } from './types'

// onSnapshot is called owned, editor, viewer — in that order — per subscription.
const OWNED = 0
const EDITOR = 1
const VIEWER = 2
const projectDoc = (name: string) => ({ name, unitOfMeasure: 'pts', sprints: [], createdAt: 'x', owner: 'u', members: {}, schemaVersion: 1 }) as FirestoreProjectDoc

function raise(query: number, docs: [string, string][], meta: { pending?: boolean; base?: number } = {}) {
  H.next[(meta.base ?? 0) + query]({
    docs: docs.map(([id, name]) => ({ id, data: () => projectDoc(name) })),
    metadata: { hasPendingWrites: meta.pending ?? false, fromCache: false },
  })
}

function listen(onCall?: () => void) {
  const calls: { names: string[] }[] = []
  const unsubscribe = subscribeToUserProjects('u', (projects) => {
    calls.push({ names: [...projects.values()].map((d) => d.name) })
    onCall?.()
  })
  return { calls, unsubscribe }
}

/** Let the per-burst notify (a setTimeout(0)) run. */
const flush = () => vi.advanceTimersByTime(0)

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('subscribeToUserProjects — never drops a raise (Brief 40)', () => {
  beforeEach(() => { vi.useFakeTimers(); H.next = []; H.unsubscribed = 0 })
  afterEach(() => { vi.useRealTimers() })

  it('U-D1 applies a PENDING raise: the own write\'s only raise reaches the caller (known-bad: drop pending)', () => {
    const { calls } = listen()
    raise(OWNED, [['x', 'before']]); raise(EDITOR, []); raise(VIEWER, []); flush()
    raise(OWNED, [['x', 'after']], { pending: true }); flush()
    expect(calls.map((c) => c.names)).toEqual([['before'], ['after']])
  })

  it('U-D2 a pending FIRST raise counts toward readiness (known-bad: readiness only on non-pending — the G1 deadlock)', () => {
    const { calls } = listen()
    raise(OWNED, [['x', 'pending at subscribe']], { pending: true })
    raise(EDITOR, [])
    raise(VIEWER, [])
    flush()
    expect(calls).toHaveLength(1)
    expect(calls[0].names).toEqual(['pending at subscribe'])
  })

  it('U-D3 stays silent until all three queries have raised; then viewer, editor, owned (known-bad: notify before ready)', () => {
    const { calls } = listen()
    raise(OWNED, [['x', 'x']]); flush()
    raise(VIEWER, [['v', 'v']]); flush()
    expect(calls).toHaveLength(0)
    raise(EDITOR, [['e', 'e']]); flush()
    expect(calls).toHaveLength(1)
    // Lower-priority first: viewer, then editor, then owned.
    expect(calls[0].names).toEqual(['v', 'e', 'x'])
  })
})

describe('subscribeToUserProjects — one notify per burst (Brief 40, B1)', () => {
  beforeEach(() => { vi.useFakeTimers(); H.next = []; H.unsubscribed = 0 })
  afterEach(() => { vi.useRealTimers() })

  /** Subscribe with `s` shared as `from`, and settle the first view. */
  function sharedAs(from: 'editor' | 'viewer') {
    const l = listen()
    raise(OWNED, [])
    raise(EDITOR, from === 'editor' ? [['s', 's'], ['t', 't']] : [['t', 't']])
    raise(VIEWER, from === 'viewer' ? [['s', 's']] : [])
    flush()
    return l
  }
  const lacksS = (calls: { names: string[] }[]) => calls.filter((c) => !c.names.includes('s'))

  // A role change moves the project between the editor and viewer queries; the
  // SDK raises the two queries back to back. Each order is scripted, the real
  // one (editor first) and the reverse, so a future SDK that swaps them is covered.
  it('a DEMOTION raised editor-first reaches the caller once, never without the project (known-bad: immediate notify)', () => {
    const { calls } = sharedAs('editor')
    raise(EDITOR, [['t', 't']]); raise(VIEWER, [['s', 's']]); flush()
    expect(calls).toHaveLength(2)
    expect(lacksS(calls)).toEqual([])
  })

  it('a DEMOTION raised viewer-first reaches the caller once, never without the project', () => {
    const { calls } = sharedAs('editor')
    raise(VIEWER, [['s', 's']]); raise(EDITOR, [['t', 't']]); flush()
    expect(calls).toHaveLength(2)
    expect(lacksS(calls)).toEqual([])
  })

  it('a PROMOTION raised editor-first reaches the caller once, never without the project', () => {
    const { calls } = sharedAs('viewer')
    raise(EDITOR, [['s', 's'], ['t', 't']]); raise(VIEWER, []); flush()
    expect(calls).toHaveLength(2)
    expect(lacksS(calls)).toEqual([])
  })

  it('a PROMOTION raised viewer-first reaches the caller once, never without the project (known-bad: immediate notify)', () => {
    const { calls } = sharedAs('viewer')
    raise(VIEWER, []); raise(EDITOR, [['s', 's'], ['t', 't']]); flush()
    expect(calls).toHaveLength(2)
    expect(lacksS(calls)).toEqual([])
  })

  it('nothing notifies after an unsubscribe, even with a notify already scheduled (known-bad: timer not cancelled)', () => {
    const { calls, unsubscribe } = sharedAs('editor')
    raise(OWNED, [['x', 'x']])
    unsubscribe()
    flush()
    expect(calls).toHaveLength(1)
    expect(H.unsubscribed).toBe(3)
  })

  it('a callback that throws once does not stop the next notify (known-bad: the timer handle is reset after the callback)', () => {
    let throwNext = true
    const { calls } = listen(() => {
      if (throwNext) { throwNext = false; throw new Error('malformed document') }
    })
    raise(OWNED, [['x', 'one']]); raise(EDITOR, []); raise(VIEWER, [])
    expect(() => flush()).toThrow('malformed document')
    raise(OWNED, [['x', 'two']]); flush()
    expect(calls.map((c) => c.names)).toEqual([['one'], ['two']])
  })

  it('the per-burst timer belongs to each subscription (known-bad: one timer shared across subscriptions)', () => {
    const first = listen()
    const second = listen()
    raise(OWNED, [['x', 'first']], { base: 0 }); raise(EDITOR, [], { base: 0 }); raise(VIEWER, [], { base: 0 })
    raise(OWNED, [['y', 'second']], { base: 3 }); raise(EDITOR, [], { base: 3 }); raise(VIEWER, [], { base: 3 })
    flush()
    expect(first.calls.map((c) => c.names)).toEqual([['first']])
    expect(second.calls.map((c) => c.names)).toEqual([['second']])
  })
})

describe('isProjectSaveOutstanding — debounce timer, then write in flight (Brief 40)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    H.setDoc.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('U-D4 is true while the timer waits and while the write is in flight, false once it resolves (known-bad: the debounce timer is not counted)', async () => {
    const write = deferred()
    H.setDoc.mockReturnValueOnce(write.promise)
    expect(isProjectSaveOutstanding('p-ok')).toBe(false)
    saveProject('p-ok', projectDoc('n'))
    expect(isProjectSaveOutstanding('p-ok')).toBe(true)
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(H.setDoc).toHaveBeenCalledTimes(1)
    expect(isProjectSaveOutstanding('p-ok')).toBe(true)
    write.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(isProjectSaveOutstanding('p-ok')).toBe(false)
  })

  it('U-D5 is false once a REFUSED write settles, before any rollback raise could arrive (known-bad: clear on success only)', async () => {
    const write = deferred()
    H.setDoc.mockReturnValueOnce(write.promise)
    saveProject('p-refused', projectDoc('n'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    write.reject(new Error('permission-denied'))
    // Microtasks only: the SDK dispatches the rollback raise via setTimeout(0),
    // so it cannot run before these.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(isProjectSaveOutstanding('p-refused')).toBe(false)
  })

  it('U-D6 counts overlapping writes: the first to settle does not clear the second (known-bad: a flag)', async () => {
    const first = deferred()
    const second = deferred()
    H.setDoc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    saveProject('p-two', projectDoc('1'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    saveProject('p-two', projectDoc('2'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(H.setDoc).toHaveBeenCalledTimes(2)
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(isProjectSaveOutstanding('p-two')).toBe(true)
    second.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(isProjectSaveOutstanding('p-two')).toBe(false)
  })

  it('U-D7 tracks a write sent by flushPendingSaves (pagehide) too (known-bad: flush bypasses the count)', async () => {
    const write = deferred()
    H.setDoc.mockReturnValueOnce(write.promise)
    saveProject('p-flush', projectDoc('n'))
    flushPendingSaves()
    await vi.advanceTimersByTimeAsync(0)
    expect(H.setDoc).toHaveBeenCalledTimes(1)
    expect(isProjectSaveOutstanding('p-flush')).toBe(true)
    write.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(isProjectSaveOutstanding('p-flush')).toBe(false)
  })
})

describe('loadProjects — the first-load baseline comes from the SERVER (Brief 40, R2)', () => {
  it('U-D8 reads all three queries with getDocsFromServer and never getDocs (known-bad: getDocs answers from an empty cache offline)', async () => {
    vi.mocked(getDocs).mockClear()
    vi.mocked(getDocsFromServer).mockReset().mockResolvedValue({ docs: [] } as never)
    await loadProjects('u')
    expect(vi.mocked(getDocsFromServer)).toHaveBeenCalledTimes(3)
    expect(vi.mocked(getDocs)).not.toHaveBeenCalled()
  })

  it('U-D9 rejects when the server cannot be reached, instead of answering from the cache (known-bad: getDocs)', async () => {
    vi.mocked(getDocs).mockReset().mockResolvedValue({ docs: [] } as never)
    vi.mocked(getDocsFromServer).mockReset().mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }))
    await expect(loadProjects('u')).rejects.toMatchObject({ code: 'unavailable' })
  })
})
