// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Edit Project dialog closes when its project leaves the list (v0.50.7, F21), as Sprint
 * History's and Forecast's forms have since v0.47.0: at once, saving nothing, saying why once
 * (T15; T15b when the dialog was read only), with focus on New Project.
 *
 * Until v0.50.7 the dialog stayed open and editable, and Update closed it as if saved — nothing
 * saved, no message.
 *
 * ⚠️ CLOUD MODE ONLY, so jsdom only. A project leaves the list while this tab is open only when
 * a cloud view drops it: unshared from you, or deleted on another device. In local mode nothing
 * outside this tab changes the list (the store does not rehydrate from other tabs), and the
 * dialog makes the page behind it inert. The store write below is the one a cloud view makes:
 * the project and its role entry go in the same set() (applyCloudView, useCloudSync.ts).
 *
 * Mounted through a harness that calls the REAL `useImportState`, as AppShell does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { ProjectAccess } from '@/shared/state/project-access'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string, name: string): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: T, updatedAt: T })
const PLAN = project('p', 'Plan')
const OTHER = project('o', 'Other')

// The approved texts, literally: a changed text is red here too.
const T15 = '"Plan" is no longer in your list, so what you were typing wasn\'t saved. It may have been unshared from you or deleted.'
const T15B = '"Plan" is no longer in your list. It may have been unshared from you or deleted.'

function renderTab(planRole: ProjectAccess) {
  useStorageModeStore.setState({ mode: 'cloud' })
  useProjectStore.setState({
    projects: [PLAN, OTHER], sprints: [], cloudDataLoaded: true, projectRoles: { p: planRole, o: 'owner' },
  })
  function Harness() {
    return <ProjectsTab importState={useImportState()} />
  }
  return render(<Harness />)
}

/** The cloud view no longer holds Plan. */
const planLeaves = () => useProjectStore.setState({ projects: [OTHER], projectRoles: { o: 'owner' } })
/** The cloud view no longer holds Other. */
const otherLeaves = () => useProjectStore.setState({ projects: [PLAN], projectRoles: { p: 'editor' } })

const button = (name: string) => screen.getByRole('button', { name })
const nameField = () => document.getElementById('name') as HTMLInputElement | null
const errors = () => toasts.error.mock.calls.map((c) => c[0])
const saves: string[] = []
const unsubscribe = syncBus.subscribe((e) => { if (e.type === 'project:save') saves.push(e.projectId) })
void unsubscribe

/** [dialog open, toasts, project:save events, names in the store, focused control's label] */
const state = () => [
  screen.queryByRole('dialog') !== null,
  errors(),
  [...saves],
  useProjectStore.getState().projects.map((p) => p.name),
  document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? null,
]

afterEach(() => {
  cleanup()
  toasts.error.mockClear()
  saves.length = 0
  useProjectStore.setState({ projects: [], projectRoles: {}, cloudDataLoaded: false })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('the Edit Project dialog when its project leaves the list', () => {
  it('editable: closes at once, saves nothing, says T15 once, focus to New Project (known-bad: stays open and editable)', () => {
    renderTab('editor')
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(nameField()!, { target: { value: 'Plan B' } })
    act(planLeaves)
    expect(state()).toEqual([false, [T15], [], ['Other'], 'New Project'])
  })

  it('read only: closes at once, says T15b once (known-bad: T15, "what you were typing", where nothing could be typed)', () => {
    renderTab('viewer')
    fireEvent.click(button('Edit Plan'))
    expect(nameField()!.disabled).toBe(true)
    act(planLeaves)
    expect(state()).toEqual([false, [T15B], [], ['Other'], 'New Project'])
  })

  it('raced: Update pressed as it leaves writes nothing, and T15 shows once (known-bad: closed as if saved, no message)', () => {
    renderTab('editor')
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(nameField()!, { target: { value: 'Plan B' } })
    act(() => {
      planLeaves()
      fireEvent.click(button('Update Project'))
    })
    expect(state()).toEqual([false, [T15], [], ['Other'], 'New Project'])
  })

  it('another project leaving leaves the dialog open, editing, with no message (control)', () => {
    renderTab('editor')
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(nameField()!, { target: { value: 'Plan B' } })
    act(otherLeaves)
    expect([...state().slice(0, 4), nameField()?.value]).toEqual([true, [], [], ['Plan'], 'Plan B'])
  })

  it('Update with the project listed saves and says nothing (control)', () => {
    renderTab('editor')
    fireEvent.click(button('Edit Plan'))
    fireEvent.change(nameField()!, { target: { value: 'Plan B' } })
    fireEvent.click(button('Update Project'))
    expect(state().slice(0, 4)).toEqual([false, [], ['p'], ['Plan B', 'Other']])
  })

  it('Cancel with the project listed says nothing, and the project leaving afterwards says nothing either (control)', () => {
    renderTab('editor')
    fireEvent.click(button('Edit Plan'))
    fireEvent.click(button('Cancel'))
    act(planLeaves)
    expect(state().slice(0, 4)).toEqual([false, [], [], ['Other']])
  })

  it('a create dialog is not affected by a project leaving (control)', () => {
    renderTab('editor')
    fireEvent.click(button('New Project'))
    fireEvent.change(nameField()!, { target: { value: 'Fresh' } })
    act(planLeaves)
    expect([...state().slice(0, 3), nameField()?.value]).toEqual([true, [], [], 'Fresh'])
  })
})
