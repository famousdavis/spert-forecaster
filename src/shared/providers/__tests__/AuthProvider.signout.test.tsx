// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'

// --- Module mocks ---
//
// Capture the onAuthStateChanged callback synchronously via a hoisted ref so
// each test can drive auth-state transitions directly. All Firebase, store,
// and ToS dependencies are stubbed — this test asserts only on mock call
// counts to verify the previousUserRef guard and the three sign-out paths
// (user-initiated, ToS-mismatch, externally-revoked) are wired correctly.

const hoisted = vi.hoisted(() => ({
  capturedCallback: null as ((user: User | null) => void) | null,
  clearProjectsOnSignOut: vi.fn(),
  setMode: vi.fn(),
  cancelPendingSaves: vi.fn(),
  bumpSimulationGeneration: vi.fn(),
  clearSettingsOnSignOut: vi.fn(),
  mutableAuth: { currentUser: null as User | null },
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (
    _auth: unknown,
    cb: (user: User | null) => void,
  ) => {
    hoisted.capturedCallback = cb
    return () => {}
  },
}))

vi.mock('@/shared/firebase/config', () => ({
  auth: hoisted.mutableAuth,
  isFirebaseAvailable: true,
  functionsInstance: null,
}))

vi.mock('@/shared/firebase/auth', () => ({
  checkRedirectResult: vi.fn().mockResolvedValue(null),
  signOut: vi.fn().mockResolvedValue(undefined),
  signInWithGoogle: vi.fn(),
  signInWithMicrosoft: vi.fn(),
}))

vi.mock('@/shared/firebase/firestore-driver', () => ({
  cancelPendingSaves: hoisted.cancelPendingSaves,
}))

vi.mock('@/shared/firebase/callables', () => ({
  callClaimPendingInvitations: vi.fn().mockResolvedValue({ claimed: [] }),
}))

vi.mock('@/shared/firebase/profileWrites', () => ({
  writeUserProfile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/features/auth/lib/tos', () => ({
  isTosCached: vi.fn(() => true),
  cacheTos: vi.fn(),
  clearTosCache: vi.fn(),
  hasPendingWrite: vi.fn(() => false),
  clearPendingWrite: vi.fn(),
  checkFirestoreTos: vi.fn().mockResolvedValue('current'),
  writeToSAcceptance: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/shared/state/project-store', () => ({
  useProjectStore: {
    getState: () => ({ clearProjectsOnSignOut: hoisted.clearProjectsOnSignOut }),
  },
}))

vi.mock('@/shared/state/storage-mode-store', () => ({
  useStorageModeStore: {
    getState: () => ({ setMode: hoisted.setMode }),
  },
}))

vi.mock('@/features/forecast/lib/simulation-generation', () => ({
  bumpSimulationGeneration: hoisted.bumpSimulationGeneration,
  currentSimulationGeneration: vi.fn(() => 0),
}))

vi.mock('@/shared/state/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ clearSettingsOnSignOut: hoisted.clearSettingsOnSignOut }),
  },
}))

// Static-import the tos module after mocks so vi.mocked() returns the stubs.
import * as tosModule from '@/features/auth/lib/tos'
import * as firebaseAuthModule from '@/shared/firebase/auth'

// Imported AFTER mocks so its deps resolve to the stand-ins above.
import { AuthProvider, useAuth } from '../AuthProvider'

const fakeUser = { uid: 'u1', providerData: [{ providerId: 'google.com' }] } as unknown as User

function fire(user: User | null) {
  if (!hoisted.capturedCallback) throw new Error('onAuthStateChanged callback was not captured')
  hoisted.capturedCallback(user)
}

