// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firebase Authentication helpers — Google and Microsoft OAuth.
//
// Popup only. There is deliberately no signInWithRedirect fallback (removed in
// v0.50.10): the redirect flow reads its result through a hidden iframe on the
// authDomain (spert-suite.firebaseapp.com), a different site from the app, and
// browsers that partition third-party storage give that iframe an empty storage
// area. The user came back signed out, with no error. Every popup error now
// reaches the caller: SignInButtons shows "Allow pop-ups…" for auth/popup-blocked
// and stays silent for a closed or superseded popup (see sign-in-errors.ts).

import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth } from './config'

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Firebase not available')
  const provider = new GoogleAuthProvider()
  provider.addScope('openid')
  provider.addScope('profile')
  provider.addScope('email')
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function signInWithMicrosoft(): Promise<User> {
  if (!auth) throw new Error('Firebase not available')
  const provider = new OAuthProvider('microsoft.com')
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function signOut(): Promise<void> {
  if (!auth) return
  await firebaseSignOut(auth)
}
