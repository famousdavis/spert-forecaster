// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus after Delete Milestone / Delete Adjustment (v0.50.3, F2), through the two real panels
// that use CollapsibleCrudPanel: the Delete of the row that moved into its place, else the row
// above, else + Add, else (the form is open, so + Add is hidden) the panel's header toggle.
// Known-bad (measured on a production build in v0.50.2): <body>.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { Milestones } from '@/features/forecast/components/Milestones'
import { ProductivityAdjustments } from '@/features/forecast/components/ProductivityAdjustments'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'

const T = '2026-01-01T00:00:00.000Z'
const REAL = useProjectStore.getState()

/** Milestones M1…Mn; adjustments A1 (March), A2 (January), A3 (February): the list sorts them by date. */
function seed(milestones: number, adjustments = 0): void {
  useStorageModeStore.setState({ mode: 'local' })
  const starts = ['2026-03-02', '2026-01-05', '2026-02-02']
  useProjectStore.setState({
    projects: [{
      id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T,
      milestones: Array.from({ length: milestones }, (_, k) => ({ id: `m${k}`, name: `M${k + 1}`, backlogSize: 5, color: '#3b82f6', showOnChart: true, createdAt: T, updatedAt: T })),
      productivityAdjustments: Array.from({ length: adjustments }, (_, k) => ({ id: `a${k}`, name: `A${k + 1}`, startDate: starts[k], endDate: starts[k].replace(/-0\d$/, '-20'), factor: 0.5, enabled: true, createdAt: T, updatedAt: T })),
    }],
    sprints: [],
    projectRoles: {},
  })
}

afterEach(() => {
  cleanup()
  useProjectStore.setState({ deleteMilestone: REAL.deleteMilestone })
})

const button = (name: string) => screen.getByRole('button', { name })
const focused = () => document.activeElement
const dialog = () => screen.getByRole('alertdialog')
function openMilestones(count: number) {
  render(<Milestones projectId="p" unitOfMeasure="pts" />)
  fireEvent.click(button(`Milestones (${count})`))
}
/** Focus a row's Delete and press it, as a keyboard user does (a click in jsdom moves no focus). */
function deleteRow(name: string) {
  const del = button(`Delete ${name}`)
  del.focus()
  fireEvent.click(del)
  expect(focused()?.textContent).toBe('Cancel')
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
}

describe('Delete Milestone (known-bad: <body>)', () => {
  it('a middle row: the row that moved into its place', () => {
    seed(3)
    openMilestones(3)
    deleteRow('M2')
    expect(focused()).toBe(button('Delete M3'))
  })

  it('the last row: the row above', () => {
    seed(3)
    openMilestones(3)
    deleteRow('M3')
    expect(focused()).toBe(button('Delete M2'))
  })

  it('the only row: + Add Milestone', () => {
    seed(1)
    openMilestones(1)
    deleteRow('M1')
    expect(focused()).toBe(button('+ Add Milestone'))
  })

  it('the only row, with the add form open (+ Add hidden): the panel\'s header toggle', () => {
    seed(1)
    openMilestones(1)
    fireEvent.click(button('+ Add Milestone'))
    expect(screen.queryByRole('button', { name: '+ Add Milestone' })).toBeNull()
    deleteRow('M1')
    expect(focused()).toBe(button('Milestones'))
  })

  it('Cancel: back to the same Delete', () => {
    seed(2)
    openMilestones(2)
    const del = button('Delete M1')
    del.focus()
    fireEvent.click(del)
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(focused()).toBe(button('Delete M1'))
  })

  it('a delete the store refuses keeps the row, and focus goes back to its Delete', () => {
    seed(2)
    useProjectStore.setState({ deleteMilestone: () => false })
    openMilestones(2)
    deleteRow('M1')
    expect(focused()).toBe(button('Delete M1'))
  })
})

describe('Delete Adjustment: page order, not stored order (known-bad: <body>)', () => {
  // Shown by start date: A2 (Jan), A3 (Feb), A1 (Mar). Stored order is A1, A2, A3.
  function openAdjustments() {
    seed(0, 3)
    render(<ProductivityAdjustments projectId="p" />)
    fireEvent.click(screen.getByRole('button', { name: /^Productivity Adjustments/ }))
    expect(screen.getAllByRole('button', { name: /^Delete A/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Delete A2', 'Delete A3', 'Delete A1'])
  }

  it('the middle row on the page: the one below it on the page', () => {
    openAdjustments()
    deleteRow('A3')
    expect(focused()).toBe(button('Delete A1'))
  })

  it('the last row on the page (first stored): the one above it on the page', () => {
    openAdjustments()
    deleteRow('A1')
    expect(focused()).toBe(button('Delete A3'))
  })
})
