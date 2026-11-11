// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus after Delete Sprint (v0.50.3, F1). Only the latest sprint can be deleted, so once it is
// gone focus goes to the Delete of the sprint that is now the latest, in either sort order; with
// none left, to Add Sprint. Known-bad (measured on a production build in v0.50.2): <body>.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SprintHistoryTab } from './SprintHistoryTab'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import { PID, seedProject, sprints } from '@/shared/state/fixtures/bad-sprint-dates'

const REAL = useProjectStore.getState()

function setup(n: number) {
  useStorageModeStore.setState({ mode: 'local' })
  useProjectStore.setState({
    projects: [seedProject()],
    sprints: sprints({}, n),
    viewingProjectId: PID,
    projectRoles: {},
    cloudDataLoaded: false,
  })
  render(<TooltipProvider><SprintHistoryTab /></TooltipProvider>)
}

beforeEach(() => setup(3))
afterEach(() => {
  cleanup()
  useProjectStore.setState({ deleteSprint: REAL.deleteSprint })
})

const button = (name: string) => screen.getByRole('button', { name })
const dialog = () => screen.getByRole('alertdialog', { name: 'Delete Sprint' })
const focused = () => document.activeElement
/** Focus a row's Delete and press it, as a keyboard user does (a click in jsdom moves no focus). */
function requestDelete(n: number) {
  const del = button(`Delete Sprint ${n}`)
  del.focus()
  fireEvent.click(del)
  expect(focused()?.textContent).toBe('Cancel')
}
const confirm = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))

describe('Delete Sprint → the new latest sprint\'s Delete (known-bad: <body>)', () => {
  it('newest first (the default order): the row below, now the latest and enabled', () => {
    requestDelete(3)
    confirm()
    expect([screen.queryByRole('alertdialog'), focused()]).toEqual([null, button('Delete Sprint 2')])
    expect((focused() as HTMLButtonElement).disabled).toBe(false)
  })

  it('oldest first: the row above', () => {
    fireEvent.click(screen.getByRole('button', { name: /Sort by sprint number/ }))
    requestDelete(3)
    confirm()
    expect(focused()).toBe(button('Delete Sprint 2'))
  })

  it('twice in a row, from the keyboard: each Delete lands on the next one', () => {
    requestDelete(3)
    confirm()
    requestDelete(2)
    confirm()
    expect(focused()).toBe(button('Delete Sprint 1'))
  })

  it('the last sprint gone: Add Sprint', () => {
    cleanup()
    setup(1)
    requestDelete(1)
    confirm()
    expect([screen.queryByRole('button', { name: /^Delete Sprint/ }), focused()]).toEqual([null, button('Add Sprint')])
  })

  it.each([
    ['Cancel', () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
  ])('%s: back to the same Delete, the sprint kept', (_how, close) => {
    requestDelete(3)
    close()
    expect([useProjectStore.getState().sprints.length, focused()]).toEqual([3, button('Delete Sprint 3')])
  })

  it('opened by a click that moves no focus (Safari, Firefox on macOS): Cancel still lands on its Delete', () => {
    expect(focused()).toBe(document.body)
    fireEvent.click(button('Delete Sprint 3'))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(focused()).toBe(button('Delete Sprint 3'))
  })

  it('a delete the store refuses keeps the row, and focus goes back to its Delete', () => {
    useProjectStore.setState({ deleteSprint: () => false })
    requestDelete(3)
    confirm()
    expect(focused()).toBe(button('Delete Sprint 3'))
  })
})
