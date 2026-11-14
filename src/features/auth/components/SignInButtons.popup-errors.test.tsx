// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.50.10: a popup error reaches the person instead of starting a redirect sign-in that cannot
// finish. Before, auth.ts answered auth/popup-blocked and auth/cancelled-popup-request with
// signInWithRedirect. The redirect reads its result through an iframe on the authDomain
// (spert-suite.firebaseapp.com); browsers that partition third-party storage give that iframe an
// empty storage area, so the person came back signed out with no message (measured 2026-11-14 on
// forecaster.spertsuite.com, v0.50.9). A double-click was enough: the SDK cancels the first popup
// with auth/cancelled-popup-request when a second one starts.
//
// This runs the REAL auth.ts, SignInButtons, sign-in-errors and ConsentModal. Only the Firebase
// SDK, the Firebase app instance and the auth context are fakes, so a fallback re-added to
// auth.ts calls the fake signInWithRedirect and these cases fail.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

const H = vi.hoisted(() => ({
  popup: vi.fn(),
  redirect: vi.fn(async () => {}),
}))

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    addScope() {}
  },
  OAuthProvider: class {
    providerId: string
    constructor(id: string) {
      this.providerId = id
    }
    setCustomParameters() {}
  },
  signInWithPopup: H.popup,
  signInWithRedirect: H.redirect,
  getRedirectResult: vi.fn(async () => null),
  signOut: vi.fn(async () => {}),
}))
vi.mock('@/shared/firebase/config', () => ({ auth: {} }))
vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, isFirebaseAvailable: true }),
}))

import { SignInButtons } from './SignInButtons'
import { TOS_LS_KEY, TOS_VERSION } from '@/features/auth/lib/tos'

const POPUP_BLOCKED = 'Allow pop-ups in your browser to sign in.'
const authError = (code: string) => Object.assign(new Error(code), { code })
const BUTTON = { google: 'Sign in with Google', microsoft: 'Sign in with Microsoft' } as const

/** Let every pending promise chain finish: a macrotask runs only after all queued microtasks. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
  H.popup.mockReset()
  H.redirect.mockClear()
  localStorage.clear()
})
afterEach(() => cleanup())

describe('SignInButtons — popup errors (no redirect fallback)', () => {
  it.each(['google', 'microsoft'] as const)(
    'returning user, %s popup blocked: shows the pop-up message and starts no redirect',
    async (provider) => {
      localStorage.setItem(TOS_LS_KEY, TOS_VERSION)
      H.popup.mockRejectedValueOnce(authError('auth/popup-blocked'))
      render(<SignInButtons fullLabel />)

      fireEvent.click(screen.getByRole('button', { name: BUTTON[provider] }))

      expect((await screen.findByRole('alert')).textContent).toBe(POPUP_BLOCKED)
      expect(H.popup).toHaveBeenCalledTimes(1)
      expect(H.redirect).not.toHaveBeenCalled()
    },
  )

  it('first sign-in, through the agreement, popup blocked: shows the pop-up message', async () => {
    H.popup.mockRejectedValueOnce(authError('auth/popup-blocked'))
    render(<SignInButtons fullLabel />)

    fireEvent.click(screen.getByRole('button', { name: BUTTON.google }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Enable Cloud Storage' }))

    expect((await screen.findByRole('alert')).textContent).toBe(POPUP_BLOCKED)
    expect(H.redirect).not.toHaveBeenCalled()
  })

  it('double-click: the cancelled first popup is silent and the page does not leave for a redirect', async () => {
    localStorage.setItem(TOS_LS_KEY, TOS_VERSION)
    H.popup
      .mockRejectedValueOnce(authError('auth/cancelled-popup-request'))
      .mockRejectedValueOnce(authError('auth/popup-blocked'))
    render(<SignInButtons fullLabel />)
    const google = screen.getByRole('button', { name: BUTTON.google })

    fireEvent.click(google)
    fireEvent.click(google)
    await settle()

    expect(H.popup).toHaveBeenCalledTimes(2)
    expect(H.redirect).not.toHaveBeenCalled()
    // Only the second sign-in speaks; the cancelled first one adds nothing.
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([POPUP_BLOCKED])
  })

  it('a popup the person closes is silent and starts no redirect', async () => {
    localStorage.setItem(TOS_LS_KEY, TOS_VERSION)
    H.popup.mockRejectedValueOnce(authError('auth/popup-closed-by-user'))
    render(<SignInButtons fullLabel />)

    fireEvent.click(screen.getByRole('button', { name: BUTTON.google }))
    await settle()

    expect(H.popup).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(H.redirect).not.toHaveBeenCalled()
  })
})
