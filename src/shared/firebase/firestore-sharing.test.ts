// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Lesson 69 / mock pattern mirrored from profileWrites.test.ts: hoist spies
// via vi.hoisted so they exist before vi.mock factories execute.
//
// Mock model: `doc(db, collection, uid)` returns a tagged ref that includes
// the collection + uid so the `getDoc` mock can dispatch per-key behavior.
// This mirrors the per-uid mock pattern needed to exercise the partial-failure
// paths in `getProjectMembers` (one profile read rejects, others fulfill).

type MockSnap =
  | { exists: () => true; data: () => Record<string, unknown> }
  | { exists: () => false; data: () => undefined }

const fulfilled = (data: Record<string, unknown>): MockSnap => ({
  exists: () => true,
  data: () => data,
})
const missing = (): MockSnap => ({
  exists: () => false,
  data: () => undefined,
})

const spies = vi.hoisted(() => ({
  docSpy: vi.fn((_db: unknown, col: string, uid: string) => ({
    __ref: true,
    col,
    uid,
    path: `${col}/${uid}`,
  })),
  // getDoc is configured per-test via the snapMap below.
  getDocSpy: vi.fn(),
}))
const { docSpy, getDocSpy } = spies

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>(
    'firebase/firestore'
  )
  return {
    ...actual,
    doc: spies.docSpy,
    getDoc: spies.getDocSpy,
  }
})

// Provide a non-null `db` so the early-return guard does not fire.
vi.mock('./config', () => ({
  db: {} as unknown,
}))

// Import AFTER mocks so the SUT resolves to the mocked firestore module.
import { getProjectMembers } from './firestore-sharing'

// Per-key dispatch table populated by each test before invoking the SUT.
type DispatchEntry =
  | { kind: 'fulfilled'; snap: MockSnap }
  | { kind: 'rejected'; reason: unknown }

let dispatch: Map<string, DispatchEntry>

beforeEach(() => {
  docSpy.mockClear()
  getDocSpy.mockReset()
  dispatch = new Map()
  getDocSpy.mockImplementation(async (ref: { col: string; uid: string }) => {
    const key = `${ref.col}/${ref.uid}`
    const entry = dispatch.get(key)
    if (!entry) {
      throw new Error(`unconfigured mock key: ${key}`)
    }
    if (entry.kind === 'rejected') throw entry.reason
    return entry.snap
  })
})

const PROJECT_ID = 'proj-1'
const PROJECT_KEY = `spertforecaster_projects/${PROJECT_ID}`
const profileKey = (uid: string) => `spertforecaster_profiles/${uid}`

describe('getProjectMembers', () => {
  it('returns owner first, then members in entry order — happy path', async () => {
    dispatch.set(
      PROJECT_KEY,
      {
        kind: 'fulfilled',
        snap: fulfilled({
          owner: 'owner-uid',
          members: { 'mem-a': 'editor', 'mem-b': 'viewer' },
        }),
      }
    )
    dispatch.set(profileKey('owner-uid'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'owner@x.com', displayName: 'Owner Name', photoURL: null, lastSignIn: '' }),
    })
    dispatch.set(profileKey('mem-a'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'a@x.com', displayName: 'A Member', photoURL: null, lastSignIn: '' }),
    })
    dispatch.set(profileKey('mem-b'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'b@x.com', displayName: 'B Member', photoURL: null, lastSignIn: '' }),
    })

    const result = await getProjectMembers(PROJECT_ID)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ uid: 'owner-uid', email: 'owner@x.com', displayName: 'Owner Name', role: 'owner' })
    expect(result[1]).toEqual({ uid: 'mem-a', email: 'a@x.com', displayName: 'A Member', role: 'editor' })
    expect(result[2]).toEqual({ uid: 'mem-b', email: 'b@x.com', displayName: 'B Member', role: 'viewer' })
  })

  it('owner profile rejects — returns owner with placeholder, members fully populated, console.warn fires', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    dispatch.set(PROJECT_KEY, {
      kind: 'fulfilled',
      snap: fulfilled({
        owner: 'owner-uid',
        members: { 'mem-a': 'editor', 'mem-b': 'viewer' },
      }),
    })
    dispatch.set(profileKey('owner-uid'), { kind: 'rejected', reason: new Error('permission-denied') })
    dispatch.set(profileKey('mem-a'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'a@x.com', displayName: 'A Member', photoURL: null, lastSignIn: '' }),
    })
    dispatch.set(profileKey('mem-b'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'b@x.com', displayName: 'B Member', photoURL: null, lastSignIn: '' }),
    })

    const result = await getProjectMembers(PROJECT_ID)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ uid: 'owner-uid', email: '', displayName: '', role: 'owner' })
    expect(result[1]!.email).toBe('a@x.com')
    expect(result[2]!.email).toBe('b@x.com')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('profile fetch failed for owner-uid'),
      expect.any(Error)
    )

    warnSpy.mockRestore()
  })

  it('one member profile rejects — that entry placeholders, others populated, console.warn fires', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    dispatch.set(PROJECT_KEY, {
      kind: 'fulfilled',
      snap: fulfilled({
        owner: 'owner-uid',
        members: { 'mem-a': 'editor', 'mem-b': 'viewer' },
      }),
    })
    dispatch.set(profileKey('owner-uid'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'owner@x.com', displayName: 'Owner Name', photoURL: null, lastSignIn: '' }),
    })
    dispatch.set(profileKey('mem-a'), { kind: 'rejected', reason: new Error('network blip') })
    dispatch.set(profileKey('mem-b'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'b@x.com', displayName: 'B Member', photoURL: null, lastSignIn: '' }),
    })

    const result = await getProjectMembers(PROJECT_ID)

    expect(result).toHaveLength(3)
    expect(result[0]!.email).toBe('owner@x.com')
    expect(result[1]).toEqual({ uid: 'mem-a', email: '', displayName: '', role: 'editor' })
    expect(result[2]!.email).toBe('b@x.com')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('profile fetch failed for mem-a'),
      expect.any(Error)
    )
    // Only one rejection => exactly one warn.
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })

  it('member profile doc missing — entry placeholders quietly, no warn (existing behavior)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    dispatch.set(PROJECT_KEY, {
      kind: 'fulfilled',
      snap: fulfilled({
        owner: 'owner-uid',
        members: { 'mem-a': 'editor' },
      }),
    })
    dispatch.set(profileKey('owner-uid'), {
      kind: 'fulfilled',
      snap: fulfilled({ email: 'owner@x.com', displayName: 'Owner Name', photoURL: null, lastSignIn: '' }),
    })
    dispatch.set(profileKey('mem-a'), { kind: 'fulfilled', snap: missing() })

    const result = await getProjectMembers(PROJECT_ID)

    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ uid: 'mem-a', email: '', displayName: '', role: 'editor' })
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('project doc missing — returns empty array, no profile reads attempted', async () => {
    dispatch.set(PROJECT_KEY, { kind: 'fulfilled', snap: missing() })

    const result = await getProjectMembers(PROJECT_ID)

    expect(result).toEqual([])
    // Only the project read should have happened — no profile fetches.
    expect(getDocSpy).toHaveBeenCalledTimes(1)
  })
})
