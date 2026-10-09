// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Milestones panel for a project the user can only view (Brief 39 PR B):
 * "+ Add Milestone" and every row's controls disabled with the reason (never
 * hidden), the rows not draggable, and the Milestone form and the inline
 * rename keeping what was typed when the user's access drops, or a click
 * races the drop (V2).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { toast } from 'sonner'
import { Milestones } from './Milestones'
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
      milestones: [
        { id: 'm1', name: 'Alpha', backlogSize: 10, color: '#3b82f6', showOnChart: true, createdAt: T, updatedAt: T },
        { id: 'm2', name: 'Bravo', backlogSize: 20, color: '#10b981', showOnChart: true, createdAt: T, updatedAt: T },
      ],
    }],
    sprints: [],
    cloudDataLoaded: s !== 'local',
    projectRoles: s === 'local' ? {} : { p: s },
  })
  render(<Milestones projectId="p" unitOfMeasure="pts" />)
  fireEvent.click(screen.getByRole('button', { name: 'Milestones (2)' }))
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
const nameInput = () => document.getElementById('milestoneName') as HTMLInputElement | null
const rows = () => Array.from(document.querySelectorAll('tbody tr'))
const milestoneNames = () => (useProjectStore.getState().projects[0].milestones ?? []).map((m) => m.name)
const REAL = useProjectStore.getState()

