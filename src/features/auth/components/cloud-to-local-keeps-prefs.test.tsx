// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.50.0: both cloud→local switches clear the projects and KEEP this person's tile colours and
// archive, and Export Attribution with them. The documented workflow is Export, switch to local,
// Import (StorageModeSection's comment), and D34 then gives the restored projects their colours
// back. Only sign-out and an account change clear the map (settings-store.prefs.test.ts and
// useCloudSync.snapshots.test.ts V1-U7).

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'u@example.com', displayName: 'U', photoURL: null },
    isFirebaseAvailable: true,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithMicrosoft: vi.fn(),
  }),
}))
vi.mock('@/shared/firebase/config', () => ({ isFirebaseAvailable: true, db: null, auth: null }))

import { StorageModeSection } from './StorageModeSection'
import { CloudStorageModal } from './CloudStorageModal'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'

const PREFS = { p1: { color: 'teal' as const, archived: true as const }, p2: { color: 'pink' as const } }

beforeEach(() => {
  useStorageModeStore.setState({ mode: 'cloud' })
  useProjectStore.setState({
    projects: [{ id: 'p1', name: 'Alpha', unitOfMeasure: 'pts', createdAt: 't', updatedAt: 't' }],
    sprints: [],
    cloudDataLoaded: true,
  })
  useSettingsStore.setState({ projectPrefs: PREFS, exportName: 'Jane', exportId: 'J-1' })
})
afterEach(() => cleanup())

/** The Local radio: by its label text, which both components start with "Local". */
function switchToLocal() {
  const local = screen.getAllByRole('radio').find((r) => r.closest('label')?.textContent?.trim().startsWith('Local'))
  expect(local).toBeDefined()
  fireEvent.click(local!)
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Local' }))
}

describe.each([
  ['Settings → Storage (StorageModeSection)', () => render(<StorageModeSection />)],
  ['the Cloud Storage dialog (CloudStorageModal)', () => render(<CloudStorageModal isOpen onClose={() => {}} />)],
])('%s: switching from cloud to local', (_where, mount) => {
  it('clears the projects and keeps the map and Export Attribution', () => {
    mount()
    switchToLocal()
    expect(useStorageModeStore.getState().mode).toBe('local')
    expect(useProjectStore.getState().projects).toEqual([])
    const s = useSettingsStore.getState()
    expect([s.projectPrefs, s.exportName, s.exportId]).toEqual([PREFS, 'Jane', 'J-1'])
  })
})
