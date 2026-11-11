// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus in the sign-in consent modal (v0.50.3, F5). It opens on Cancel, as before; it closes by
// unmounting, and focus now goes back to the sign-in button that opened it, by every way out.
// Sign-in needs Firebase, so this is jsdom only, through the real SignInButtons.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'

const H = vi.hoisted(() => ({ google: vi.fn(async () => {}) }))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, isFirebaseAvailable: true }) }))
vi.mock('@/shared/firebase/auth', () => ({ signInWithGoogle: H.google, signInWithMicrosoft: vi.fn(async () => {}) }))
vi.mock('@/features/auth/lib/tos', () => ({
  TOS_URL: 'https://example.com/tos',
  PRIVACY_URL: 'https://example.com/privacy',
  isTosCached: () => false,
  cacheTos: vi.fn(),
  setPendingWrite: vi.fn(),
}))

import { SignInButtons } from './SignInButtons'

beforeEach(() => H.google.mockClear())
afterEach(() => cleanup())

const google = () => screen.getByRole('button', { name: 'Sign in with Google' })
const modal = () => screen.queryByRole('dialog', { name: 'Enable Cloud Storage' })
const focused = () => document.activeElement
/** Focus the sign-in button and press it, as a keyboard user does. */
function openFromGoogle() {
  render(<SignInButtons fullLabel />)
  google().focus()
  fireEvent.click(google())
  expect(modal()).not.toBeNull()
  expect(focused()?.textContent).toBe('Cancel')
}

describe('the sign-in consent modal returns focus to its sign-in button (known-bad: <body>)', () => {
  it.each([
    ['Cancel', () => fireEvent.click(within(modal()!).getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
  ])('%s', (_how, close) => {
    openFromGoogle()
    close()
    expect([modal(), focused(), H.google.mock.calls.length]).toEqual([null, google(), 0])
  })

  it('agreed and enabled: the sign-in goes ahead, and focus is back on its button', async () => {
    openFromGoogle()
    fireEvent.click(within(modal()!).getByRole('checkbox'))
    await act(async () => {
      fireEvent.click(within(modal()!).getByRole('button', { name: 'Enable Cloud Storage' }))
    })
    expect([modal(), focused(), H.google.mock.calls.length]).toEqual([null, google(), 1])
  })
})
