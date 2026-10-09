// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Productivity Adjustments panel for a project the user can only view
 * (Brief 39 PR B): "+ Add Adjustment" and every row's controls disabled with the
 * reason (never hidden), and the adjustment form keeping what was typed when
 * the user's access drops, or a click races the drop (V2).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { ProductivityAdjustments } from './ProductivityAdjustments'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { SyncEvent } from '@/shared/firebase/types'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import type { ProjectAccess } from '@/shared/state/project-access'
import { NOT_IN_CLOUD_REASON, PROJECT_LEFT_TEXT, VIEW_ONLY_REASON } from '@/features/auth/lib/access-texts'

const T = '2026-01-01T00:00:00.000Z'
type Seed = ProjectAccess | 'local'

function setup(s: Seed) {
  useStorageModeStore.setState({ mode: s === 'local' ? 'local' : 'cloud' })
  useProjectStore.setState({
    projects: [{
      id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T,
      productivityAdjustments: [
        { id: 'a1', name: 'Holiday', startDate: '2026-12-21', endDate: '2026-12-31', factor: 0.5, enabled: true, createdAt: T, updatedAt: T },
      ],
    }],
    sprints: [],
    cloudDataLoaded: s !== 'local',
    projectRoles: s === 'local' ? {} : { p: s },
  })
  render(<ProductivityAdjustments projectId="p" />)
  fireEvent.click(screen.getByRole('button', { name: /^Productivity Adjustments/ }))
}
const dropTo = (access: ProjectAccess) => act(() => { useProjectStore.setState({ projectRoles: { p: access } }) })

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
const nameInput = () => document.getElementById('adjName') as HTMLInputElement | null
const adjustmentNames = () => (useProjectStore.getState().projects[0].productivityAdjustments ?? []).map((a) => a.name)
const REAL = useProjectStore.getState()

