// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import type { User } from 'firebase/auth'

// Inline mirror of the guard logic used inside AuthProvider's
// onAuthStateChanged callback. Pure function — no React, Firebase, or
// Zustand involvement. Verifies the sign-out cleanup branch fires only
// on a true User → null transition.
function shouldRunSignOutCleanup(
  previous: User | null | undefined,
  next: User | null,
): boolean {
  return next === null && previous !== undefined && previous !== null
}

const fakeUser = { uid: 'u1' } as unknown as User

describe('shouldRunSignOutCleanup', () => {
  it('returns false for cold-load local-only user (undefined → null)', () => {
    expect(shouldRunSignOutCleanup(undefined, null)).toBe(false)
  })

  it('returns true for explicit sign-out (User → null)', () => {
    expect(shouldRunSignOutCleanup(fakeUser, null)).toBe(true)
  })

  it('returns false for duplicate null events (null → null)', () => {
    expect(shouldRunSignOutCleanup(null, null)).toBe(false)
  })

  it('returns false for a positive auth event (undefined → User)', () => {
    expect(shouldRunSignOutCleanup(undefined, fakeUser)).toBe(false)
  })
})
