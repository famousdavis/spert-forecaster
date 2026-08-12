// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, createEvent } from '@testing-library/react'

import { ProjectList } from './ProjectList'
import type { Project } from '@/shared/types'

function makeProject(id: string, name: string): Project {
  return { id, name, unitOfMeasure: 'story points', createdAt: 't', updatedAt: 't' }
}

const NOOP = () => {}

/**
 * jsdom implements no DragEvent, so testing-library falls back to a plain Event.
 * dataTransfer is the one init key it does attach to the event, and ProjectList
 * touches four of its members on dragstart — including setDragImage, which the
 * milestone list does not use.
 */
function fireDrag(type: 'dragStart' | 'dragOver' | 'drop', el: Element) {
  fireEvent(
    el,
    createEvent[type](el, {
      dataTransfer: { setData: NOOP, setDragImage: NOOP, dropEffect: '', effectAllowed: '' },
    }),
  )
}

function renderList(onReorder: (ids: string[]) => void) {
  const { container } = render(
    <ProjectList
      projects={[
        makeProject('p-1', 'Alpha'),
        makeProject('p-2', 'Bravo'),
        makeProject('p-3', 'Charlie'),
        makeProject('p-4', 'Delta'),
      ]}
      onEdit={NOOP}
      onDelete={NOOP}
      onExport={NOOP}
      onClone={NOOP}
      onReorder={onReorder}
      onViewHistory={NOOP}
    />,
  )
  return Array.from(container.querySelectorAll('[data-tile="true"]'))
}

/** Drag the tile in `fromSlot` onto the tile in `ontoSlot` (both 0-based). */
function dragTileOnto(tiles: Element[], fromSlot: number, ontoSlot: number) {
  fireDrag('dragStart', tiles[fromSlot].querySelector('[draggable="true"]')!)
  fireDrag('dragOver', tiles[ontoSlot])
  fireDrag('drop', tiles[ontoSlot])
}

/**
 * ProjectList marks its drop target by drawing a box around a whole tile, and a
 * box surrounds a *slot* — so the promise it makes is "the dragged project will
 * take this position", and it keeps that promise in both directions.
 *
 * MilestoneList marks its target with a line, and a line has no slot to sit in;
 * it can only denote a boundary, which is why v0.40.1 had to move that list to a
 * gap model (`forecast/lib/drag-reorder.ts`). The two lists differ on purpose.
 *
 * Do NOT "fix" this file's expectations by adopting reorderIntoGap() here. Under
 * a gap model the *upward* cases below are unchanged and the *downward* ones
 * silently shift by one — which is a regression that only shows in one
 * direction, exactly the shape of the bug v0.40.1 removed from the other list.
 */
describe('ProjectList — drag to reorder lands the project in the boxed slot', () => {
  it('dragging DOWN puts the project in the boxed slot, not one past it', () => {
    // The case a gap model would break. Alpha (slot 1) onto Charlie (slot 3):
    // Alpha takes slot 3 and Bravo/Charlie close up behind it.
    const onReorder = vi.fn()
    const tiles = renderList(onReorder)

    dragTileOnto(tiles, 0, 2)

    expect(onReorder).toHaveBeenCalledWith(['p-2', 'p-3', 'p-1', 'p-4'])
  })

  it('dragging UP puts the project in the boxed slot', () => {
    // Delta (slot 4) onto Bravo (slot 2): Delta takes slot 2, Bravo/Charlie
    // shift down.
    const onReorder = vi.fn()
    const tiles = renderList(onReorder)

    dragTileOnto(tiles, 3, 1)

    expect(onReorder).toHaveBeenCalledWith(['p-1', 'p-4', 'p-2', 'p-3'])
  })

  it('lands in the boxed slot from every start position, in both directions', () => {
    // The invariant behind both cases above, stated once over all 12 moves: the
    // dragged project's index in the new order is always the index of the tile
    // the box was drawn around.
    for (let from = 0; from < 4; from += 1) {
      for (let onto = 0; onto < 4; onto += 1) {
        if (from === onto) continue
        const onReorder = vi.fn()
        const tiles = renderList(onReorder)

        dragTileOnto(tiles, from, onto)

        const newOrder = onReorder.mock.calls[0][0] as string[]
        const draggedId = ['p-1', 'p-2', 'p-3', 'p-4'][from]
        expect(newOrder.indexOf(draggedId), `dragging slot ${from} onto slot ${onto}`).toBe(onto)
      }
    }
  })

  it('marks the hovered tile, and only that tile', () => {
    const tiles = renderList(NOOP)

    fireDrag('dragStart', tiles[0].querySelector('[draggable="true"]')!)
    fireDrag('dragOver', tiles[2])

    expect(tiles[2].className).toContain('border-spert-blue')
    expect(tiles.filter((t) => t.className.includes('border-spert-blue'))).toHaveLength(1)
  })

  it('dropping a project on itself reorders nothing', () => {
    const onReorder = vi.fn()
    const tiles = renderList(onReorder)

    dragTileOnto(tiles, 1, 1)

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('only the drag handle starts a drag, so the tile stays clickable', () => {
    // The whole tile is a drop target, but the tile itself is not draggable —
    // otherwise pressing the name button or an action icon could begin a drag.
    const tiles = renderList(NOOP)

    expect(tiles[0].getAttribute('draggable')).toBeNull()
    expect(tiles[0].querySelectorAll('[draggable="true"]')).toHaveLength(1)
  })
})
