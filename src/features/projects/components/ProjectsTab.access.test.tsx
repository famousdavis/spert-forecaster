// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Projects tab and the user's access to each project (Brief 39 PR B): the
 * badge beside a read-only project's name, Delete offered to the owner alone
 * (disabled with its reason otherwise), Share only on an explicit owner role
 * (OD-6), the pencil opening a read-only form for a project the user can only
 * view (OD-8), and the project form keeping what was typed when the access drops
 * or a click races the drop (V2).
 *
 * ⚠️ Mounted through a harness that calls the REAL `useImportState`, as
 * AppShell does (see ProjectsTab.test.tsx). The storage mode is the real
 * store, so the UI and the store's guard read the same mode.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

const mockUser = vi.hoisted(() => ({ current: { uid: 'u1' } as { uid: string } | null }))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: mockUser.current }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import type { ProjectAccess } from '@/shared/state/project-access'
import type { Project } from '@/shared/types'
import {
  NOT_IN_CLOUD_REASON,
  OWNER_ONLY_DELETE_REASON,
  VIEW_ONLY_REASON,
} from '@/features/auth/lib/access-texts'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string, name: string, extra: Partial<Project> = {}): Project =>
  ({ id, name, unitOfMeasure: 'pts', createdAt: T, updatedAt: T, ...extra })

function renderTab(projects: Project[], roles: Record<string, ProjectAccess>, opts: { loaded?: boolean; mode?: 'cloud' | 'local' } = {}) {
  useStorageModeStore.setState({ mode: opts.mode ?? 'cloud' })
  useProjectStore.setState({ projects, sprints: [], cloudDataLoaded: opts.loaded ?? true, projectRoles: roles })
  function Harness() {
    return <ProjectsTab importState={useImportState()} />
  }
  return render(<Harness />)
}
const dropTo = (roles: Record<string, ProjectAccess>) => act(() => { useProjectStore.setState({ projectRoles: roles }) })

const described = (el: Element) => {
  const ids = el.getAttribute('aria-describedby')
  return ids === null ? null : ids.split(' ').map((id) => document.getElementById(id)?.textContent ?? '<missing>').join(' ')
}
/** [disabled, tooltip, description] */
const lock = (el: Element) => [(el as HTMLButtonElement).disabled, el.getAttribute('title'), described(el)]
/** The tags of the VISIBLE elements under `root` holding exactly `text`: not hidden, not screen-reader-only. */
const shownTags = (root: Element, text: string) =>
  within(root as HTMLElement).queryAllByText(text).filter((el) => !el.closest('[hidden], .sr-only')).map((el) => el.tagName)
const button = (name: string) => screen.getByRole('button', { name })
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const REAL = useProjectStore.getState()

afterEach(() => {
  cleanup()
  mockUser.current = { uid: 'u1' }
  useProjectStore.setState({ updateProject: REAL.updateProject, projects: [], projectRoles: {}, cloudDataLoaded: false })
  useStorageModeStore.setState({ mode: 'local' })
})

const FIVE = [project('o', 'Own'), project('e', 'Edit'), project('v', 'View'), project('n', 'Gone'), project('u', 'New')]
const FIVE_ROLES: Record<string, ProjectAccess> = { o: 'owner', e: 'editor', v: 'viewer', n: 'not-in-cloud' } // u: no entry

