// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'

import { MilestoneList } from './MilestoneList'
import type { Milestone } from '@/shared/types'

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm-1',
    name: 'MVP Release',
    backlogSize: 100,
    color: '#10b981',
    createdAt: 't',
    updatedAt: 't',
    ...overrides,
  }
}

const NOOP = () => {}

/**
 * Every row is 40px tall and stacked from y=0, so row N spans 40N..40N+40 and
 * its midpoint is 40N+20. jsdom reports an all-zero rect for every element, so
 * the geometry the component reads has to be stubbed in.
 */
const ROW_HEIGHT = 40
function stubRowGeometry(rows: HTMLElement[]) {
  rows.forEach((row, i) => {
    row.getBoundingClientRect = () =>
      ({ top: i * ROW_HEIGHT, height: ROW_HEIGHT }) as DOMRect
  })
}
const upperHalfOf = (rowIndex: number) => rowIndex * ROW_HEIGHT + 5
const lowerHalfOf = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT - 5

/**
 * jsdom implements no DragEvent, so testing-library falls back to a plain Event
 * and silently drops clientY from the init — which is the single coordinate
 * this whole feature turns on. Build the event and pin clientY onto it by hand.
 */
function fireDrag(
  type: 'dragStart' | 'dragOver' | 'drop',
  row: HTMLElement,
  clientY: number,
) {
  const event = createEvent[type](row, {
    dataTransfer: { setData: NOOP, dropEffect: '', effectAllowed: '' },
  })
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(row, event)
}

function renderList(onReorder: (ids: string[]) => void) {
  const { container } = render(
    <MilestoneList
      milestones={[
        makeMilestone({ id: 'm-1', name: 'Alpha' }),
        makeMilestone({ id: 'm-2', name: 'Bravo' }),
        makeMilestone({ id: 'm-3', name: 'Charlie' }),
        makeMilestone({ id: 'm-4', name: 'Delta' }),
      ]}
      unitOfMeasure="story points"
      onEdit={NOOP}
      onDelete={NOOP}
      onReorder={onReorder}
    />,
  )
  const rows = Array.from(container.querySelectorAll('tbody tr')) as HTMLElement[]
  stubRowGeometry(rows)
  return rows
}

