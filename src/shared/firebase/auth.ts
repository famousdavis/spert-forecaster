// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firebase Authentication helpers — Google and Microsoft OAuth.
// Uses signInWithPopup as primary, with signInWithRedirect fallback
// when popup is blocked (e.g., by CSP or browser settings).

import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth } from './config'

export async function signInWithGoogle(): Promise<User | null> {
  if (!auth) throw new Error('Firebase not available')
  const provider = new GoogleAuthProvider()
  provider.addScope('openid')
  provider.addScope('profile')
  provider.addScope('email')
  try {
    const result = await signInWithPopup(auth, provider)
    return result.user
  } catch {
    // Popup blocked or failed — fall back to redirect
    await signInWithRedirect(auth, provider)
    return null
  }
}

export async function signInWithMicrosoft(): Promise<User | null> {
  if (!auth) throw new Error('Firebase not available')
  const provider = new OAuthProvider('microsoft.com')
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    const result = await signInWithPopup(auth, provider)
    return result.user
  } catch {
    // Popup blocked or failed — fall back to redirect
    await signInWithRedirect(auth, provider)
    return null
  }
}

/** Check for pending redirect result on page load */
export async function checkRedirectResult(): Promise<User | null> {
  if (!auth) return null
  try {
    const result = await getRedirectResult(auth)
    return result?.user ?? null
  } catch {
    return null
  }
}

export async function signOut(): Promise<void> {
  if (!auth) return
  await firebaseSignOut(auth)
}