describe('the Projects list (T4/T4b, T3)', () => {
  it('a badge beside each read-only project\'s name, named in its button too (known-bads: no badge; badge on an editable project)', () => {
    renderTab(FIVE, FIVE_ROLES)
    const names = FIVE.map((p) => screen.getByRole('button', { name: new RegExp(`^View history for ${p.name}`) }))
    expect(names.map((b) => [b.getAttribute('aria-label'), b.textContent?.includes('View only') || b.textContent?.includes('Not in cloud')]))
      .toEqual([
        ['View history for Own', false],
        ['View history for Edit', false],
        ['View history for View (View only)', true],
        ['View history for Gone (Not in cloud)', true],
        ['View history for New', false],
      ])
  })

  it('Delete is offered to the owner only, and disabled with its reason otherwise (known-bads: Delete offered to an editor; no reason; reason not described)', () => {
    renderTab(FIVE, FIVE_ROLES)
    expect(FIVE.map((p) => lock(button(`Delete ${p.name}`)))).toEqual([
      [false, 'Delete project', null],
      [true, OWNER_ONLY_DELETE_REASON, OWNER_ONLY_DELETE_REASON],
      [true, OWNER_ONLY_DELETE_REASON, OWNER_ONLY_DELETE_REASON],
      [true, NOT_IN_CLOUD_REASON, NOT_IN_CLOUD_REASON],
      [false, 'Delete project', null], // being created here: no role entry yet
    ])
  })

  it('Edit, Export and Clone stay offered whatever the access (known-bad: a viewer locked out of viewing, exporting or cloning)', () => {
    renderTab(FIVE, FIVE_ROLES)
    const offered = FIVE.flatMap((p) => [`Edit ${p.name}`, `Export ${p.name}`, `Clone ${p.name}`]).map((n) => (button(n) as HTMLButtonElement).disabled)
    expect(offered).toEqual(Array(15).fill(false))
  })

  it('local mode: no badges, every Delete offered (known-bad: roles consulted in local mode)', () => {
    renderTab(FIVE, FIVE_ROLES, { mode: 'local', loaded: false })
    expect([screen.queryByText('View only'), screen.queryByText('Not in cloud')]).toEqual([null, null])
    expect(FIVE.map((p) => (button(`Delete ${p.name}`) as HTMLButtonElement).disabled)).toEqual(Array(5).fill(false))
  })
})

describe('Share: only on an explicit owner role, signed in, loaded (OD-6)', () => {
  it.each([
    ['owner entry, signed in, loaded', { p: 'owner' }, true, true, true],
    ['owner entry, signed out', { p: 'owner' }, false, true, false], // known-bad: no sign-in check
    ['owner entry, first load not done', { p: 'owner' }, true, false, false], // known-bad: no load check
    ['no entry (being created here)', {}, true, true, false], // known-bad: the RESOLVED access used
    ['editor', { p: 'editor' }, true, true, false],
    ['viewer', { p: 'viewer' }, true, true, false],
    ['not-in-cloud', { p: 'not-in-cloud' }, true, true, false],
  ] as const)('%s → shown %s', (_label, roles, signedIn, loaded, shown) => {
    mockUser.current = signedIn ? { uid: 'u1' } : null
    renderTab([project('p', 'Plan')], roles, { loaded })
    expect(screen.queryByRole('button', { name: 'Share project' }) !== null).toBe(shown)
  })
})