describe('AuthProvider sign-out guard', () => {
  beforeEach(() => {
    hoisted.capturedCallback = null
    hoisted.mutableAuth.currentUser = fakeUser  // default authenticated state
    hoisted.clearProjectsOnSignOut.mockClear()
    hoisted.setMode.mockClear()
    hoisted.cancelPendingSaves.mockClear()
    hoisted.bumpSimulationGeneration.mockClear()
    hoisted.clearSettingsOnSignOut.mockClear()
    // Reset tos mocks to defaults so per-test mockReturnValueOnce doesn't pollute
    vi.mocked(tosModule.isTosCached).mockReturnValue(true)
    vi.mocked(tosModule.hasPendingWrite).mockReturnValue(false)
    vi.mocked(tosModule.checkFirestoreTos).mockResolvedValue('current')
    vi.mocked(firebaseAuthModule.signOut).mockClear()
    vi.mocked(firebaseAuthModule.signOut).mockResolvedValue(undefined)
  })

  it('initial null does not call cleanup', async () => {
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(null) })

    expect(hoisted.clearProjectsOnSignOut).not.toHaveBeenCalled()
    expect(hoisted.cancelPendingSaves).not.toHaveBeenCalled()
    expect(hoisted.bumpSimulationGeneration).not.toHaveBeenCalled()
    expect(hoisted.clearSettingsOnSignOut).not.toHaveBeenCalled()
  })

  it('User → null calls full performSignOutCleanup (path 3 fallback)', async () => {
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(fakeUser) })
    await act(async () => { fire(null) })

    expect(hoisted.clearProjectsOnSignOut).toHaveBeenCalledTimes(1)
    expect(hoisted.cancelPendingSaves).toHaveBeenCalledTimes(1)
    expect(hoisted.setMode).toHaveBeenCalledWith('local')
    expect(hoisted.bumpSimulationGeneration).toHaveBeenCalledTimes(1)
    expect(hoisted.clearSettingsOnSignOut).toHaveBeenCalledTimes(1)
  })

  it('null → null does not double-call cleanup', async () => {
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(fakeUser) })
    await act(async () => { fire(null) })

    hoisted.clearProjectsOnSignOut.mockClear()
    hoisted.cancelPendingSaves.mockClear()
    hoisted.setMode.mockClear()
    hoisted.bumpSimulationGeneration.mockClear()
    hoisted.clearSettingsOnSignOut.mockClear()

    await act(async () => { fire(null) })

    expect(hoisted.clearProjectsOnSignOut).not.toHaveBeenCalled()
    expect(hoisted.bumpSimulationGeneration).not.toHaveBeenCalled()
  })

  it('handleSignOut (path 1): runs cleanup BEFORE signOut and prevents onAuthStateChanged from re-running it', async () => {
    const signOutRef: { current: (() => Promise<void>) | null } = { current: null }
    function Consumer() {
      const { signOut } = useAuth()
      useEffect(() => { signOutRef.current = signOut }, [signOut])
      return null
    }
    render(<AuthProvider><Consumer /></AuthProvider>)
    await act(async () => { fire(fakeUser) })

    hoisted.cancelPendingSaves.mockClear()
    hoisted.bumpSimulationGeneration.mockClear()
    hoisted.clearSettingsOnSignOut.mockClear()
    vi.mocked(firebaseAuthModule.signOut).mockClear()

    await act(async () => { await signOutRef.current!() })

    // Cleanup ran exactly once via performSignOutCleanup()
    expect(hoisted.cancelPendingSaves).toHaveBeenCalledTimes(1)
    expect(hoisted.bumpSimulationGeneration).toHaveBeenCalledTimes(1)
    expect(hoisted.clearSettingsOnSignOut).toHaveBeenCalledTimes(1)
    expect(firebaseAuthModule.signOut).toHaveBeenCalledTimes(1)

    // Order: cleanup must precede signOut (E1/E2 fix — credentials revoked AFTER cancel)
    const cancelOrder = hoisted.cancelPendingSaves.mock.invocationCallOrder[0]
    const signOutOrder = vi.mocked(firebaseAuthModule.signOut).mock.invocationCallOrder[0]
    expect(cancelOrder).toBeLessThan(signOutOrder)

    // Firebase fires onAuthStateChanged(null) after signOut() resolves
    await act(async () => { fire(null) })

    // Guard (previousUserRef.current === null) blocks the fallback from re-running
    expect(hoisted.cancelPendingSaves).toHaveBeenCalledTimes(1)
    expect(hoisted.bumpSimulationGeneration).toHaveBeenCalledTimes(1)
    expect(hoisted.clearSettingsOnSignOut).toHaveBeenCalledTimes(1)
  })

  it('handleSignOut: no-op when no current user (path 1 guard)', async () => {
    const signOutRef: { current: (() => Promise<void>) | null } = { current: null }
    function Consumer() {
      const { signOut } = useAuth()
      useEffect(() => { signOutRef.current = signOut }, [signOut])
      return null
    }
    render(<AuthProvider><Consumer /></AuthProvider>)
    hoisted.mutableAuth.currentUser = null

    await act(async () => { await signOutRef.current!() })

    expect(hoisted.cancelPendingSaves).not.toHaveBeenCalled()
    expect(firebaseAuthModule.signOut).not.toHaveBeenCalled()
  })

  it('ToS-mismatch path (path 2): runs performSignOutCleanup BEFORE signOut', async () => {
    vi.mocked(tosModule.isTosCached).mockReturnValueOnce(false)
    vi.mocked(tosModule.checkFirestoreTos).mockResolvedValueOnce('outdated')
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(fakeUser) })

    await waitFor(() => {
      expect(hoisted.cancelPendingSaves).toHaveBeenCalledTimes(1)
      expect(hoisted.bumpSimulationGeneration).toHaveBeenCalledTimes(1)
      expect(hoisted.clearSettingsOnSignOut).toHaveBeenCalledTimes(1)
      expect(firebaseAuthModule.signOut).toHaveBeenCalledTimes(1)
    })

    // Order: cleanup must precede signOut on this path too
    const cancelOrder = hoisted.cancelPendingSaves.mock.invocationCallOrder[0]
    const signOutOrder = vi.mocked(firebaseAuthModule.signOut).mock.invocationCallOrder[0]
    expect(cancelOrder).toBeLessThan(signOutOrder)
  })
})
