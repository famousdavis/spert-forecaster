// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.50.2: one Escape in a confirmation opened over the Cloud Storage window closes that
// confirmation and nothing else. Before, the window's own Escape listener closed the window
// too, whichever of the two document listeners ran first (both orders happen: AppShell passes
// an inline onClose, so the window's listener is re-registered behind the confirmation's
// whenever AppShell re-renders). The window cannot be opened signed in without Firebase, so
// this is measured here in jsdom, not in a browser.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, createEvent, cleanup, act } from '@testing-library/react'

const H = vi.hoisted(() => ({
  mode: 'cloud' as 'local' | 'cloud',
  signOut: vi.fn(),
  setMode: vi.fn(),
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'a@example.com', displayName: 'A' }, isFirebaseAvailable: true, signOut: H.signOut }),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: H.mode, setMode: H.setMode, isFirebaseAvailable: true }),
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
vi.mock('@/features/projects/lib/export-backup', () => ({ exportWorkspaceBackup: vi.fn() }))
vi.mock('./SignInButtons', () => ({ SignInButtons: () => null }))
vi.mock('./UploadConfirmPanel', () => ({ UploadConfirmPanel: () => null }))

import { CloudStorageModal } from './CloudStorageModal'
import { useProjectStore } from '@/shared/state/project-store'

const TS = '2026-01-01T00:00:00.000Z'

function setFirstLoadDone(done: boolean) {
  useProjectStore.setState({
    projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS }],
    sprints: [],
    cloudDataLoaded: done,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  H.mode = 'cloud'
})
afterEach(() => cleanup())

const confirmation = () => screen.queryByRole('alertdialog')
const cloudWindow = () => screen.queryByRole('dialog', { name: 'Cloud Storage' })

function escape() {
  const event = createEvent.keyDown(document.body, { key: 'Escape' })
  act(() => {
    fireEvent(document.body, event)
  })
  return event
}

const NESTED = [
  {
    name: 'Switch to local storage? (outside the first-load window)',
    firstLoadDone: true,
    open: () => fireEvent.click(screen.getByRole('radio', { name: 'Local (browser only)' })),
  },
  {
    name: 'Switch to local storage? (inside the first-load window)',
    firstLoadDone: false,
    open: () => fireEvent.click(screen.getByRole('radio', { name: 'Local (browser only)' })),
  },
  {
    name: 'the sign-out warning (inside the first-load window)',
    firstLoadDone: false,
    open: async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
      })
    },
  },
]

// The window's listener first: it was registered before the confirmation's, which re-registers
// on every render (an inline onCancel). The confirmation's first: the window's is re-registered
// after the confirmation opened, as an AppShell re-render does with its inline onClose.
const ORDERS = ['the window first', 'the confirmation first'] as const

describe.each(NESTED)('one Escape in $name', (nested) => {
  it.each(ORDERS)('closes only the confirmation, and marks the Escape handled (listener order: %s)', async (order) => {
    setFirstLoadDone(nested.firstLoadDone)
    const onClose = vi.fn()
    // Inline, as AppShell passes it: each render hands the window a new onClose.
    const { rerender } = render(<CloudStorageModal isOpen onClose={() => onClose()} />)
    await nested.open()
    expect(confirmation()).not.toBeNull()
    // A new onClose re-registers the window's listener in the same commit as the confirmation's,
    // and after it (a child's effects run first), so the window's now runs second.
    if (order === 'the confirmation first') rerender(<CloudStorageModal isOpen onClose={() => onClose()} />)

    const event = escape()

    expect(confirmation()).toBeNull()
    expect(cloudWindow()).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    // Nothing the confirmation guards ran.
    expect(H.setMode).not.toHaveBeenCalled()
    expect(H.signOut).not.toHaveBeenCalled()

    // The next Escape is the window's again.
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('control: the window without a confirmation', () => {
  it('one Escape closes it and is marked handled', () => {
    setFirstLoadDone(true)
    const onClose = vi.fn()
    render(<CloudStorageModal isOpen onClose={onClose} />)
    expect(confirmation()).toBeNull()
    const event = escape()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })
})
