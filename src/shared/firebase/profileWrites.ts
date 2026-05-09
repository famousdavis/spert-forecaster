// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Profile write helpers (Lesson 62) — extracted from AuthProvider and
// firestore-driver so the dual-write contract (app-specific +
// suite-wide rows) is encapsulated in one module and unit-testable.
//
// The dual-write fires on every auth resolution (not only at explicit
// sign-in) so signed-in-but-local users remain discoverable as invitees
// from other SPERT apps and so returning users get a refreshed displayName/
// photoURL whenever they reload.

import type { User } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS, type FirestoreProfileDoc } from './types'
import { sanitizeForFirestore } from './firestore-sanitize'
import { denormalizeLastFirst } from '@/lib/auth-name'

/**
 * Upsert the app-specific profile row (`spertforecaster_profiles/{uid}`).
 *
 * Powers in-app rendering: lastSignIn, app-local displayName fallback,
 * etc. NOT used by the suite-wide invitation system — that lives in
 * spertsuite_profiles (see upsertSuiteProfile).
 *
 * Reused by `firestore-migration.ts` during local→cloud migration; keep
 * the signature stable.
 */
export async function upsertProfile(
  uid: string,
  data: FirestoreProfileDoc
): Promise<void> {
  if (!db) return
  const ref = doc(db, COLLECTIONS.profiles, uid)
  await setDoc(ref, sanitizeForFirestore(data), { merge: true })
}

/**
 * Upsert the suite-wide profile row (`spertsuite_profiles/{uid}`).
 *
 * The bulk-invitation `sendInvitationEmail` callable resolves invitee
 * email addresses to UIDs by querying this collection across all SPERT
 * apps. Writing here on every auth resolution keeps a Forecaster user
 * discoverable by GanttApp's invitation flow (and vice versa).
 *
 * The caller must pre-normalize `displayName` (denormalizeLastFirst) and
 * lowercase `email` so the same identity resolves to the same row
 * regardless of which app wrote it most recently.
 *
 * `serverTimestamp()` is merged AFTER `sanitizeForFirestore` (Lesson 29)
 * — the sanitizer walks recursively and would flatten the FieldValue
 * sentinel into an empty map.
 *
 * Does NOT write `lastSignIn`; that's app-specific metadata kept only in
 * spertforecaster_profiles.
 */
export async function upsertSuiteProfile(
  uid: string,
  data: { displayName: string; email: string; photoURL: string | null }
): Promise<void> {
  if (!db) return
  const ref = doc(db, 'spertsuite_profiles', uid)
  await setDoc(
    ref,
    { ...sanitizeForFirestore(data), updatedAt: serverTimestamp() },
    { merge: true }
  )
}

/**
 * Dual-write the user profile on every auth resolution.
 *
 * The two upserts are intentionally asymmetric:
 *   - spertforecaster_profiles row carries `lastSignIn` (app-specific);
 *     `displayName`/`email` are normalized.
 *   - spertsuite_profiles row carries `updatedAt: serverTimestamp()`;
 *     no `lastSignIn` field.
 *
 * `displayName` is normalized via `denormalizeLastFirst` so the UI
 * rendering matches the From-line the invitation mailer writes.
 * `email` is lowercased so case differences across providers don't
 * fork the identity.
 *
 * Failure is logged but NOT toasted — this is a background write the
 * user cannot act on; it retries on the next auth resolution. Both
 * upserts run in parallel via `Promise.all`; if either rejects, the
 * shared `catch` logs and the function resolves cleanly so callers can
 * continue.
 */
export async function writeUserProfile(firebaseUser: User): Promise<void> {
  if (!db) return
  const displayName = denormalizeLastFirst(firebaseUser.displayName ?? '')
  const email = (firebaseUser.email ?? '').toLowerCase()
  const photoURL = firebaseUser.photoURL ?? null
  try {
    await Promise.all([
      upsertProfile(firebaseUser.uid, {
        displayName,
        email,
        photoURL,
        lastSignIn: new Date().toISOString(),
      }),
      upsertSuiteProfile(firebaseUser.uid, { displayName, email, photoURL }),
    ])
  } catch (err) {
    console.error('Profile write failed:', err)
    // Background write; not user-actionable. Retries on next auth resolution.
  }
}
