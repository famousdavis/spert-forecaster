// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ToS/Privacy Policy acceptance — constants, localStorage helpers, Firestore read/write

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/shared/firebase/config'

// --- Constants ---

export const TOS_VERSION = '03-11-2026'
export const PRIVACY_VERSION = '03-11-2026'
export const TOS_LS_KEY = 'spert_tos_accepted_version'
export const TOS_WRITE_PENDING_KEY = 'spert_tos_write_pending'
export const FIRST_RUN_SEEN_KEY = 'spert_firstRun_seen'
export const TOS_APP_ID = 'spert-forecaster'
export const TOS_URL = 'https://spert-landing.vercel.app/TOS.pdf'
export const PRIVACY_URL = 'https://spert-landing.vercel.app/PRIVACY.pdf'

// --- localStorage helpers ---

export function isTosCached(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(TOS_LS_KEY) === TOS_VERSION
}

export function cacheTos(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOS_LS_KEY, TOS_VERSION)
}

export function clearTosCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOS_LS_KEY)
}

export function setPendingWrite(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOS_WRITE_PENDING_KEY, 'true')
}

export function clearPendingWrite(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOS_WRITE_PENDING_KEY)
}

export function hasPendingWrite(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(TOS_WRITE_PENDING_KEY) === 'true'
}

// --- Firestore helpers ---

/**
 * Check Firestore users/{uid} for current ToS acceptance.
 * Returns 'current' if tosVersion matches, 'outdated' if it differs, 'missing' if no document.
 */
export async function checkFirestoreTos(
  uid: string
): Promise<'current' | 'outdated' | 'missing'> {
  if (!db) return 'missing'
  try {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return 'missing'
    const data = snap.data()
    return data.tosVersion === TOS_VERSION ? 'current' : 'outdated'
  } catch (err) {
    console.error('Failed to check Firestore ToS record:', err)
    return 'missing'
  }
}

/**
 * Write ToS acceptance record to Firestore using read-before-write pattern.
 *
 * a) Document missing → full write including appId
 * b) Document exists, tosVersion differs → merge write WITHOUT appId (preserves original first-acceptance app)
 * c) Document exists, tosVersion matches → skip write entirely
 *
 * After a successful write (cases a or b), caches the version in localStorage.
 */
export async function writeToSAcceptance(
  uid: string,
  authProvider: string
): Promise<void> {
  if (!db) return
  try {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)

    if (!snap.exists()) {
      // Case a: no document — full write with appId
      await setDoc(ref, {
        acceptedAt: serverTimestamp(),
        tosVersion: TOS_VERSION,
        privacyPolicyVersion: PRIVACY_VERSION,
        appId: TOS_APP_ID,
        authProvider,
      })
      cacheTos()
    } else {
      const data = snap.data()
      if (data.tosVersion !== TOS_VERSION) {
        // Case b: version differs — merge WITHOUT appId
        await setDoc(
          ref,
          {
            acceptedAt: serverTimestamp(),
            tosVersion: TOS_VERSION,
            privacyPolicyVersion: PRIVACY_VERSION,
            authProvider,
          },
          { merge: true }
        )
        cacheTos()
      }
      // Case c: version matches — skip write, just cache
      else {
        cacheTos()
      }
    }
  } catch (err) {
    console.error('Failed to write ToS acceptance record:', err)
  }
}
