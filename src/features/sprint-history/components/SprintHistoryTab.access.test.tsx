// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Sprint History for a project the user can only view (Brief 39 PR B): the banner,
 * every control that would change the project disabled with its reason (never
 * hidden), and the Sprint form keeping what was typed when the user's access
 * drops, or a click races the drop (V2). Owners, editors and local mode see
 * no change.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { SyncEvent } from '@/shared/firebase/types'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SprintHistoryTab } from './SprintHistoryTab'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import type { ProjectAccess } from '@/shared/state/project-access'
import { PID, seedProject, seedStores } from '@/shared/state/fixtures/bad-sprint-dates'
import {
  NOT_IN_CLOUD_BANNER,
  NOT_IN_CLOUD_REASON,
  PROJECT_LEFT_TEXT,
  VIEW_ONLY_BANNER,
  VIEW_ONLY_REASON,
} from '@/features/auth/lib/access-texts'

type Seed = ProjectAccess | 'local'

/** The control project (8 valid sprints) under the given access. */
function setup(s: Seed) {
  seedStores('control')
  useStorageModeStore.setState({ mode: s === 'local' ? 'local' : 'cloud' })
  useProjectStore.setState({ cloudDataLoaded: s !== 'local', projectRoles: s === 'local' ? {} : { [PID]: s } })
  render(<TooltipProvider><SprintHistoryTab /></TooltipProvider>)
}
const dropTo = (access: ProjectAccess) => act(() => { useProjectStore.setState({ projectRoles: { [PID]: access } }) })

/** The text of every element a control's aria-describedby names; null when it names none. */
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
const doneInput = () => document.getElementById('doneValue') as HTMLInputElement | null
const REAL = useProjectStore.getState()

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.mocked(toast.error).mockClear()
  useProjectStore.setState({ addSprint: REAL.addSprint, updateSprint: REAL.updateSprint, projectRoles: {}, cloudDataLoaded: false })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('the banner (T1/T1b)', () => {
  it.each([
    ['viewer', VIEW_ONLY_BANNER],
    ['not-in-cloud', NOT_IN_CLOUD_BANNER],
    ['editor', null],
    ['owner', null],
    ['local', null],
  ] as const)('%s → %j (known-bads: no banner; banner for an editor; wrong text)', (s, text) => {
    setup(s)
    expect(screen.queryAllByRole('note').map((n) => n.textContent)).toEqual(text === null ? [] : [text])
  })
})