afterEach(() => {
  cleanup()
  vi.mocked(toast.error).mockClear()
  useProjectStore.setState({
    addProductivityAdjustment: REAL.addProductivityAdjustment,
    updateProductivityAdjustment: REAL.updateProductivityAdjustment,
    projectRoles: {},
    cloudDataLoaded: false,
  })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('read only: the panel and every row say why they are disabled (§3.8)', () => {
  it.each([
    ['viewer', VIEW_ONLY_REASON],
    ['not-in-cloud', NOT_IN_CLOUD_REASON],
  ] as const)('%s: + Add Adjustment, On, Edit, Delete (known-bads: hidden; left enabled; no title; no description)', (s, reason) => {
    setup(s)
    expect([
      lock(button('+ Add Adjustment')),
      lock(screen.getByRole('checkbox', { name: 'Disable Holiday' })),
      lock(button('Edit Holiday')),
      lock(button('Delete Holiday')),
    ]).toEqual(Array(4).fill([true, reason, reason]))
  })

  it.each(['editor', 'owner', 'local'] as const)('%s sees no change (known-bad: an editor locked out)', (s) => {
    setup(s)
    expect([
      lock(button('+ Add Adjustment')),
      lock(screen.getByRole('checkbox', { name: 'Disable Holiday' })),
      lock(button('Edit Holiday')),
      lock(button('Delete Holiday')),
    ]).toEqual([
      [false, null, null],
      [false, 'Click to disable', null],
      [false, 'Edit Holiday', null],
      [false, 'Delete Holiday', null],
    ])
  })
})

describe('the adjustment form when the access drops mid-edit, or a click races the drop (V2)', () => {
  it.each([
    ['Add', () => fireEvent.click(button('+ Add Adjustment'))],
    ['Update', () => fireEvent.click(button('Edit Holiday'))],
  ] as const)('%s: open as editor, type, drop to viewer → the typed value stays, Save disabled, the reason visible beside it (known-bads: typed text cleared; Save enabled; reason not visible)', (save, open) => {
    setup('editor')
    open()
    // A valid form, so Save is disabled by the reason alone, never by validation.
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    dropTo('viewer')
    const form = document.querySelector('form')!
    const submit = within(form).getByRole('button', { name: save }) as HTMLButtonElement
    expect([nameInput()?.value, submit.disabled, shownTags(form, VIEW_ONLY_REASON), described(submit)])
      .toEqual(['Offsite', true, ['P'], VIEW_ONLY_REASON])
  })

  it.each([
    ['Add', 'addProductivityAdjustment', () => fireEvent.click(button('+ Add Adjustment'))],
    ['Update', 'updateProductivityAdjustment', () => fireEvent.click(button('Edit Holiday'))],
  ] as const)('%s raced: the store refuses (returns false) → the form stays open with the typed value (known-bad: form closed on a refused save)', (save, action, open) => {
    setup('editor')
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    act(() => { useProjectStore.setState({ [action]: () => false }) })
    fireEvent.click(within(document.querySelector('form')!).getByRole('button', { name: save }))
    expect([nameInput()?.value, adjustmentNames()]).toEqual(['Offsite', ['Holiday']])
  })

  it('a save the store accepts still closes the form (control)', () => {
    setup('editor')
    fireEvent.click(button('+ Add Adjustment'))
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    fireEvent.click(within(document.querySelector('form')!).getByRole('button', { name: 'Add' }))
    expect([nameInput(), adjustmentNames()]).toEqual([null, ['Holiday', 'Offsite']])
  })
})

describe('V10 — the form is tied to the project it was opened for', () => {
  const Q = { id: 'q', name: 'Quartz', unitOfMeasure: 'pts', createdAt: T, updatedAt: T, milestones: [], productivityAdjustments: [] }
  let emitted: SyncEvent[] = []
  beforeEach(() => {
    emitted = []
    vi.spyOn(syncBus, 'emit').mockImplementation((ev: SyncEvent) => { emitted.push(ev) })
  })
  afterEach(() => vi.restoreAllMocks())
  /** As ForecastTab wires it: the project on screen (selectViewingProject), no key. */
  function Shown() {
    const shown = useProjectStore(selectViewingProject)
    return shown ? <ProductivityAdjustments projectId={shown.id} /> : null
  }
  /** P (editable, on screen) and Quartz. */
  function setupTwo() {
    useStorageModeStore.setState({ mode: 'cloud' })
    useProjectStore.setState({
      projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T, productivityAdjustments: [
        { id: 'a1', name: 'Holiday', startDate: '2026-12-21', endDate: '2026-12-31', factor: 0.5, enabled: true, createdAt: T, updatedAt: T },
      ] }, Q],
      sprints: [],
      viewingProjectId: 'p',
      cloudDataLoaded: true,
      projectRoles: { p: 'editor', q: 'owner' },
    })
    render(<Shown />)
    fireEvent.click(screen.getByRole('button', { name: /^Productivity Adjustments/ }))
  }
  /** P leaves the list, as a cloud view without it does (unshared from the user, or deleted). */
  const leaveState = () => useProjectStore.setState({ projects: [Q], projectRoles: { q: 'owner' } })
  const toasts = () => vi.mocked(toast.error).mock.calls.map((c) => c[0])
  const projectEvents = () => emitted.filter((ev) => ev.type.startsWith('project:'))
  const quartz = () => JSON.stringify(useProjectStore.getState().projects.find((p) => p.id === 'q'))
  const OPEN = [
    ['Add', () => fireEvent.click(button('+ Add Adjustment'))],
    ['Update', () => fireEvent.click(button('Edit Holiday'))],
  ] as const

  it.each(OPEN)('%s: its project leaves the list → the form closes, T15 once with its name, nothing written (known-bads: K-FORM-STAYS, K-T15-SILENT)', (_save, open) => {
    setupTwo()
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    const before = quartz()
    act(leaveState)
    expect([nameInput(), toasts(), projectEvents(), quartz() === before]).toEqual([null, [PROJECT_LEFT_TEXT('P')], [], true])
  })

  it.each(OPEN)('%s raced: a save in the same moment its project leaves writes nothing anywhere, and T15 shows once (known-bad: K-FORM-RETARGET)', (save, open) => {
    setupTwo()
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    const before = quartz()
    act(() => {
      leaveState()
      fireEvent.click(within(document.querySelector('form')!).getByRole('button', { name: save }))
    })
    expect([nameInput(), toasts(), projectEvents(), quartz() === before]).toEqual([null, [PROJECT_LEFT_TEXT('P')], [], true])
  })

  it('the list emptying (the panel unmounts) still says why the form vanished (known-bad: T15 only while mounted)', () => {
    setupTwo()
    fireEvent.click(button('+ Add Adjustment'))
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    act(() => { useProjectStore.setState({ projects: [], projectRoles: {} }) })
    expect([nameInput(), toasts(), projectEvents()]).toEqual([null, [PROJECT_LEFT_TEXT('P')], []])
  })

  it('another project picked: the form closes with no message, and coming back does not reopen it (control)', () => {
    setupTwo()
    fireEvent.click(button('+ Add Adjustment'))
    fireEvent.change(nameInput()!, { target: { value: 'Offsite' } })
    fireEvent.change(document.getElementById('adjStartDate')!, { target: { value: '2026-03-02' } })
    fireEvent.change(document.getElementById('adjEndDate')!, { target: { value: '2026-03-06' } })
    act(() => { useProjectStore.getState().setViewingProjectId('q') })
    const afterSwitch = nameInput()
    act(() => { useProjectStore.getState().setViewingProjectId('p') })
    expect([afterSwitch, nameInput(), toasts(), projectEvents()]).toEqual([null, null, [], []])
  })
})
