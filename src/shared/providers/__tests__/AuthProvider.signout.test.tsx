// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { User } from 'firebase/auth'

// --- Module mocks ---
//
// Capture the onAuthStateChanged callback synchronously via a hoisted ref so
// each test can drive auth-state transitions directly. All Firebase, store,
// and ToS dependencies are stubbed — this test asserts only on mock call
// counts to verify the previousUserRef guard is wired correctly inside
// AuthProvider's listener.

const hoisted = vi.hoisted(() => ({
  capturedCallback: null as ((user: User | null) => void) | null,
  clearProjectsOnSignOut: vi.fn(),
  setMode: vi.fn(),
  cancelPendingSaves: vi.fn(),
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
  auth: {},
  isFirebaseAvailable: true,
  functionsInstance: null,
}))

vi.mock('@/shared/firebase/auth', () => ({
  checkRedirectResult: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(),
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
  isTosCached: () => true,
  cacheTos: vi.fn(),
  clearTosCache: vi.fn(),
  hasPendingWrite: () => false,
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

// Imported AFTER mocks so its deps resolve to the stand-ins above.
import { AuthProvider } from '../AuthProvider'

const fakeUser = { uid: 'u1', providerData: [{ providerId: 'google.com' }] } as unknown as User

function fire(user: User | null) {
  if (!hoisted.capturedCallback) throw new Error('onAuthStateChanged callback was not captured')
  hoisted.capturedCallback(user)
}

describe('AuthProvider sign-out guard', () => {
  beforeEach(() => {
    hoisted.capturedCallback = null
    hoisted.clearProjectsOnSignOut.mockClear()
    hoisted.setMode.mockClear()
    hoisted.cancelPendingSaves.mockClear()
  })

  it('initial null does not call clearProjectsOnSignOut', async () => {
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(null) })

    expect(hoisted.clearProjectsOnSignOut).not.toHaveBeenCalled()
    expect(hoisted.cancelPendingSaves).not.toHaveBeenCalled()
  })

  it('User → null calls clearProjectsOnSignOut', async () => {
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(fakeUser) })
    await act(async () => { fire(null) })

    expect(hoisted.clearProjectsOnSignOut).toHaveBeenCalledTimes(1)
    expect(hoisted.cancelPendingSaves).toHaveBeenCalledTimes(1)
    expect(hoisted.setMode).toHaveBeenCalledWith('local')
  })

  it('null → null does not double-call clearProjectsOnSignOut', async () => {
    render(<AuthProvider><div /></AuthProvider>)
    await act(async () => { fire(fakeUser) })
    await act(async () => { fire(null) })

    hoisted.clearProjectsOnSignOut.mockClear()
    hoisted.cancelPendingSaves.mockClear()
    hoisted.setMode.mockClear()

    await act(async () => { fire(null) })

    expect(hoisted.clearProjectsOnSignOut).not.toHaveBeenCalled()
  })
})
