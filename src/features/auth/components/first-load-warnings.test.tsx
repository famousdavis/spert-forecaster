// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40 (R10, O1): the four exits that remove this browser's copy of the
// user's cloud projects — the Local switch and Sign out, in Settings and in the
// header's Cloud Storage window — warn first and offer a backup, exactly while
// the first cloud load has not succeeded, and behave as before everywhere else.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

const H = vi.hoisted(() => ({
  user: { uid: 'u1', email: 'a@example.com', displayName: 'A' } as unknown,
  mode: 'cloud' as 'local' | 'cloud',
  signOut: vi.fn(),
  setMode: vi.fn(),
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: H.user, isFirebaseAvailable: true, signOut: H.signOut }),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: H.mode, setMode: H.setMode, isFirebaseAvailable: true }),
}))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
vi.mock('@/shared/firebase/firestore-migration', () => ({ migrateLocalToCloud: vi.fn() }))
vi.mock('@/features/projects/lib/export-backup', () => ({ exportWorkspaceBackup: vi.fn() }))
vi.mock('./SignInButtons', () => ({ SignInButtons: () => null }))
vi.mock('./UploadConfirmPanel', () => ({ UploadConfirmPanel: () => null }))

import { StorageModeSection } from './StorageModeSection'
import { CloudStorageModal } from './CloudStorageModal'
import { isInsideFirstCloudLoadWindow } from '../hooks/useFirstCloudLoadWindow'
import { exportWorkspaceBackup } from '@/features/projects/lib/export-backup'
import { useProjectStore } from '@/shared/state/project-store'

const TS = '2026-01-01T00:00:00.000Z'
const T4 = "Switching to local storage removes this browser's copy of your cloud projects. Your projects in the cloud are not affected. Export a backup first if you want to keep this copy."
const T5 = "Signing out removes this browser's copy of your cloud projects. Your projects in the cloud are not affected. Export a backup first if you want to keep this copy."
const TODAY_LOCAL = "Any projects created only in cloud mode won't be accessible in local storage. Your cloud data will remain in Firebase but won't sync until you switch back."

const dialog = () => screen.queryByRole('alertdialog')
const dialogButtons = () => [...(dialog()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)
const click = (el: Element) => act(async () => { fireEvent.click(el) })

beforeEach(() => {
  vi.clearAllMocks()
  H.mode = 'cloud'
  H.user = { uid: 'u1', email: 'a@example.com', displayName: 'A' }
  useProjectStore.setState({
    projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS }],
    sprints: [],
    cloudDataLoaded: false,
  })
})
afterEach(() => cleanup())

const surfaces = [
  {
    name: 'Settings → Storage',
    mount: () => render(<StorageModeSection />),
    localRadio: () => screen.getByRole('radio', { name: 'Local' }),
    signOutButton: () => screen.getByRole('button', { name: 'Sign out' }),
  },
  {
    name: 'the Cloud Storage window',
    mount: () => render(<CloudStorageModal isOpen onClose={() => {}} />),
    localRadio: () => screen.getByRole('radio', { name: 'Local (browser only)' }),
    signOutButton: () => screen.getByRole('button', { name: 'Sign out' }),
  },
]

describe.each(surfaces)('inside the first-load window — $name', (surface) => {
  it('the Local switch warns with T4, offers the backup without closing, and Cancel changes nothing', async () => {
    surface.mount()
    await click(surface.localRadio())
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Switch to local storage?')
    expect(dialog()?.querySelector('p')?.textContent).toBe(T4)
    expect(dialogButtons()).toEqual(['Export a backup', 'Switch anyway', 'Cancel'])
    await click(screen.getByRole('button', { name: 'Export a backup' }))
    expect(vi.mocked(exportWorkspaceBackup)).toHaveBeenCalledTimes(1)
    expect(dialog()).not.toBeNull()
    await click(screen.getByRole('button', { name: 'Cancel' }))
    expect(dialog()).toBeNull()
    expect(H.setMode).not.toHaveBeenCalled()
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })

  it('Switch anyway runs today\'s switch: the copy is cleared and the mode becomes local', async () => {
    surface.mount()
    await click(surface.localRadio())
    await click(screen.getByRole('button', { name: 'Switch anyway' }))
    expect(useProjectStore.getState().projects).toHaveLength(0)
    expect(H.setMode).toHaveBeenCalledWith('local')
  })

  it('Sign out warns with T5 first; Sign out anyway signs out', async () => {
    surface.mount()
    await click(surface.signOutButton())
    expect(H.signOut).not.toHaveBeenCalled()
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Sign out?')
    expect(dialog()?.querySelector('p')?.textContent).toBe(T5)
    expect(dialogButtons()).toEqual(['Export a backup', 'Sign out anyway', 'Cancel'])
    await click(screen.getByRole('button', { name: 'Sign out anyway' }))
    expect(H.signOut).toHaveBeenCalledTimes(1)
  })
})

describe.each(surfaces)('outside the window, nothing changes — $name (known-bad: the warnings shown always)', (surface) => {
  beforeEach(() => { useProjectStore.setState({ cloudDataLoaded: true }) })

  it('the Local switch shows today\'s dialog', async () => {
    surface.mount()
    await click(surface.localRadio())
    expect(dialog()?.querySelector('p')?.textContent).toBe(TODAY_LOCAL)
    expect(dialogButtons()).toEqual(['Stay in Cloud', 'Switch to Local'])
  })

  it('Sign out signs out at once', async () => {
    surface.mount()
    await click(surface.signOutButton())
    expect(dialog()).toBeNull()
    expect(H.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('the window (O1): cloud mode, signed in, first load not yet succeeded (known-bad: warnings never shown)', () => {
  it('is exactly that conjunction', () => {
    expect(isInsideFirstCloudLoadWindow({ mode: 'cloud', signedIn: true, cloudDataLoaded: false })).toBe(true)
    expect(isInsideFirstCloudLoadWindow({ mode: 'cloud', signedIn: true, cloudDataLoaded: true })).toBe(false)
    expect(isInsideFirstCloudLoadWindow({ mode: 'local', signedIn: true, cloudDataLoaded: false })).toBe(false)
    expect(isInsideFirstCloudLoadWindow({ mode: 'cloud', signedIn: false, cloudDataLoaded: false })).toBe(false)
  })
})
