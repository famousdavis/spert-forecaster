// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { doc, deleteDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functionsInstance } from '@/shared/firebase/config'
import { AI_TEARDOWN_PENDING_KEY } from '../constants'

// The bounded, failure-aware core of the Connect AI teardown. useAiConnectivity's
// teardown runs the in-memory cleanup and then delegates the server side here, so
// the same server call + retry-marker logic is reused by the on-load / on-online
// retry that AiTeardownBanner drives. Mirrors SPERT Story Map's aiSessionTeardown.

const SESSIONS_COL = 'anonymous_sessions'

/** Bound the whole server teardown so a flaky network cannot hang sign-out. */
const TEARDOWN_TIMEOUT_MS = 10_000

/**
 * Same-tab signal that the pending marker changed. AiTeardownBanner is mounted
 * once, app-wide, so it cannot learn of a set/clear from a `storage` event
 * (those fire only in OTHER tabs). This custom event lets it re-read.
 */
export const AI_TEARDOWN_CHANGED_EVENT = 'spert:forecaster-ai-teardown-changed'

function notifyTeardownChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(AI_TEARDOWN_CHANGED_EVENT))
  } catch {
    // no window (non-DOM env)
  }
}

/** The session id parked for a later teardown retry, or null. */
export function getPendingAiTeardownSessionId(): string | null {
  try {
    return localStorage.getItem(AI_TEARDOWN_PENDING_KEY)
  } catch {
    return null
  }
}

function setPendingAiTeardown(sessionId: string): void {
  try {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, sessionId)
  } catch {
    // no localStorage
  }
  notifyTeardownChanged()
}

export function clearPendingAiTeardown(): void {
  let had = false
  try {
    had = localStorage.getItem(AI_TEARDOWN_PENDING_KEY) !== null
    localStorage.removeItem(AI_TEARDOWN_PENDING_KEY)
  } catch {
    // no localStorage
  }
  if (had) notifyTeardownChanged()
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('teardown-timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(id)
        resolve(v)
      },
      (e) => {
        clearTimeout(id)
        reject(e)
      },
    )
  })
}

/**
 * The bounded server-side teardown. Deletes the Read-mode snapshot and, when
 * `deleteSession`, calls the `teardownAiSession` Cloud Function (which deletes
 * the ops, snapshot and session doc). The deleteDoc runs FIRST and is
 * load-bearing: the snapshot subcollection is `allow write: if true`, so the
 * delete succeeds even after sign-out revokes credentials. The WHOLE thing is
 * bounded by one timeout — a Firestore write does not resolve while the backend
 * is unreachable, and navigator.onLine can be true when it still is (captive
 * portal, dropped VPN, proxy), so an unbounded delete would hang sign-out.
 *
 * @param sessionId The anonymous session id.
 * @param deleteSession True to end the session (sign-out); false for Read-mode
 *   off, which deletes only the snapshot and keeps the pairing.
 * @returns True on a confirmed server teardown.
 */
export async function runServerTeardown(sessionId: string, deleteSession: boolean): Promise<boolean> {
  const database = db
  const fns = functionsInstance
  if (!database) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    await withTimeout(
      (async () => {
        try {
          await deleteDoc(doc(database, SESSIONS_COL, sessionId, 'snapshot', 'current'))
        } catch {
          // non-fatal — the Cloud Function removes the snapshot as well
        }
        if (deleteSession) {
          if (!fns) throw new Error('functions-unavailable')
          await httpsCallable(fns, 'teardownAiSession')({ sessionId })
        }
      })(),
      TEARDOWN_TIMEOUT_MS,
    )
    return true
  } catch (err) {
    if (deleteSession) {
      console.error(
        '[AI] Sign-out could not reach the server to end the AI session; it may ' +
          'stay live until it TTL-expires in 7 days unless retried:',
        err,
      )
    }
    return false
  }
}

/**
 * End the server session for a sign-out and manage the retry marker: clear it on
 * success (only for the session actually ended, so a later teardown of another
 * session cannot drop a parked retry), park it on failure so AiTeardownBanner
 * can warn the user and the teardown can be retried.
 *
 * @param sessionId The session being signed out of.
 * @returns True when the server session was confirmed ended.
 */
export async function endServerSession(sessionId: string): Promise<boolean> {
  const ok = await runServerTeardown(sessionId, true)
  if (ok) {
    if (getPendingAiTeardownSessionId() === sessionId) clearPendingAiTeardown()
  } else {
    setPendingAiTeardown(sessionId)
  }
  return ok
}

/**
 * Retry a parked teardown (next load, or when the browser is back online).
 *
 * @returns True when there is nothing left pending.
 */
export async function retryPendingAiTeardown(): Promise<boolean> {
  const sessionId = getPendingAiTeardownSessionId()
  if (!sessionId) return true
  if (!db || !functionsInstance) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const ok = await runServerTeardown(sessionId, true)
  if (ok) clearPendingAiTeardown()
  return ok
}
