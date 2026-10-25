// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The bounded, failure-aware server side of the Connect AI teardown. Proves it
// calls teardownAiSession with the session id, that a failed/offline/hung call
// parks a retry marker (the state AiTeardownBanner reads) rather than logging to
// the console only, that a deleteDoc that never resolves cannot hang sign-out,
// and that a success only clears the marker of the session actually ended.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  callable: vi.fn((_arg?: unknown) => Promise.resolve({ data: { success: true } })),
  httpsCallable: vi.fn(),
  deleteDoc: vi.fn((_ref?: unknown) => Promise.resolve()),
}))

vi.mock('@/shared/firebase/config', () => ({
  db: { __fake: 'db' },
  functionsInstance: { __fake: 'fns' },
  isFirebaseAvailable: true,
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  deleteDoc: hoisted.deleteDoc,
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: hoisted.httpsCallable,
}))

import {
  endServerSession,
  retryPendingAiTeardown,
  getPendingAiTeardownSessionId,
  clearPendingAiTeardown,
} from './ai-session-teardown'
import { AI_TEARDOWN_PENDING_KEY } from '../constants'

const SID = '123e4567-e89b-42d3-a456-426614174000'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

beforeEach(() => {
  localStorage.clear()
  hoisted.callable.mockReset().mockResolvedValue({ data: { success: true } })
  hoisted.httpsCallable.mockReset().mockReturnValue(hoisted.callable)
  hoisted.deleteDoc.mockReset().mockResolvedValue(undefined)
  setOnline(true)
})

afterEach(() => {
  vi.useRealTimers()
  setOnline(true)
})

describe('endServerSession', () => {
  it('calls teardownAiSession with the session id and deletes the snapshot', async () => {
    const ok = await endServerSession(SID)

    expect(ok).toBe(true)
    expect(hoisted.httpsCallable).toHaveBeenCalledWith({ __fake: 'fns' }, 'teardownAiSession')
    expect(hoisted.callable).toHaveBeenCalledWith({ sessionId: SID })
    expect(hoisted.deleteDoc.mock.calls[0]?.[0]).toEqual({
      path: `anonymous_sessions/${SID}/snapshot/current`,
    })
    expect(getPendingAiTeardownSessionId()).toBeNull()
  })

  it('parks a retry marker when the server call fails', async () => {
    hoisted.callable.mockRejectedValue(new Error('unavailable'))

    const ok = await endServerSession(SID)

    expect(ok).toBe(false)
    expect(getPendingAiTeardownSessionId()).toBe(SID)
  })

  it('fails fast and parks a marker when offline (no server call)', async () => {
    setOnline(false)

    const ok = await endServerSession(SID)

    expect(ok).toBe(false)
    expect(hoisted.httpsCallable).not.toHaveBeenCalled()
    expect(hoisted.deleteDoc).not.toHaveBeenCalled()
    expect(getPendingAiTeardownSessionId()).toBe(SID)
  })

  it('does not hang when the snapshot delete never resolves; parks the marker within the timeout', async () => {
    vi.useFakeTimers()
    hoisted.deleteDoc.mockReturnValue(new Promise<void>(() => { /* never resolves */ }))

    const p = endServerSession(SID)
    await vi.advanceTimersByTimeAsync(10_000)
    const ok = await p

    expect(ok).toBe(false)
    expect(getPendingAiTeardownSessionId()).toBe(SID)
  })

  it('on success clears ONLY the marker of the session it ended, not another session\'s', async () => {
    // A different session's failed teardown is parked.
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, 'other-session')

    const ok = await endServerSession(SID)

    expect(ok).toBe(true)
    // The other session's pending retry must survive.
    expect(getPendingAiTeardownSessionId()).toBe('other-session')
  })
})

describe('retryPendingAiTeardown', () => {
  it('clears the marker when the retried call succeeds', async () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, SID)

    const ok = await retryPendingAiTeardown()

    expect(ok).toBe(true)
    expect(hoisted.callable).toHaveBeenCalledWith({ sessionId: SID })
    expect(getPendingAiTeardownSessionId()).toBeNull()
  })

  it('keeps the marker when the retry still fails', async () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, SID)
    hoisted.callable.mockRejectedValue(new Error('still offline'))

    const ok = await retryPendingAiTeardown()

    expect(ok).toBe(false)
    expect(getPendingAiTeardownSessionId()).toBe(SID)
  })

  it('is a no-op with nothing pending', async () => {
    const ok = await retryPendingAiTeardown()
    expect(ok).toBe(true)
    expect(hoisted.httpsCallable).not.toHaveBeenCalled()
  })
})

describe('clearPendingAiTeardown', () => {
  it('removes the marker', () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, SID)
    clearPendingAiTeardown()
    expect(getPendingAiTeardownSessionId()).toBeNull()
  })
})
