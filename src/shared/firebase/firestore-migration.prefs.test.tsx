// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The local → cloud upload's tile colours and archives (v0.50.0), through the real migration,
// the real driver and the real stores, against a fake that honours `mergeFields`
// (`__fakes__/mergefields-firestore.ts`). It writes exactly the uploaded projects' entries, under
// their cloud ids, both fields masked; every other cloud entry stays. A refused prefs write is an
// upload error, so the panel keeps the mode local and the local map is intact.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import('./__fakes__/mergefields-firestore').createMergeFieldsFirestore> }))

vi.mock('./config', () => ({ db: { __db: true }, auth: null, isFirebaseAvailable: true }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('./profileWrites', () => ({ upsertProfile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('firebase/firestore', async () => {
  const mod = await import('./__fakes__/mergefields-firestore')
  fake.current = mod.createMergeFieldsFirestore()
  return {
    collection: vi.fn(),
    doc: (...args: [unknown, string, string]) => fake.current.doc(...args),
    getDoc: (ref: { path: string }) => fake.current.getDoc(ref),
    getDocs: vi.fn(),
    getDocsFromServer: vi.fn(),
    setDoc: (...args: Parameters<typeof fake.current.setDoc>) => fake.current.setDoc(...args),
    deleteDoc: vi.fn(),
    deleteField: () => fake.current.deleteField(),
    FieldPath: mod.FakeFieldPath,
    onSnapshot: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
  }
})

import { migrateLocalToCloud } from './firestore-migration'
import { UploadConfirmPanel } from '@/features/auth/components/UploadConfirmPanel'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { getStorageMode, STORAGE_MODE_KEY } from '@/shared/state/storage'
import type { ProjectPrefs } from '@/shared/lib/project-prefs'
import type { Project } from '@/shared/types'

const SETTINGS_PATH = 'spertforecaster_settings/u1'
const PROFILE = { displayName: 'U', email: 'u@example.com', photoURL: null, lastSignIn: '2026-11-10T00:00:00Z' }
const project = (id: string): Project => ({ id, name: `Project ${id}`, unitOfMeasure: 'pts', createdAt: 't', updatedAt: 't' })
const cloudPrefs = () => ((fake.current.docs.get(SETTINGS_PATH) ?? {}) as { projectPrefs?: Record<string, unknown> }).projectPrefs ?? {}
const prefsWrites = () => fake.current.writes.filter((w) => w.path === SETTINGS_PATH && w.mask?.some((m) => m[0] === 'projectPrefs'))

function seedLocal(ids: string[], projectPrefs: ProjectPrefs) {
  useProjectStore.setState({ projects: ids.map(project), sprints: [], _originRef: 'o', _changeLog: [] })
  useSettingsStore.setState({ projectPrefs, _isCloudUpdate: false })
}

beforeEach(() => {
  fake.current.reset()
  localStorage.clear()
  localStorage.setItem(STORAGE_MODE_KEY, 'local')
})
afterEach(() => cleanup())

describe('migrateLocalToCloud: the uploaded projects\' entries, and no others', () => {
  it('writes each uploaded project\'s entry under its id, both fields masked, in one immediate write', async () => {
    seedLocal(['a', 'b'], { a: { color: 'teal', archived: true }, b: { color: 'pink' } })
    const result = await migrateLocalToCloud('u1', PROFILE)
    expect(result.errors).toEqual([])
    expect(result.settingsUploaded).toBe(true)
    expect(prefsWrites()).toHaveLength(1)
    expect(prefsWrites()[0].mask).toEqual([
      ['projectPrefs', 'a', 'color'],
      ['projectPrefs', 'a', 'archived'],
      ['projectPrefs', 'b', 'color'],
      ['projectPrefs', 'b', 'archived'],
    ])
    expect(cloudPrefs()).toEqual({ a: { color: 'teal', archived: true }, b: { color: 'pink' } })
  })

  it("clears the cloud's archived when the local entry holds only a colour, and clears an uploaded project's cloud entry when it has none locally", async () => {
    fake.current.docs.set(SETTINGS_PATH, { projectPrefs: { a: { color: 'slate', archived: true }, b: { color: 'blue', archived: true } } })
    seedLocal(['a', 'b'], { a: { color: 'teal' } })
    const result = await migrateLocalToCloud('u1', PROFILE)
    expect(result.errors).toEqual([])
    expect(cloudPrefs()).toEqual({ a: { color: 'teal' }, b: {} })
  })

  it('re-keys an entry whose project was given a new id in the cloud, and leaves the colliding cloud project\'s entry alone', async () => {
    // `a` already exists in the cloud (someone's), so the upload gives the local `a` a new id.
    fake.current.docs.set('spertforecaster_projects/a', { name: 'theirs' })
    fake.current.docs.set(SETTINGS_PATH, { projectPrefs: { a: { color: 'slate' } } })
    seedLocal(['a'], { a: { color: 'pink', archived: true } })
    const result = await migrateLocalToCloud('u1', PROFILE)
    const newId = [...fake.current.docs.keys()].find((k) => k.startsWith('spertforecaster_projects/') && k !== 'spertforecaster_projects/a')!.split('/')[1]
    expect(newId).toBeTruthy()
    expect(result.errors.some((e) => e.includes('assigned new ID'))).toBe(true)
    expect(cloudPrefs()).toEqual({ a: { color: 'slate' }, [newId]: { color: 'pink', archived: true } })
  })

  it('leaves a cloud entry UNCHANGED when a stale local entry sits under that live cloud id (a cloud→local switch keeps the map)', async () => {
    fake.current.docs.set(SETTINGS_PATH, { projectPrefs: { live: { color: 'teal' } } })
    // `live` is no project here any more (the switch cleared the projects), but its old entry stayed.
    seedLocal(['mine'], { live: { color: 'pink', archived: true }, mine: { color: 'blue' } })
    await migrateLocalToCloud('u1', PROFILE)
    expect(cloudPrefs()).toEqual({ live: { color: 'teal' }, mine: { color: 'blue' } })
    expect(prefsWrites()[0].mask?.map((m) => m[1])).toEqual(['mine', 'mine'])
  })

  it("a project whose upload FAILED keeps its entry out of the cloud: the prefs write masks only the other project's two paths (GAP-1)", async () => {
    seedLocal(['a', 'b'], { a: { color: 'teal', archived: true }, b: { color: 'pink' } })
    fake.current.refuseWhen((path) => (path === 'spertforecaster_projects/a' ? new Error('permission-denied') : null))
    const result = await migrateLocalToCloud('u1', PROFILE)
    expect(result.errors.some((e) => e.includes('Failed to upload project "Project a"'))).toBe(true)
    expect(prefsWrites()).toHaveLength(1)
    expect(prefsWrites()[0].mask).toEqual([
      ['projectPrefs', 'b', 'color'],
      ['projectPrefs', 'b', 'archived'],
    ])
    expect(cloudPrefs()).toEqual({ b: { color: 'pink' } })
  })

  it('the seven ordinary settings never carry the map', async () => {
    seedLocal(['a'], { a: { color: 'teal' } })
    await migrateLocalToCloud('u1', PROFILE)
    const ordinary = fake.current.writes.filter((w) => w.path === SETTINGS_PATH && !w.mask?.some((m) => m[0] === 'projectPrefs'))
    expect(ordinary).toHaveLength(1)
    expect(ordinary[0].mask?.flat()).not.toContain('projectPrefs')
  })

  it('a refused prefs write is an upload error, and settings are not counted as uploaded', async () => {
    seedLocal(['a'], { a: { color: 'teal' } })
    fake.current.refuseWhen((path, data) =>
      path === SETTINGS_PATH && typeof data === 'object' && data !== null && 'projectPrefs' in data ? new Error('permission-denied') : null,
    )
    const result = await migrateLocalToCloud('u1', PROFILE)
    expect(result.settingsUploaded).toBe(false)
    expect(result.errors.some((e) => e.includes('Tile colours and archive upload failed'))).toBe(true)
  })
})

describe('UploadConfirmPanel with the real migration', () => {
  function Harness() {
    return (
      <UploadConfirmPanel
        uid="u1"
        displayName="U"
        email="u@example.com"
        photoURL={null}
        projectCount={1}
        // The callers' onSuccess flips the storage mode; this one does the same.
        onSuccess={() => localStorage.setItem(STORAGE_MODE_KEY, 'cloud')}
        onCancel={() => {}}
      />
    )
  }

  it('a REFUSED prefs write keeps the mode local and the local map intact', async () => {
    seedLocal(['a'], { a: { color: 'teal', archived: true } })
    fake.current.refuseWhen((path, data) =>
      path === SETTINGS_PATH && typeof data === 'object' && data !== null && 'projectPrefs' in data ? new Error('permission-denied') : null,
    )
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload to Cloud' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Tile colours and archive upload failed')
    expect(getStorageMode()).toBe('local')
    expect(useSettingsStore.getState().projectPrefs).toEqual({ a: { color: 'teal', archived: true } })
  })

  it('MUST-DIFFER: a successful one switches', async () => {
    seedLocal(['a'], { a: { color: 'teal', archived: true } })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload to Cloud' }))
    await waitFor(() => expect(getStorageMode()).toBe('cloud'))
    expect(cloudPrefs()).toEqual({ a: { color: 'teal', archived: true } })
  })
})