describe('the pencil opens a read-only form for a project the user can only view (OD-8)', () => {
  const dated = project('v', 'View', { projectStartDate: '2026-02-02', projectFinishDate: '2026-11-30' })

  it.each([
    ['viewer', VIEW_ONLY_REASON],
    ['not-in-cloud', NOT_IN_CLOUD_REASON],
  ] as const)('%s: every field disabled with the values shown, no Save, Close, and the reason visible (known-bads: pencil disabled; Save offered; fields editable; dates hidden)', (access, reason) => {
    renderTab([dated], { v: access })
    expect((button('Edit View') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button('Edit View'))
    const fields = ['name', 'unitOfMeasure', 'projectStartDate', 'projectFinishDate'].map(input)
    expect(fields.map((f) => [f.value, f.disabled])).toEqual([
      ['View', true], ['pts', true], ['2026-02-02', true], ['2026-11-30', true],
    ])
    expect([
      screen.queryByRole('button', { name: 'Update Project' }),
      screen.queryByRole('button', { name: 'Cancel' }),
      described(document.querySelector('form')!),
      shownTags(document.querySelector('form')!, reason),
    ]).toEqual([null, null, reason, ['P']])
    fireEvent.click(button('Close'))
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('an editor gets the editable form, as before (control)', () => {
    renderTab([dated], { v: 'editor' })
    fireEvent.click(button('Edit View'))
    expect([input('name').disabled, screen.queryByRole('button', { name: 'Update Project' }) !== null, screen.queryByRole('button', { name: 'Cancel' }) !== null, document.querySelector('form')!.getAttribute('aria-describedby')])
      .toEqual([false, true, true, null])
  })
})

describe('the project form when the access drops mid-edit, or a click races the drop (OD-8, V2)', () => {
  it('open as editor, type, drop to viewer → the typed name stays, the form turns read only: no Save, Close, the reason visible (known-bads: typed text lost; Save still offered)', () => {
    renderTab([project('p', 'Plan')], { p: 'editor' })
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(input('name'), { target: { value: 'Plan B' } })
    dropTo({ p: 'viewer' })
    expect([
      input('name').value,
      input('name').disabled,
      screen.queryByRole('button', { name: 'Update Project' }),
      screen.queryByRole('button', { name: 'Close' }) !== null,
      shownTags(document.querySelector('form')!, VIEW_ONLY_REASON),
    ]).toEqual(['Plan B', true, null, true, ['P']])
  })

  it('the access coming back restores the editable form with the typed name (known-bad: the drop reset the form)', () => {
    renderTab([project('p', 'Plan')], { p: 'editor' })
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(input('name'), { target: { value: 'Plan B' } })
    dropTo({ p: 'viewer' })
    dropTo({ p: 'editor' })
    expect([input('name').value, input('name').disabled, screen.queryByRole('button', { name: 'Update Project' }) !== null])
      .toEqual(['Plan B', false, true])
  })

  it('raced: the store refuses (returns false) → the form stays open, editing, with the typed name (known-bad: form closed on a refused save)', () => {
    renderTab([project('p', 'Plan')], { p: 'editor' })
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(input('name'), { target: { value: 'Plan B' } })
    act(() => { useProjectStore.setState({ updateProject: () => false }) })
    fireEvent.click(button('Update Project'))
    expect([input('name').value, screen.queryByRole('button', { name: 'Cancel' }) !== null, useProjectStore.getState().projects[0].name])
      .toEqual(['Plan B', true, 'Plan'])
  })

  it('a save the store accepts still closes the edit (control)', () => {
    renderTab([project('p', 'Plan')], { p: 'editor' })
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(input('name'), { target: { value: 'Plan B' } })
    fireEvent.click(button('Update Project'))
    expect([screen.queryByRole('button', { name: 'Cancel' }), useProjectStore.getState().projects[0].name]).toEqual([null, 'Plan B'])
  })
})

describe('T4c — the Projects tab says when projects not in the cloud will leave (V6, A4 row 20)', () => {
  // The literal approved text, not the constant: a changed text is red here too.
  const T4C = 'Projects marked "Not in cloud" aren\'t in your cloud account and are view only. Export any you want to keep: they leave this list when your projects next update — adding, copying or importing a project counts.'
  it.each([
    ['a not-in-cloud project listed', FIVE, FIVE_ROLES, 'cloud', [T4C]],
    ['viewer and editor projects, none not-in-cloud', FIVE.slice(0, 3), { o: 'owner', e: 'editor', v: 'viewer' }, 'cloud', []],
    ['local mode, even with a stale entry', FIVE, FIVE_ROLES, 'local', []],
  ] as const)('%s → %j (known-bad: UI-nic-note-removed; the note shown without a not-in-cloud project)', (_label, projects, roles, mode, notes) => {
    renderTab([...projects], { ...roles }, { mode, loaded: mode === 'cloud' })
    expect(screen.queryAllByRole('note').map((n) => n.textContent)).toEqual(notes)
  })
})

describe('the create form is never read only (N-6)', () => {
  it('with read-only projects listed, a new project can still be typed and added (known-bad: the read-only form keyed on the list, not the project edited)', () => {
    renderTab(FIVE, FIVE_ROLES)
    expect([input('name').disabled, screen.queryByRole('button', { name: 'Add Project' }) !== null]).toEqual([false, true])
  })

  it('closing a read-only project returns the form to an editable create form (known-bad: read only left behind)', () => {
    renderTab([project('v', 'View')], { v: 'viewer' })
    fireEvent.click(button('Edit View'))
    fireEvent.click(button('Close'))
    expect([input('name').value, input('name').disabled, screen.queryByRole('button', { name: 'Add Project' }) !== null])
      .toEqual(['', false, true])
  })
})
