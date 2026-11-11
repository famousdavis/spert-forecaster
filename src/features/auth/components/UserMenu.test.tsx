// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The header's account button is one of three different <button>s (signed in to the cloud,
// signed in on local storage, signed out). `buttonRef` must name whichever is shown, because the
// Cloud Storage window returns focus to it when it closes (v0.50.3), and signing in or out inside
// the window swaps one for another.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createRef } from 'react'

const H = vi.hoisted(() => ({
  user: null as { uid: string; email: string; displayName: string } | null,
  mode: 'local' as 'local' | 'cloud',
}))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: H.user }) }))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: H.mode }) }))

import { UserMenu } from './UserMenu'

afterEach(() => cleanup())

const SIGNED_IN = { uid: 'u1', email: 'ada@example.com', displayName: 'Ada Lovelace' }

describe('UserMenu buttonRef names the button shown', () => {
  it.each([
    ['signed out', null, 'local', 'Sign in'],
    ['signed in, local storage', SIGNED_IN, 'local', /./],
    ['signed in, cloud storage', SIGNED_IN, 'cloud', 'Account menu'],
  ] as const)('%s', (_state, user, mode, name) => {
    H.user = user
    H.mode = mode
    const ref = createRef<HTMLButtonElement>()
    render(<UserMenu onRequestOpen={() => {}} buttonRef={ref} />)
    const shown = screen.getByRole('button', { name })
    expect([screen.getAllByRole('button').length, ref.current]).toEqual([1, shown])
  })
})
