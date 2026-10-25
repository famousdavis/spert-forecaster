// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'

// The October 26, 2026 editions of the Terms of Service and Privacy Policy.
//
// A returning user whose acceptance names the October 5 editions ('10-05-2026')
// must be signed out, so the next sign-in asks them to accept again; a user
// whose acceptance names the October 26 editions ('10-26-2026') must be let
// through. These run the real AuthProvider and the real ToS module
// (`@/features/auth/lib/tos`); only Firebase and the sign-out stores are
// stubbed. The version strings are written out on purpose: importing
// TOS_VERSION would make every case pass whatever the constant said.

const hoisted = vi.hoisted(() => ({
  capturedCallback: null as ((user: User | null) => void) | null,
  /** The tosVersion on the user's acceptance record, or null when there is no record. */
  onRecord: null as string | null,
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
  clearProjectsOnSignOut: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: User | null) => void) => {
    hoisted.capturedCallback = cb
    return () => {}
  },
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  getDoc: () =>
    Promise.resolve({
      exists: () => hoisted.onRecord !== null,
      data: () => ({ tosVersion: hoisted.onRecord }),
    }),
  setDoc: hoisted.setDoc,
  serverTimestamp: () => ({ __ts: true }),
}))

// A truthy db, so the real ToS module reads the acceptance on record.
vi.mock('@/shared/firebase/config', () => ({
  auth: { currentUser: null },
  db: { __fake: 'db' },
  isFirebaseAvailable: true,
  functionsInstance: null,
}))

vi.mock('@/shared/firebase/auth', () => ({
  checkRedirectResult: vi.fn().mockResolvedValue(null),
  signOut: vi.fn().mockResolvedValue(undefined),
  signInWithGoogle: vi.fn(),
  signInWithMicrosoft: vi.fn(),
}))

vi.mock('@/shared/firebase/firestore-driver', () => ({ cancelPendingSaves: vi.fn() }))

vi.mock('@/shared/firebase/callables', () => ({
  callClaimPendingInvitations: vi.fn().mockResolvedValue({ claimed: [] }),
}))

vi.mock('@/shared/firebase/profileWrites', () => ({
  writeUserProfile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/shared/state/project-store', () => ({
  useProjectStore: { getState: () => ({ clearProjectsOnSignOut: hoisted.clearProjectsOnSignOut }) },
}))

vi.mock('@/shared/state/storage-mode-store', () => ({
  useStorageModeStore: { getState: () => ({ setMode: vi.fn() }) },
}))

vi.mock('@/shared/lib/simulation-generation', () => ({
  bumpSimulationGeneration: vi.fn(),
  currentSimulationGeneration: vi.fn(() => 0),
}))

vi.mock('@/shared/state/settings-store', () => ({
  useSettingsStore: { getState: () => ({ clearSettingsOnSignOut: vi.fn() }) },
}))

import * as firebaseAuthModule from '@/shared/firebase/auth'
import { TOS_LS_KEY, setPendingWrite } from '@/features/auth/lib/tos'
import { AuthProvider, useAuth } from '../AuthProvider'

const OCTOBER_5 = '10-05-2026'
const OCTOBER_26 = '10-26-2026'

const user = { uid: 'terms-uid', providerData: [{ providerId: 'google.com' }] } as unknown as User

function signIn() {
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>
  const auth = renderHook(() => useAuth(), { wrapper }).result
  act(() => {
    if (!hoisted.capturedCallback) throw new Error('onAuthStateChanged callback was not captured')
    hoisted.capturedCallback(user)
  })
  return auth
}

function termsWrites() {
  return hoisted.setDoc.mock.calls.filter(([ref]) => (ref as { path: string }).path === `users/${user.uid}`)
}

describe('Terms and Privacy Policy 1.4 (October 26, 2026): who is asked to accept again', () => {
  beforeEach(() => {
    localStorage.clear()
    hoisted.capturedCallback = null
    hoisted.onRecord = null
    hoisted.setDoc.mockClear()
    hoisted.clearProjectsOnSignOut.mockClear()
    vi.mocked(firebaseAuthModule.signOut).mockClear()
  })

  it('a user whose cached acceptance and record name the October 5 editions is signed out, to accept again', async () => {
    localStorage.setItem(TOS_LS_KEY, OCTOBER_5)
    hoisted.onRecord = OCTOBER_5

    const auth = signIn()

    await waitFor(() => expect(auth.current.isLoading).toBe(false))
    expect(firebaseAuthModule.signOut).toHaveBeenCalledTimes(1)
    expect(hoisted.clearProjectsOnSignOut).toHaveBeenCalledTimes(1)
    expect(auth.current.user).toBeNull()
    expect(localStorage.getItem(TOS_LS_KEY)).toBeNull()
  })

  it('a user with no cached acceptance whose record names the October 5 editions is signed out, to accept again', async () => {
    hoisted.onRecord = OCTOBER_5

    const auth = signIn()

    await waitFor(() => expect(auth.current.isLoading).toBe(false))
    expect(firebaseAuthModule.signOut).toHaveBeenCalledTimes(1)
    expect(auth.current.user).toBeNull()
  })

  it('a user whose cached acceptance names the October 26 editions is let through', async () => {
    localStorage.setItem(TOS_LS_KEY, OCTOBER_26)
    hoisted.onRecord = OCTOBER_26

    const auth = signIn()

    await waitFor(() => expect(auth.current.isLoading).toBe(false))
    expect(firebaseAuthModule.signOut).not.toHaveBeenCalled()
    expect(auth.current.user?.uid).toBe(user.uid)
  })

  it('a user with no cached acceptance whose record names the October 26 editions is let through, and cached', async () => {
    hoisted.onRecord = OCTOBER_26

    const auth = signIn()

    await waitFor(() => expect(auth.current.isLoading).toBe(false))
    expect(firebaseAuthModule.signOut).not.toHaveBeenCalled()
    expect(auth.current.user?.uid).toBe(user.uid)
    expect(localStorage.getItem(TOS_LS_KEY)).toBe(OCTOBER_26)
  })

  it('accepting over an October 5 record records the October 26 Terms and Privacy Policy', async () => {
    setPendingWrite() // what the consent modal does before the sign-in
    hoisted.onRecord = OCTOBER_5

    const auth = signIn()

    await waitFor(() => expect(auth.current.isLoading).toBe(false))
    expect(firebaseAuthModule.signOut).not.toHaveBeenCalled()
    expect(auth.current.user?.uid).toBe(user.uid)
    expect(termsWrites()).toHaveLength(1)
    expect(termsWrites()[0][1]).toMatchObject({ tosVersion: OCTOBER_26, privacyPolicyVersion: OCTOBER_26 })
    expect(localStorage.getItem(TOS_LS_KEY)).toBe(OCTOBER_26)
  })
})