describe('read only: every control that would change the project is disabled and says why (§3.8)', () => {
  it.each([
    ['viewer', VIEW_ONLY_REASON],
    ['not-in-cloud', NOT_IN_CLOUD_REASON],
  ] as const)('%s: Add Sprint, the sprint settings, and every row (known-bads: a control left enabled; hidden; no title; no description)', (s, reason) => {
    setup(s)
    const rows = [1, 2, 3, 4, 5, 6, 7, 8]
    expect([
      lock(button('Add Sprint')),
      lock(document.getElementById('sprintCadence')!),
      lock(document.getElementById('firstSprintStartDate')!),
      ...rows.map((k) => lock(screen.getByRole('checkbox', { name: `Include Sprint ${k} in forecast` }))),
      ...rows.map((k) => lock(button(`Edit Sprint ${k}`))),
      // The access reason wins over "Only the most recent sprint can be deleted".
      ...rows.map((k) => lock(button(`Delete Sprint ${k}`))),
    ]).toEqual(Array(3 + 3 * rows.length).fill([true, reason, reason]))
    expect(screen.getByText('(View only)')).toBeTruthy()
    expect(screen.queryByText('(Delete all sprints to change)')).toBeNull()
  })

  it('viewer, no sprints yet: the sprint settings are locked by the access alone (known-bad: the settings locked only by recorded sprints)', () => {
    seedStores('control')
    useStorageModeStore.setState({ mode: 'cloud' })
    useProjectStore.setState({ sprints: [], cloudDataLoaded: true, projectRoles: { [PID]: 'viewer' } })
    render(<TooltipProvider><SprintHistoryTab /></TooltipProvider>)
    expect([
      lock(document.getElementById('sprintCadence')!),
      lock(document.getElementById('firstSprintStartDate')!),
      screen.queryByText('(View only)') !== null,
    ]).toEqual([[true, VIEW_ONLY_REASON, VIEW_ONLY_REASON], [true, VIEW_ONLY_REASON, VIEW_ONLY_REASON], true])
  })

  it('viewer, configuration incomplete: Add Sprint gives the access reason, and nothing asks a viewer to configure (D3; known-bads: the configuration reason wins; the prompt shown to a viewer)', () => {
    seedStores('control', { project: { sprintCadenceWeeks: undefined } })
    useStorageModeStore.setState({ mode: 'cloud' })
    useProjectStore.setState({ sprints: [], cloudDataLoaded: true, projectRoles: { [PID]: 'viewer' } })
    render(<TooltipProvider><SprintHistoryTab /></TooltipProvider>)
    expect([lock(button('Add Sprint')), screen.queryByText(/Configure the sprint cadence/), screen.queryAllByText('*').length])
      .toEqual([[true, VIEW_ONLY_REASON, VIEW_ONLY_REASON], null, 0])
  })

  it.each(['editor', 'owner', 'local'] as const)('%s sees no change: the controls and tooltips as before (known-bad: an editor locked out)', (s) => {
    setup(s)
    expect([
      lock(button('Add Sprint')),
      lock(button('Edit Sprint 8')),
      lock(button('Delete Sprint 8')),
      lock(button('Delete Sprint 7')),
      lock(screen.getByRole('checkbox', { name: 'Include Sprint 8 in forecast' })),
      lock(document.getElementById('sprintCadence')!),
    ]).toEqual([
      [false, null, null],
      [false, 'Edit sprint', null],
      [false, 'Delete sprint', null],
      [true, 'Only the most recent sprint can be deleted', null],
      [false, null, null],
      [true, null, null], // locked by the sprints recorded, as before
    ])
    expect(screen.getByText('(Delete all sprints to change)')).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('the Sprint form when the access drops mid-edit, or a click races the drop (V2)', () => {
  it.each([
    ['Add', () => fireEvent.click(button('Add Sprint'))],
    ['Update', () => fireEvent.click(button('Edit Sprint 8'))],
  ] as const)('%s: open as editor, type, drop to viewer → the typed value stays, Save disabled, the reason visible beside it (known-bads: typed text cleared; Save enabled; reason not visible)', (save, open) => {
    setup('editor')
    open()
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    dropTo('viewer')
    const submit = button(save) as HTMLButtonElement
    expect([doneInput()?.value, submit.disabled, shownTags(document.querySelector('form')!, VIEW_ONLY_REASON), described(submit), screen.getAllByRole('note').length])
      .toEqual(['7', true, ['P'], VIEW_ONLY_REASON, 1])
  })

  it('the access coming back re-enables Save with the typed value intact (known-bad: the drop reset the form)', () => {
    setup('editor')
    fireEvent.click(button('Add Sprint'))
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    dropTo('viewer')
    dropTo('editor')
    expect([doneInput()?.value, (button('Add') as HTMLButtonElement).disabled, screen.queryByText(VIEW_ONLY_REASON)])
      .toEqual(['7', false, null])
  })

  it.each([
    ['Add', 'addSprint', () => fireEvent.click(button('Add Sprint'))],
    ['Update', 'updateSprint', () => fireEvent.click(button('Edit Sprint 8'))],
  ] as const)('%s raced: the store refuses (returns false) → the form stays open with the typed value (known-bad: form closed on a refused save)', (save, action, open) => {
    setup('editor')
    open()
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    act(() => { useProjectStore.setState({ [action]: () => false }) })
    fireEvent.click(button(save))
    expect([doneInput()?.value, useProjectStore.getState().sprints.length]).toEqual(['7', 8])
  })

  it('a save the store accepts still closes the form (control)', () => {
    setup('editor')
    fireEvent.click(button('Add Sprint'))
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    fireEvent.click(button('Add'))
    expect([doneInput(), useProjectStore.getState().sprints.length]).toEqual([null, 9])
  })
})

describe('V10 — the sprint form is tied to the project it was opened for', () => {
  const Q = seedProject({ id: 'q', name: 'Quartz' })
  let emitted: SyncEvent[] = []
  beforeEach(() => {
    emitted = []
    vi.spyOn(syncBus, 'emit').mockImplementation((e: SyncEvent) => { emitted.push(e) })
  })
  /** Beta (the fixture, 8 sprints, editable) and Quartz (no sprints), Beta on screen. */
  function setupTwo() {
    seedStores('control')
    useStorageModeStore.setState({ mode: 'cloud' })
    useProjectStore.setState({
      projects: [...useProjectStore.getState().projects, Q],
      cloudDataLoaded: true,
      projectRoles: { [PID]: 'editor', q: 'owner' },
    })
    render(<TooltipProvider><SprintHistoryTab /></TooltipProvider>)
  }
  /** Beta leaves the list, as a cloud view without it does (unshared from the user, or deleted). */
  const leaveState = () => useProjectStore.setState({ projects: [Q], sprints: [], projectRoles: { q: 'owner' } })
  const toasts = () => vi.mocked(toast.error).mock.calls.map((c) => c[0])
  const projectEvents = () => emitted.filter((e) => e.type.startsWith('project:'))
  const OPEN = [
    ['Add', () => fireEvent.click(button('Add Sprint'))],
    ['Update', () => fireEvent.click(button('Edit Sprint 8'))],
  ] as const

  it.each(OPEN)('%s: its project leaves the list → the form closes, T15 once with its name, nothing written (known-bads: K-FORM-STAYS, K-T15-SILENT)', (_save, open) => {
    setupTwo()
    open()
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    act(leaveState)
    expect([doneInput(), toasts(), projectEvents(), useProjectStore.getState().sprints.length])
      .toEqual([null, [PROJECT_LEFT_TEXT('Beta')], [], 0])
  })

  it.each(OPEN)('%s raced: a save in the same moment its project leaves writes nothing anywhere, and T15 shows once (known-bad: K-FORM-RETARGET)', (save, open) => {
    setupTwo()
    open()
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    act(() => {
      leaveState()
      fireEvent.click(button(save))
    })
    expect([doneInput(), toasts(), projectEvents(), useProjectStore.getState().sprints.length])
      .toEqual([null, [PROJECT_LEFT_TEXT('Beta')], [], 0])
  })

  it('a switch through the <select> closes the form with no message, and switching back does not reopen it (control)', () => {
    setupTwo()
    fireEvent.click(button('Add Sprint'))
    fireEvent.change(doneInput()!, { target: { value: '7' } })
    const select = screen.getByRole('combobox', { name: 'Project' })
    fireEvent.change(select, { target: { value: 'q' } })
    const afterSwitch = doneInput()
    fireEvent.change(select, { target: { value: PID } })
    expect([afterSwitch, doneInput(), toasts(), projectEvents()]).toEqual([null, null, [], []])
  })
})
