// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Lesson 69: pass spy functions directly to vi.mock factories — do NOT
// wrap with `(...args: unknown[]) => spy(...args)` (that pattern trips
// TypeScript's TS2556 spread-argument-tuple check under strict settings).
//
// Spies are hoisted via `vi.hoisted` so they're defined before `vi.mock`
// factories execute (vi.mock is hoisted to the top of the file; bare
// `const` declarations would TDZ).

const spies = vi.hoisted(() => ({
  setDocSpy: vi.fn().mockResolvedValue(undefined),
  docSpy: vi.fn((_db: unknown, col: string, uid: string) => ({ path: `${col}/${uid}` })),
  serverTimestampSpy: vi.fn(() => ({ __sentinel: 'serverTimestamp' })),
}))
const { setDocSpy, docSpy, serverTimestampSpy } = spies

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>(
    'firebase/firestore'
  )
  return {
    ...actual,
    doc: spies.docSpy,
    setDoc: spies.setDocSpy,
    serverTimestamp: spies.serverTimestampSpy,
  }
})

// Provide a non-null `db` so the early-return guard does not fire.
vi.mock('./config', () => ({
  db: {} as unknown,
}))

// Import AFTER mocks so the module's `db` and firestore imports resolve to mocks.
import {
  upsertProfile,
  upsertSuiteProfile,
  writeUserProfile,
} from './profileWrites'
import type { User } from 'firebase/auth'
import type { FirestoreProfileDoc } from './types'

beforeEach(() => {
  setDocSpy.mockClear()
  docSpy.mockClear()
  serverTimestampSpy.mockClear()
})

describe('upsertProfile', () => {
  it('writes the doc with the supplied profile fields and {merge: true}', async () => {
    const data: FirestoreProfileDoc = {
      displayName: 'Alice Test',
      email: 'alice@example.com',
      photoURL: null,
      lastSignIn: '2026-05-08T00:00:00.000Z',
    }
    await upsertProfile('uid-1', data)
    expect(setDocSpy).toHaveBeenCalledTimes(1)
    const [, payload, options] = setDocSpy.mock.calls[0]
    expect(payload).toMatchObject({
      displayName: 'Alice Test',
      email: 'alice@example.com',
      lastSignIn: '2026-05-08T00:00:00.000Z',
    })
    expect(options).toEqual({ merge: true })
  })
})

describe('upsertSuiteProfile', () => {
  it('writes the suite-wide doc with serverTimestamp() merged AFTER sanitization (Lesson 29)', async () => {
    await upsertSuiteProfile('uid-1', {
      displayName: 'Alice Test',
      email: 'alice@example.com',
      photoURL: null,
    })
    expect(setDocSpy).toHaveBeenCalledTimes(1)
    const [, payload] = setDocSpy.mock.calls[0]
    expect(payload).toMatchObject({
      displayName: 'Alice Test',
      email: 'alice@example.com',
      photoURL: null,
    })
    // The serverTimestamp sentinel must survive into the final payload —
    // sanitizeForFirestore would flatten it to {} if applied AFTER this merge.
    expect(payload.updatedAt).toEqual({ __sentinel: 'serverTimestamp' })
    expect(serverTimestampSpy).toHaveBeenCalledTimes(1)
  })

  it('writes to the spertsuite_profiles collection (suite-wide row)', async () => {
    await upsertSuiteProfile('uid-1', {
      displayName: 'Alice',
      email: 'alice@example.com',
      photoURL: null,
    })
    expect(docSpy).toHaveBeenCalledWith(expect.any(Object), 'spertsuite_profiles', 'uid-1')
  })
})

describe('writeUserProfile', () => {
  function makeUser(overrides: Partial<User> = {}): User {
    return {
      uid: 'uid-1',
      displayName: 'Alice Test',
      email: 'Alice@Example.COM',
      photoURL: 'https://example.com/avatar.jpg',
      ...overrides,
    } as User
  }

  it('fires both upserts (app-specific + suite-wide) in a single auth resolution', async () => {
    await writeUserProfile(makeUser())
    expect(setDocSpy).toHaveBeenCalledTimes(2)
  })

  it('lowercases email before writing both rows', async () => {
    await writeUserProfile(makeUser({ email: 'Alice@Example.COM' } as Partial<User>))
    for (const [, payload] of setDocSpy.mock.calls) {
      expect(payload.email).toBe('alice@example.com')
    }
  })

  it('falls back to empty string when email is null', async () => {
    await writeUserProfile(makeUser({ email: null } as Partial<User>))
    for (const [, payload] of setDocSpy.mock.calls) {
      expect(payload.email).toBe('')
    }
  })

  it('writes a `lastSignIn` ISO timestamp on the app-specific row only', async () => {
    await writeUserProfile(makeUser())
    const payloads = setDocSpy.mock.calls.map(([, p]) => p)
    const appRow = payloads.find((p) => 'lastSignIn' in p)
    const suiteRow = payloads.find((p) => 'updatedAt' in p)
    expect(appRow).toBeDefined()
    expect(typeof appRow!.lastSignIn).toBe('string')
    expect(appRow!.lastSignIn).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(suiteRow).toBeDefined()
    expect('lastSignIn' in suiteRow!).toBe(false)
  })

  it('does not throw when one upsert rejects (background write contract)', async () => {
    setDocSpy.mockRejectedValueOnce(new Error('transient network'))
    // Suppress expected console.error noise for this test only.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(writeUserProfile(makeUser())).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
