// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus in the Cloud Storage window (v0.50.3, F6). Open: the window itself, so its title is read
// (before: focus stayed behind it, on the header button). Closed: back to the header's account
// button. Signing out swaps that button for another element, so AppShell passes `returnFocusTo`
// to read the one shown THEN; the opener alone would be a detached element. The signed-in paths
// need Firebase, so this is jsdom only (the signed-out window is also checked in a browser).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'

const H = vi.hoisted(() => ({
  user: null as { uid: string; email: string; displayName: string } | null,
  mode: 'local' as 'local' | 'cloud',
  setMode: vi.fn(),
  /** Set by the page below: what signing out does to the header. */
  onSignOut: () => {},
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: H.user, isFirebaseAvailable: true, signOut: async () => H.onSignOut() }),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: H.mode, setMode: H.setMode, isFirebaseAvailable: true }),
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
vi.mock('@/features/projects/lib/export-backup', () => ({ exportWorkspaceBackup: vi.fn() }))
vi.mock('./SignInButtons', () => ({ SignInButtons: () => <button>Sign in with Google</button> }))
vi.mock('./UploadConfirmPanel', () => ({ UploadConfirmPanel: () => null }))

import { CloudStorageModal } from './CloudStorageModal'
import { useProjectStore } from '@/shared/state/project-store'

const T = '2026-01-01T00:00:00.000Z'
const SIGNED_IN = { uid: 'u1', email: 'a@example.com', displayName: 'A' }

beforeEach(() => {
  H.user = null
  H.mode = 'local'
  H.onSignOut = () => {}
  useProjectStore.setState({ projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }], sprints: [], cloudDataLoaded: true })
})
afterEach(() => cleanup())

/**
 * The header, as AppShell has it: one account button, which signing out REPLACES (UserMenu
 * renders a different <button> signed in and signed out), and the window.
 */
function Page({ withReturn = true }: { withReturn?: boolean }) {
  const [open, setOpen] = useState(false)
  const [signedIn, setSignedIn] = useState(H.user !== null)
  useEffect(() => {
    H.onSignOut = () => setSignedIn(false)
  }, [])
  const headerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      {signedIn ? (
        <button key="in" ref={headerRef} onClick={() => setOpen(true)}>Account menu</button>
      ) : (
        <button key="out" ref={headerRef} onClick={() => setOpen(true)}>Sign in</button>
      )}
      <CloudStorageModal isOpen={open} onClose={() => setOpen(false)} returnFocusTo={withReturn ? () => headerRef.current : undefined} />
    </>
  )
}

const button = (name: string) => screen.getByRole('button', { name })
const cloudWindow = () => screen.queryByRole('dialog', { name: 'Cloud Storage' })
const focused = () => document.activeElement
/** Focus the header button and press it, as a keyboard user does. */
function openFrom(name: string) {
  button(name).focus()
  fireEvent.click(button(name))
  expect(cloudWindow()).not.toBeNull()
}

describe('opening: focus goes to the window itself (known-bad: it stayed on the header button)', () => {
  it('the window has focus, and its title names it', () => {
    render(<Page />)
    openFrom('Sign in')
    expect(focused()).toBe(cloudWindow())
  })
})

describe('closing: back to the header\'s account button (known-bad: <body>)', () => {
  // Each starts with focus INSIDE the window, on its Close (one Tab from the window), as a
  // keyboard user's would be; a click in jsdom moves no focus, so without this a window that
  // never took focus would pass. The backdrop: Chrome moves focus to <body> on a mousedown on
  // something that cannot take focus, before the click closes the window.
  const tabToClose = () => within(cloudWindow()!).getByRole('button', { name: 'Close' }).focus()
  it.each([
    ['Close', () => fireEvent.click(within(cloudWindow()!).getByRole('button', { name: 'Close' }))],
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
    ['the backdrop', () => {
      ;(document.activeElement as HTMLElement).blur()
      fireEvent.click(cloudWindow()!.previousElementSibling!)
    }],
  ])('%s', (_how, close) => {
    render(<Page />)
    openFrom('Sign in')
    tabToClose()
    close()
    expect([cloudWindow(), focused()]).toEqual([null, button('Sign in')])
  })

  it('opened by a click that moves no focus (Safari, Firefox on macOS): still the header button', () => {
    render(<Page />)
    expect(focused()).toBe(document.body)
    fireEvent.click(button('Sign in'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect([cloudWindow(), focused()]).toEqual([null, button('Sign in')])
  })

  it('without returnFocusTo: back to what opened it', () => {
    render(<Page withReturn={false} />)
    openFrom('Sign in')
    tabToClose()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(focused()).toBe(button('Sign in'))
  })
})

describe('signing out closes the window and swaps the header button', () => {
  beforeEach(() => {
    H.user = SIGNED_IN
    H.mode = 'cloud'
  })

  it('focus goes to the button shown now (returnFocusTo, as AppShell passes it)', async () => {
    render(<Page />)
    openFrom('Account menu')
    await act(async () => {
      fireEvent.click(within(cloudWindow()!).getByRole('button', { name: 'Sign out' }))
    })
    expect([cloudWindow(), screen.queryByRole('button', { name: 'Account menu' }), focused()]).toEqual([null, null, button('Sign in')])
  })

  it('control: with only the opener, focus is lost, which is why AppShell passes returnFocusTo', async () => {
    render(<Page withReturn={false} />)
    openFrom('Account menu')
    await act(async () => {
      fireEvent.click(within(cloudWindow()!).getByRole('button', { name: 'Sign out' }))
    })
    expect([cloudWindow(), focused()]).toEqual([null, document.body])
  })
})

describe('a confirmation over the window keeps its own focus rule (v0.50.2)', () => {
  it('Switch to local, cancelled: back to the Local radio in the window; then Escape: the header button', () => {
    H.user = SIGNED_IN
    H.mode = 'cloud'
    render(<Page />)
    openFrom('Account menu')
    const local = screen.getByRole('radio', { name: 'Local (browser only)' })
    local.focus()
    fireEvent.click(local)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Stay in Cloud' }))
    expect([cloudWindow() !== null, focused()]).toEqual([true, local])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect([cloudWindow(), focused()]).toEqual([null, button('Account menu')])
  })
})
