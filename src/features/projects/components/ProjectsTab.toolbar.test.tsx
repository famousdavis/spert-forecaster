// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Projects dashboard toolbar and the project form it opens (v0.48.0, the SPERT® suite's
 * shared toolbar): one row with the heading on the left and Export All · Import · Load
 * Sample · New Project on the right, every button always rendered, Import's gate unchanged,
 * and the form hidden until asked for.
 *
 * ⚠️ Mounted through a harness that calls the REAL `useImportState`, as AppShell does (see
 * ProjectsTab.test.tsx for why that matters).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const mockMode = vi.hoisted(() => ({ mode: 'local' as 'local' | 'cloud' }))

vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: mockMode.mode, setMode: vi.fn() }),
}))
vi.mock('@/shared/firebase/config', () => ({ auth: null }))
vi.mock('@/shared/firebase/sync-bus', () => ({
  syncBus: { emit: vi.fn(), subscribe: () => () => {} },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/shared/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks')>('@/shared/hooks')
  return { ...actual, useIsClient: () => true }
})

import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const EXISTING: Project = { id: 'p1', name: 'Existing', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }

// The visible labels and accessible names, in toolbar order. Literal on purpose: a changed
// label or a reordered button is red here.
const LABELS = ['Export All', 'Import', 'Load Sample', 'New Project']
const NAMES = ['Export all projects as JSON', 'Import projects from JSON', 'Load Sample', 'New Project']
// GanttApp's ICON_PATHS, copied literally rather than imported, so an edit to the shared
// constant cannot pass by editing the expectation along with it.
const PATHS = [
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  'M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3M7.2 15h9.6',
  'M12 5v14M5 12h14',
]

function renderTab(projects: Project[] = [], opts: { mode?: 'local' | 'cloud'; loaded?: boolean } = {}) {
  mockMode.mode = opts.mode ?? 'local'
  useProjectStore.setState({ projects, cloudDataLoaded: opts.loaded ?? false })
  function Harness() {
    return <ProjectsTab importState={useImportState()} />
  }
  return render(<Harness />)
}

/** The dashboard's first row: the heading's parent. */
const headingRow = () => screen.getByRole('heading', { name: 'Projects', level: 2 }).parentElement as HTMLElement
const toolbarButtons = () => within(headingRow()).getAllByRole('button') as HTMLButtonElement[]
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const nameField = () => screen.queryByLabelText('Project Name') as HTMLInputElement | null

beforeEach(() => {
  useProjectStore.setState({
    projects: [],
    sprints: [],
    viewingProjectId: null,
    shouldFocusNewProjectForm: false,
    _originRef: '',
    _changeLog: [],
    cloudDataLoaded: false,
    projectRoles: {},
  })
  mockMode.mode = 'local'
})

describe('the toolbar row', () => {
  it.each([
    ['no projects', [], {}],
    ['a project', [EXISTING], {}],
    ['the first cloud load pending', [EXISTING], { mode: 'cloud' as const, loaded: false }],
  ])('with %s: the same four buttons, in order, in the heading row (known-bads: a button hidden by count or loading; reordered)', (_label, projects, opts) => {
    const { container } = renderTab(projects, opts)
    const buttons = toolbarButtons()
    expect(buttons.map((b) => b.textContent)).toEqual(LABELS)
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(NAMES)
    // The row is the first thing in the dashboard, and the heading comes first in it.
    expect(container.firstElementChild?.firstElementChild).toBe(headingRow())
    expect(headingRow().firstElementChild?.tagName).toBe('H2')
  })

  it('every accessible name begins with its visible label (WCAG 2.5.3, Label in Name)', () => {
    renderTab([EXISTING])
    for (const b of toolbarButtons()) {
      const name = (b.getAttribute('aria-label') ?? b.textContent ?? '').toLowerCase()
      expect(name.startsWith((b.textContent ?? '').toLowerCase()), b.textContent ?? '').toBe(true)
    }
  })

  it('each button leads with its icon: 18 px, hidden from assistive tech, the shared path, drawn in the text colour', () => {
    renderTab([EXISTING])
    const icons = toolbarButtons().map((b) => b.firstElementChild as SVGElement)
    expect(icons.map((svg) => [svg.tagName.toLowerCase(), svg.getAttribute('aria-hidden'), svg.getAttribute('width'), svg.getAttribute('height')]))
      .toEqual(LABELS.map(() => ['svg', 'true', '18', '18']))
    expect(icons.map((svg) => svg.querySelector('path')?.getAttribute('d'))).toEqual(PATHS)
    expect(icons.map((svg) => svg.querySelector('path')?.getAttribute('stroke'))).toEqual(LABELS.map(() => 'currentColor'))
  })

  it('is not given role="toolbar", which would promise arrow-key navigation', () => {
    renderTab([EXISTING])
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('New Project is the one filled primary button', () => {
    renderTab([EXISTING])
    expect(toolbarButtons().map((b) => b.className.includes('bg-spert-blue '))).toEqual([false, false, false, true])
  })
})

describe('the gates (kept from before v0.48.0, none added)', () => {
  it('Export All is disabled with no projects, enabled with one (known-bad: hidden instead)', () => {
    renderTab([])
    expect(button('Export all projects as JSON').disabled).toBe(true)
  })

  it.each([
    ['local mode', { mode: 'local' as const, loaded: false }, false],
    ['cloud mode, first load pending', { mode: 'cloud' as const, loaded: false }, true],
    ['cloud mode, loaded', { mode: 'cloud' as const, loaded: true }, false],
  ])('%s: Import disabled = %s, its note shown with it; Load Sample and New Project never disabled', (_label, opts, pending) => {
    renderTab([EXISTING], opts)
    expect([
      button('Import projects from JSON').disabled,
      screen.queryByText('Loading your cloud projects — import will be available shortly.') !== null,
      button('Load Sample').disabled,
      button('New Project').disabled,
      button('Export all projects as JSON').disabled,
    ]).toEqual([pending, pending, false, false, false])
  })

  it('the cloud-pending note sits below the toolbar row, in the dashboard content', () => {
    renderTab([EXISTING], { mode: 'cloud', loaded: false })
    const note = screen.getByRole('status')
    expect(headingRow().compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Load Sample from the toolbar adds the sample with no projects listed', () => {
    renderTab([])
    fireEvent.click(button('Load Sample'))
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual(['Sample: Mobile App Launch'])
  })
})

describe('the project form opens only when asked for (v0.48.0)', () => {
  it('New Project opens a blank create form with the name focused', () => {
    renderTab([EXISTING])
    expect(nameField()).toBeNull()
    fireEvent.click(button('New Project'))
    expect([nameField()?.value, document.activeElement === nameField(), screen.queryByRole('button', { name: 'Add Project' }) !== null])
      .toEqual(['', true, true])
  })

  it('Add Project adds the project, hides the form and returns focus to New Project (known-bad: form left open)', () => {
    renderTab([EXISTING])
    fireEvent.click(button('New Project'))
    fireEvent.change(nameField()!, { target: { value: 'Second' } })
    fireEvent.click(button('Add Project'))
    expect([
      useProjectStore.getState().projects.map((p) => p.name),
      nameField(),
      document.activeElement === button('New Project'),
    ]).toEqual([['Existing', 'Second'], null, true])
  })

  it.each([
    ['no projects', []],
    ['a project', [EXISTING]],
  ])('with %s: the create form offers Cancel, which hides it and returns focus to New Project (known-bad: no way to close a create form)', (_label, projects) => {
    renderTab(projects)
    fireEvent.click(button('New Project'))
    fireEvent.click(button('Cancel'))
    expect([nameField(), document.activeElement === button('New Project'), useProjectStore.getState().projects.length])
      .toEqual([null, true, projects.length])
  })

  it('New Project while editing switches to a blank create form with the name focused (known-bad: the edited project\'s field focused instead)', () => {
    renderTab([EXISTING])
    fireEvent.click(button('Edit Existing'))
    fireEvent.change(nameField()!, { target: { value: 'Existing, renamed' } })
    fireEvent.click(button('New Project'))
    expect([
      nameField()?.value,
      document.activeElement === nameField(),
      screen.queryByRole('button', { name: 'Add Project' }) !== null,
      screen.queryByRole('button', { name: 'Update Project' }),
      useProjectStore.getState().projects[0].name,
    ]).toEqual(['', true, true, null, 'Existing'])
  })

  it('Update Project closes the edit form; the form does not reopen as a create form (known-bad: always-visible-on-populated)', () => {
    renderTab([EXISTING])
    fireEvent.click(button('Edit Existing'))
    fireEvent.change(nameField()!, { target: { value: 'Renamed' } })
    fireEvent.click(button('Update Project'))
    expect([nameField(), useProjectStore.getState().projects[0].name]).toEqual([null, 'Renamed'])
  })

  it('another tab\'s "Create New Project" still opens and focuses the form, with projects listed', () => {
    useProjectStore.setState({ shouldFocusNewProjectForm: true })
    renderTab([EXISTING])
    expect([nameField() !== null, document.activeElement === nameField(), useProjectStore.getState().shouldFocusNewProjectForm])
      .toEqual([true, true, false])
  })

  it('the empty state\'s "Create New Project" takes the same path as New Project: deleting the project being edited, then Create New Project, gives a blank create form (known-bad: the deleted project\'s form focused)', () => {
    renderTab([EXISTING])
    fireEvent.click(button('Edit Existing'))
    fireEvent.click(button('Delete Existing'))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(button('Create New Project'))
    expect([nameField()?.value, document.activeElement === nameField(), screen.queryByRole('button', { name: 'Update Project' })])
      .toEqual(['', true, null])
  })

  it('the empty state\'s "Create New Project" opens the same form; it sits below the toolbar row', () => {
    renderTab([])
    fireEvent.click(button('Create New Project'))
    expect(document.activeElement === nameField()).toBe(true)
    expect(headingRow().compareDocumentPosition(nameField()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