describe('MilestoneList — drag to reorder (v0.40.1)', () => {
  it('drops an upward-dragged milestone into the gap under the hovered row', () => {
    // The reported bug, end to end: grab Delta, aim at the gap between Bravo
    // and Charlie. Through v0.40.0 Delta landed *above* Bravo — above the
    // milestone directly above the insertion line.
    const onReorder = vi.fn()
    const rows = renderList(onReorder)

    fireDrag('dragStart', rows[3], 0)
    fireDrag('dragOver', rows[1], lowerHalfOf(1))
    fireDrag('drop', rows[1], lowerHalfOf(1))

    expect(onReorder).toHaveBeenCalledWith(['m-1', 'm-2', 'm-4', 'm-3'])
  })

  it('drops a downward-dragged milestone into the gap under the hovered row', () => {
    const onReorder = vi.fn()
    const rows = renderList(onReorder)

    fireDrag('dragStart', rows[0], 0)
    fireDrag('drop', rows[2], lowerHalfOf(2))

    expect(onReorder).toHaveBeenCalledWith(['m-2', 'm-3', 'm-1', 'm-4'])
  })

  it('drops into the gap above the hovered row when aiming at its upper half', () => {
    // The same hovered row as the upward case, aimed one gap higher — the two
    // halves of a row have to reach different gaps, or half the gaps in the
    // list are unreachable.
    const onReorder = vi.fn()
    const rows = renderList(onReorder)

    fireDrag('dragStart', rows[3], 0)
    fireDrag('drop', rows[1], upperHalfOf(1))

    expect(onReorder).toHaveBeenCalledWith(['m-1', 'm-4', 'm-2', 'm-3'])
  })

  it('reaches the top of the list', () => {
    const onReorder = vi.fn()
    const rows = renderList(onReorder)

    fireDrag('dragStart', rows[2], 0)
    fireDrag('drop', rows[0], upperHalfOf(0))

    expect(onReorder).toHaveBeenCalledWith(['m-3', 'm-1', 'm-2', 'm-4'])
  })

  it('reaches the bottom of the list', () => {
    const onReorder = vi.fn()
    const rows = renderList(onReorder)

    fireDrag('dragStart', rows[0], 0)
    fireDrag('drop', rows[3], lowerHalfOf(3))

    expect(onReorder).toHaveBeenCalledWith(['m-2', 'm-3', 'm-4', 'm-1'])
  })

  it('does not reorder when dropped into either gap bracketing the dragged row', () => {
    const onReorder = vi.fn()
    const rows = renderList(onReorder)

    fireDrag('dragStart', rows[1], 0)
    fireDrag('drop', rows[1], upperHalfOf(1))
    fireDrag('drop', rows[1], lowerHalfOf(1))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('draws the insertion line in the gap the pointer marks, and only there', () => {
    // The honesty contract: the line has to sit where the drop will land. It
    // renders as the top border of the row below the gap.
    const rows = renderList(NOOP)

    fireDrag('dragStart', rows[3], 0)
    fireDrag('dragOver', rows[1], lowerHalfOf(1))

    // Gap between Bravo and Charlie → top border of Charlie, nowhere else.
    expect(rows[2].className).toContain('border-t-spert-blue')
    expect(rows.filter((r) => r.className.includes('spert-blue'))).toHaveLength(1)
  })

  it('draws the trailing line under the last row for the final gap', () => {
    // The one gap with no row below it — without this it would be invisible.
    const rows = renderList(NOOP)

    fireDrag('dragStart', rows[0], 0)
    fireDrag('dragOver', rows[3], lowerHalfOf(3))

    expect(rows[3].className).toContain('border-b-spert-blue')
    expect(rows.filter((r) => r.className.includes('spert-blue'))).toHaveLength(1)
  })

  it('is not draggable at all when onReorder is not wired', () => {
    const { container } = render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'Alpha' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
      />,
    )
    const row = container.querySelector('tbody tr')
    expect(row?.getAttribute('draggable')).toBe('false')
  })
})

describe('MilestoneList — inline rename (v0.33.5)', () => {
  it('renders the milestone name as a click-to-rename button when onRename is provided', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'MVP Release' })
    expect(trigger.getAttribute('title')).toBe('Click to rename')
  })

  it('falls back to plain text when onRename is not provided (backward compatibility)', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
      />,
    )
    // No click-to-rename button when the feature is unwired.
    expect(screen.queryByRole('button', { name: 'MVP Release' })).toBeNull()
    expect(screen.getByText('MVP Release')).not.toBeNull()
  })

  it('swaps to a text input on click and focuses it', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' }) as HTMLInputElement
    expect(input.value).toBe('MVP Release')
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('maxLength')).toBe('50')
    expect(input.getAttribute('name')).toBe('milestoneName')
  })

  it('input has size=1 so the column does not reflow on edit (no-layout-shift guard)', () => {
    // size=1 keeps the input's intrinsic min-content width tiny, preventing the
    // browser's table-auto-layout algorithm from growing the Name column to fit
    // the input's default size=20 (~200px) preference. Without this, clicking a
    // milestone name shoves Remaining / Cumulative / Color / Chart / Actions
    // to the right by ~100px.
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    expect(input.getAttribute('size')).toBe('1')
  })

  it('Enter commits a changed, non-empty trimmed value via onRename', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: '  Renamed Milestone  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('m-1', 'Renamed Milestone')
    // Editor exits.
    expect(screen.queryByRole('textbox', { name: 'Rename MVP Release' })).toBeNull()
  })

  it('Escape reverts without calling onRename', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: 'Half-typed' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    // Editor exits; the original name is back as a button.
    expect(screen.queryByRole('textbox', { name: 'Rename MVP Release' })).toBeNull()
    expect(screen.getByRole('button', { name: 'MVP Release' })).not.toBeNull()
  })

  it('blur saves when the trimmed value is non-empty and changed', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: 'Renamed via blur' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('m-1', 'Renamed via blur')
  })

  it('blur reverts when the trimmed value is empty (forgiving fallback, no save)', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: '   ' } }) // whitespace-only
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
    // Original name is restored as the click trigger.
    expect(screen.getByRole('button', { name: 'MVP Release' })).not.toBeNull()
  })

  it('blur is a no-op when the value is unchanged (no spurious save)', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    // No edit; blur immediately.
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
  })

  it('disables the click-to-rename target while the row is in full-form edit (no double-edit affordance)', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        editingId="m-1"
      />,
    )
    // No rename button while the row is in full-form edit; name shows as plain text.
    expect(screen.queryByRole('button', { name: 'MVP Release' })).toBeNull()
    expect(screen.getByText('MVP Release')).not.toBeNull()
  })

  it('each row gets a unique input id when multiple milestones are in the list (form-hygiene rule 5)', () => {
    render(
      <MilestoneList
        milestones={[
          makeMilestone({ id: 'm-1', name: 'MVP Release' }),
          makeMilestone({ id: 'm-2', name: 'Beta Release' }),
        ]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const inputA = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    const idA = inputA.getAttribute('id')
    expect(idA).toBeTruthy()
    expect(idA?.endsWith('m-1')).toBe(true)
    // Escape out and switch to the other row.
    fireEvent.keyDown(inputA, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Beta Release' }))
    const inputB = screen.getByRole('textbox', { name: 'Rename Beta Release' })
    const idB = inputB.getAttribute('id')
    expect(idB).toBeTruthy()
    expect(idB?.endsWith('m-2')).toBe(true)
    expect(idA).not.toBe(idB)
  })
})