afterEach(() => {
  cleanup()
  vi.mocked(toast.error).mockClear()
  useProjectStore.setState({ addMilestone: REAL.addMilestone, updateMilestone: REAL.updateMilestone, projectRoles: {}, cloudDataLoaded: false })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('read only: the panel and every row say why they are disabled (§3.8)', () => {
  it.each([
    ['viewer', VIEW_ONLY_REASON],
    ['not-in-cloud', NOT_IN_CLOUD_REASON],
  ] as const)('%s: + Add Milestone, Chart, rename, Edit, Delete (known-bads: hidden; left enabled; no title; no description)', (s, reason) => {
    setup(s)
    const perRow = (name: string) => [
      lock(screen.getByRole('checkbox', { name: `Show ${name} on chart` })),
      lock(button(name)), // click-to-rename
      lock(button(`Edit ${name}`)),
      lock(button(`Delete ${name}`)),
    ]
    expect([lock(button('+ Add Milestone')), ...perRow('Alpha'), ...perRow('Bravo')])
      .toEqual(Array(9).fill([true, reason, reason]))
  })

  it('viewer: the rows cannot be dragged, and the handle says why (known-bad: reorder left draggable)', () => {
    setup('viewer')
    expect(rows().map((r) => r.getAttribute('draggable'))).toEqual(['false', 'false'])
    expect(screen.getAllByTitle(VIEW_ONLY_REASON).filter((el) => el.tagName === 'SPAN')).toHaveLength(2)
  })

  it.each(['editor', 'owner', 'local'] as const)('%s sees no change (known-bad: an editor locked out)', (s) => {
    setup(s)
    expect([
      lock(button('+ Add Milestone')),
      lock(screen.getByRole('checkbox', { name: 'Show Alpha on chart' })),
      lock(button('Alpha')),
      lock(button('Edit Alpha')),
      lock(button('Delete Alpha')),
      rows().map((r) => r.getAttribute('draggable')),
    ]).toEqual([
      [false, null, null],
      [false, 'Shown on burn-up chart', null],
      [false, 'Click to rename', null],
      [false, 'Edit Alpha', null],
      [false, 'Delete Alpha', null],
      ['true', 'true'],
    ])
  })
})

describe('the Milestone form when the access drops mid-edit, or a click races the drop (V2)', () => {
  it.each([
    ['Add', () => fireEvent.click(button('+ Add Milestone'))],
    ['Update', () => fireEvent.click(button('Edit Alpha'))],
  ] as const)('%s: open as editor, type, drop to viewer → the typed value stays, Save disabled, the reason visible beside it (known-bads: typed text cleared; Save enabled; reason not visible)', (save, open) => {
    setup('editor')
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    dropTo('viewer')
    const form = document.querySelector('form')!
    const submit = within(form).getByRole('button', { name: save }) as HTMLButtonElement
    expect([nameInput()?.value, submit.disabled, shownTags(form, VIEW_ONLY_REASON), described(submit)])
      .toEqual(['Beta', true, ['P'], VIEW_ONLY_REASON])
  })

  it.each([
    ['Add', 'addMilestone', () => fireEvent.click(button('+ Add Milestone'))],
    ['Update', 'updateMilestone', () => fireEvent.click(button('Edit Alpha'))],
  ] as const)('%s raced: the store refuses (returns false) → the form stays open with the typed value (known-bad: form closed on a refused save)', (save, action, open) => {
    setup('editor')
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    fireEvent.change(document.getElementById('milestoneBacklog')!, { target: { value: '5' } })
    act(() => { useProjectStore.setState({ [action]: () => false }) })
    fireEvent.click(within(document.querySelector('form')!).getByRole('button', { name: save }))
    expect([nameInput()?.value, milestoneNames()]).toEqual(['Beta', ['Alpha', 'Bravo']])
  })

  it('a save the store accepts still closes the form (control)', () => {
    setup('editor')
    fireEvent.click(button('+ Add Milestone'))
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    fireEvent.change(document.getElementById('milestoneBacklog')!, { target: { value: '5' } })
    fireEvent.click(within(document.querySelector('form')!).getByRole('button', { name: 'Add' }))
    expect([nameInput(), milestoneNames()]).toEqual([null, ['Alpha', 'Bravo', 'Beta']])
  })
})

describe('the inline rename when the access drops mid-rename (V2)', () => {
  it('open as editor, type, drop to viewer → the input is read only with the draft, the reason visible under it (known-bads: draft cleared; input still editable; reason not visible)', () => {
    setup('editor')
    fireEvent.click(button('Alpha'))
    const input = screen.getByRole('textbox', { name: 'Rename Alpha' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Alpha 2' } })
    dropTo('viewer')
    const now = screen.getByRole('textbox', { name: 'Rename Alpha' }) as HTMLInputElement
    expect([now.value, now.readOnly, described(now), shownTags(now.closest('td')!, VIEW_ONLY_REASON)])
      .toEqual(['Alpha 2', true, VIEW_ONLY_REASON, ['P']])
  })

  it.each([
    ['Enter', () => fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename Alpha' }), { key: 'Enter' })],
    ['blur', () => fireEvent.blur(screen.getByRole('textbox', { name: 'Rename Alpha' }))],
  ] as const)('after the drop, %s makes no mutator call and no toast, and keeps the draft (known-bad: commit attempted while read-only)', (_how, commit) => {
    const updateMilestone = vi.fn(REAL.updateMilestone)
    useProjectStore.setState({ updateMilestone })
    setup('editor')
    fireEvent.click(button('Alpha'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Alpha' }), { target: { value: 'Alpha 2' } })
    dropTo('viewer')
    commit()
    expect([
      updateMilestone.mock.calls.length,
      vi.mocked(toast.error).mock.calls.length,
      (screen.queryByRole('textbox', { name: 'Rename Alpha' }) as HTMLInputElement | null)?.value,
      milestoneNames(),
    ]).toEqual([0, 0, 'Alpha 2', ['Alpha', 'Bravo']])
  })

  it('after the drop, Close closes it, saving nothing (known-bad: no way out of a read-only editor)', () => {
    setup('editor')
    fireEvent.click(button('Alpha'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Alpha' }), { target: { value: 'Alpha 2' } })
    dropTo('viewer')
    fireEvent.click(button('Close rename'))
    expect([screen.queryByRole('textbox', { name: 'Rename Alpha' }), milestoneNames(), vi.mocked(toast.error).mock.calls.length])
      .toEqual([null, ['Alpha', 'Bravo'], 0])
  })

  it('no drop, but the store refuses (a race): the editor stays open with the draft (known-bad: a refused rename closed the editor)', () => {
    setup('editor')
    fireEvent.click(button('Alpha'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Alpha' }), { target: { value: 'Alpha 2' } })
    act(() => { useProjectStore.setState({ updateMilestone: () => false }) })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename Alpha' }), { key: 'Enter' })
    expect([(screen.queryByRole('textbox', { name: 'Rename Alpha' }) as HTMLInputElement | null)?.value, milestoneNames()])
      .toEqual(['Alpha 2', ['Alpha', 'Bravo']])
  })

  it('Escape still closes it, saving nothing (control: the way out of a read-only editor)', () => {
    setup('editor')
    fireEvent.click(button('Alpha'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Alpha' }), { target: { value: 'Alpha 2' } })
    dropTo('viewer')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename Alpha' }), { key: 'Escape' })
    expect([screen.queryByRole('textbox', { name: 'Rename Alpha' }), milestoneNames()]).toEqual([null, ['Alpha', 'Bravo']])
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
    return shown ? <Milestones projectId={shown.id} unitOfMeasure='pts' /> : null
  }
  /** P (editable, on screen) and Quartz. */
  function setupTwo() {
    useStorageModeStore.setState({ mode: 'cloud' })
    useProjectStore.setState({
      projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T, milestones: [
        { id: 'm1', name: 'Alpha', backlogSize: 10, color: '#3b82f6', showOnChart: true, createdAt: T, updatedAt: T },
        { id: 'm2', name: 'Bravo', backlogSize: 20, color: '#10b981', showOnChart: true, createdAt: T, updatedAt: T },
      ] }, Q],
      sprints: [],
      viewingProjectId: 'p',
      cloudDataLoaded: true,
      projectRoles: { p: 'editor', q: 'owner' },
    })
    render(<Shown />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (2)' }))
  }
  /** P leaves the list, as a cloud view without it does (unshared from the user, or deleted). */
  const leaveState = () => useProjectStore.setState({ projects: [Q], projectRoles: { q: 'owner' } })
  const toasts = () => vi.mocked(toast.error).mock.calls.map((c) => c[0])
  const projectEvents = () => emitted.filter((ev) => ev.type.startsWith('project:'))
  const quartz = () => JSON.stringify(useProjectStore.getState().projects.find((p) => p.id === 'q'))
  const OPEN = [
    ['Add', () => fireEvent.click(button('+ Add Milestone'))],
    ['Update', () => fireEvent.click(button('Edit Alpha'))],
  ] as const

  it.each(OPEN)('%s: its project leaves the list → the form closes, T15 once with its name, nothing written (known-bads: K-FORM-STAYS, K-T15-SILENT)', (_save, open) => {
    setupTwo()
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    fireEvent.change(document.getElementById('milestoneBacklog')!, { target: { value: '5' } })
    const before = quartz()
    act(leaveState)
    expect([nameInput(), toasts(), projectEvents(), quartz() === before]).toEqual([null, [PROJECT_LEFT_TEXT('P')], [], true])
  })

  it.each(OPEN)('%s raced: a save in the same moment its project leaves writes nothing anywhere, and T15 shows once (known-bad: K-FORM-RETARGET)', (save, open) => {
    setupTwo()
    open()
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    fireEvent.change(document.getElementById('milestoneBacklog')!, { target: { value: '5' } })
    const before = quartz()
    act(() => {
      leaveState()
      fireEvent.click(within(document.querySelector('form')!).getByRole('button', { name: save }))
    })
    expect([nameInput(), toasts(), projectEvents(), quartz() === before]).toEqual([null, [PROJECT_LEFT_TEXT('P')], [], true])
  })

  it('the list emptying (the panel unmounts) still says why the form vanished (known-bad: T15 only while mounted)', () => {
    setupTwo()
    fireEvent.click(button('+ Add Milestone'))
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    fireEvent.change(document.getElementById('milestoneBacklog')!, { target: { value: '5' } })
    act(() => { useProjectStore.setState({ projects: [], projectRoles: {} }) })
    expect([nameInput(), toasts(), projectEvents()]).toEqual([null, [PROJECT_LEFT_TEXT('P')], []])
  })

  it('another project picked: the form closes with no message, and coming back does not reopen it (control)', () => {
    setupTwo()
    fireEvent.click(button('+ Add Milestone'))
    fireEvent.change(nameInput()!, { target: { value: 'Beta' } })
    fireEvent.change(document.getElementById('milestoneBacklog')!, { target: { value: '5' } })
    act(() => { useProjectStore.getState().setViewingProjectId('q') })
    const afterSwitch = nameInput()
    act(() => { useProjectStore.getState().setViewingProjectId('p') })
    expect([afterSwitch, nameInput(), toasts(), projectEvents()]).toEqual([null, null, [], []])
  })
})
