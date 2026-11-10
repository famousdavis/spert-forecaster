// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Projects dashboard (v0.49.0) through the real tab: where a tile takes you, where focus
 * lands when each dialog closes on each way in, and the spacing the tab's notices keep.
 *
 * ⚠️ Mounted through a harness that calls the REAL `useImportState`, as AppShell does (see
 * ProjectsTab.test.tsx). The storage mode is the real store, as in ProjectsTab.access.test.tsx.
 *
 * jsdom does no hit-testing, so the whole-tile click (the name button's `::after`) is a browser
 * check at release; here, what a click on each control does, and that the tile root has none.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockUser = vi.hoisted(() => ({ current: null as { uid: string } | null }))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: mockUser.current }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The sharing panel's content talks to Firestore; only where the panel sits is under test here.
vi.mock('@/features/auth/components/SharingSection', () => ({ SharingSection: () => <p>sharing</p> }))
vi.mock('@/shared/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks')>('@/shared/hooks')
  return { ...actual, useIsClient: () => true }
})

import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import type { ProjectAccess } from '@/shared/state/project-access'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string, name: string): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: T, updatedAt: T })
const ABC = [project('a', 'Alpha'), project('b', 'Bravo'), project('c', 'Charlie')]

function renderTab(
  projects: Project[],
  opts: { onViewHistory?: (id: string) => void; mode?: 'local' | 'cloud'; loaded?: boolean; roles?: Record<string, ProjectAccess> } = {},
) {
  useStorageModeStore.setState({ mode: opts.mode ?? 'local' })
  useProjectStore.setState({ projects, sprints: [], cloudDataLoaded: opts.loaded ?? false, projectRoles: opts.roles ?? {} })
  function Harness() {
    return <ProjectsTab onViewHistory={opts.onViewHistory} importState={useImportState()} />
  }
  return render(<Harness />)
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const focused = () => document.activeElement
const nameField = () => document.getElementById('name') as HTMLInputElement | null
const escape = () => fireEvent.keyDown(focused() ?? document.body, { key: 'Escape' })

afterEach(() => {
  cleanup()
  mockUser.current = null
  useProjectStore.setState({ projects: [], sprints: [], projectRoles: {}, cloudDataLoaded: false, shouldFocusNewProjectForm: false })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('a tile opens Sprint History (GAP-B31)', () => {
  it('wiring: AppShell hands ProjectsTab the handler that selects the project and switches to Sprint History', () => {
    // Structural: where the handler is mounted is a fact about AppShell's source, not behaviour.
    const shell = readFileSync(join(import.meta.dirname, '..', '..', '..', 'shell', 'components', 'AppShell.tsx'), 'utf8')
    expect(shell).toMatch(/<ProjectsTab\s[^>]*onViewHistory=\{handleViewHistory\}/)
    const handler = shell.match(/const handleViewHistory = useCallback\(\(projectId: string\) => \{([\s\S]*?)\}, /)?.[1] ?? ''
    expect(handler).toMatch(/setViewingProjectId\(projectId\)/)
    expect(handler).toMatch(/setActiveTab\('sprint-history'\)/)
  })

  it('a click on the name button calls onViewHistory with that project (known-bad: GAP-B31, no test)', () => {
    const onViewHistory = vi.fn()
    renderTab(ABC, { onViewHistory })
    fireEvent.click(button('View history for Bravo'))
    expect(onViewHistory.mock.calls).toEqual([['b']])
  })

  it('no other control on a tile, and not the tile itself, navigates (known-bad: a click handler on the tile root)', () => {
    const onViewHistory = vi.fn()
    renderTab(ABC, { onViewHistory })
    const tile = button('View history for Bravo').closest('[data-tile="true"]') as HTMLElement
    fireEvent.click(tile)
    fireEvent.click(tile.querySelector('[draggable="true"]')!)
    fireEvent.click(within(tile).getByText(/^No sprints yet/))
    // Each control did its own job, and none navigated. Edit last: its dialog then covers the page.
    fireEvent.click(button('Export Bravo'))
    fireEvent.click(button('Clone Bravo'))
    fireEvent.click(button('Delete Bravo'))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(button('Edit Bravo'))
    expect([
      useProjectStore.getState().projects.length,
      screen.queryByRole('dialog', { name: 'Edit Project' }) !== null,
      onViewHistory.mock.calls.length,
    ]).toEqual([4, true, 0])
  })
})

describe('focus when the project dialog closes', () => {
  it.each([
    ['Add Project', () => { fireEvent.change(nameField()!, { target: { value: 'Delta' } }); fireEvent.click(button('Add Project')) }],
    ['Cancel', () => fireEvent.click(button('Cancel'))],
    ['Escape', escape],
  ])('opened by the toolbar\'s New Project: %s returns focus to New Project', (_label, close) => {
    renderTab(ABC)
    fireEvent.click(button('New Project'))
    expect(focused()).toBe(nameField())
    close()
    expect([screen.queryByRole('dialog'), focused() === button('New Project')]).toEqual([null, true])
  })

  it('opened by the welcome panel\'s "Create New Project": Add Project returns focus to New Project, the panel gone (known-bad: focus on the vanished button)', () => {
    renderTab([])
    fireEvent.click(button('Create New Project'))
    expect(focused()).toBe(nameField())
    fireEvent.change(nameField()!, { target: { value: 'First' } })
    fireEvent.click(button('Add Project'))
    expect([screen.queryByRole('button', { name: 'Create New Project' }), focused() === button('New Project')]).toEqual([null, true])
  })

  it('opened from the Forecast tab (the store flag): the dialog opens focused, and Cancel returns focus to New Project', () => {
    useProjectStore.setState({ shouldFocusNewProjectForm: true })
    renderTab(ABC)
    expect([screen.queryByRole('dialog', { name: 'New Project' }) !== null, focused() === nameField(), useProjectStore.getState().shouldFocusNewProjectForm])
      .toEqual([true, true, false])
    fireEvent.click(button('Cancel'))
    expect(focused()).toBe(button('New Project'))
  })

  it.each([
    ['Update Project', () => { fireEvent.change(nameField()!, { target: { value: 'Bravo 2' } }); fireEvent.click(button('Update Project')) }, 'Edit Bravo 2'],
    ['Cancel', () => fireEvent.click(button('Cancel')), 'Edit Bravo'],
    ['Escape', escape, 'Edit Bravo'],
  ])('a tile\'s Edit: %s returns focus to that tile\'s Edit (known-bad: B14, focus not managed)', (_label, close, editName) => {
    renderTab(ABC)
    fireEvent.click(button('Edit Bravo'))
    expect(screen.queryByRole('dialog', { name: 'Edit Project' })).not.toBeNull()
    close()
    expect([screen.queryByRole('dialog'), focused() === button(editName)]).toEqual([null, true])
  })

  it('a read-only Edit\'s Close returns focus to that tile\'s Edit', () => {
    renderTab([project('v', 'View')], { mode: 'cloud', loaded: true, roles: { v: 'viewer' } })
    fireEvent.click(button('Edit View'))
    expect(focused()).toBe(button('Close'))
    fireEvent.click(button('Close'))
    expect(focused()).toBe(button('Edit View'))
  })

  it('an Edit whose tile left the list while open falls back to New Project', () => {
    renderTab(ABC)
    fireEvent.click(button('Edit Bravo'))
    act(() => { useProjectStore.setState({ projects: [ABC[0], ABC[2]] }) })
    fireEvent.click(button('Cancel'))
    expect(focused()).toBe(button('New Project'))
  })
})

describe('focus when the delete dialog closes (known-bad: B44, focus fell to <body>)', () => {
  const confirm = () => fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

  it.each([
    ['first', 'Alpha', 'View history for Bravo'],
    ['middle', 'Bravo', 'View history for Charlie'],
    ['last', 'Charlie', 'View history for Bravo'],
  ])('deleting the %s tile focuses the next tile\'s name, else the previous', (_label, victim, expected) => {
    renderTab(ABC)
    fireEvent.click(button(`Delete ${victim}`))
    confirm()
    expect([useProjectStore.getState().projects.some((p) => p.name === victim), focused() === button(expected)]).toEqual([false, true])
  })

  it('deleting the only tile focuses New Project', () => {
    renderTab([ABC[0]])
    fireEvent.click(button('Delete Alpha'))
    confirm()
    expect([useProjectStore.getState().projects.length, focused() === button('New Project')]).toEqual([0, true])
  })

  it.each([
    ['Cancel', () => fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))],
    ['Escape', escape],
  ])('the delete dialog\'s %s returns focus to that tile\'s Delete', (_label, close) => {
    renderTab(ABC)
    fireEvent.click(button('Delete Bravo'))
    close()
    expect([screen.queryByRole('alertdialog'), useProjectStore.getState().projects.length, focused() === button('Delete Bravo')]).toEqual([null, 3, true])
  })
})

describe('spacing (D23): 16 px from the heading row to the grid, 24 px around every notice', () => {
  // jsdom computes no layout, so this pins the classes that produce the gaps: the root's
  // `space-y-6` (24 px below each child), the heading row's `mb-4` overriding it to 16, and
  // `mt-6` on each section, whose margin collapses with the one above it. The three local-mode
  // gaps (import banner, welcome panel, import preview) were measured in a browser at release;
  // these three render only in cloud mode and were not.
  const root = () => screen.getByRole('heading', { name: 'Projects', level: 2 }).parentElement!.parentElement!
  const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)

  it('the root and the heading row', () => {
    renderTab(ABC)
    expect(classes(root())).toContain('space-y-6')
    expect(classes(root().firstElementChild!)).toContain('mb-4')
  })

  it('the cloud-pending note keeps mt-6', () => {
    renderTab(ABC, { mode: 'cloud', loaded: false })
    expect(classes(screen.getByRole('status'))).toContain('mt-6')
  })

  it('the not-in-cloud note keeps mt-6', () => {
    renderTab(ABC, { mode: 'cloud', loaded: true, roles: { a: 'not-in-cloud' } })
    expect(classes(screen.getByRole('note'))).toContain('mt-6')
  })

  it('the sharing panel, below the grid, keeps mt-6', () => {
    mockUser.current = { uid: 'u1' }
    renderTab(ABC, { mode: 'cloud', loaded: true, roles: { a: 'owner', b: 'owner', c: 'owner' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Share project' })[0])
    const panel = screen.getByRole('button', { name: 'Close sharing' }).closest('div.rounded-lg')!
    expect([classes(panel).includes('mt-6'), panel.previousElementSibling?.querySelector('ul[aria-label="Projects"]') !== null]).toEqual([true, true])
  })
})
