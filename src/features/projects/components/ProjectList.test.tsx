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
      sprints={[]}
      onViewHistory={NOOP}
      accessOf={() => 'owner'}
      canShare={() => false}
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

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

function renderTiles(opts: { canShare?: (id: string) => boolean } = {}) {
  const { container } = render(
    <ProjectList
      projects={[makeProject('p-1', 'Alpha'), makeProject('p-2', 'Bravo')]}
      sprints={[]}
      onEdit={NOOP}
      onDelete={NOOP}
      onExport={NOOP}
      onClone={NOOP}
      onReorder={NOOP}
      onViewHistory={NOOP}
      onShare={NOOP}
      accessOf={() => 'owner'}
      canShare={opts.canShare ?? (() => false)}
    />,
  )
  return { container, tiles: Array.from(container.querySelectorAll<HTMLElement>('[data-tile="true"]')) }
}

/** A tile's revealed row: the wrapper around its Export button. */
const revealRowOf = (tile: Element) => tile.querySelector('button[aria-label^="Export "]')!.parentElement!

describe('ProjectList — the revealed row (v0.49.0; was the Share slot, v0.48.2)', () => {
  it('Share (cloud owner) comes first in the revealed row; without it, Export is first and no placeholder holds its place', () => {
    // GanttApp's tile and the reviewed mock-up keep no placeholder: the row starts at Export.
    // Until v0.49.0 a 28 px placeholder lined rows up in a single-column list (B37).
    const { tiles } = renderTiles({ canShare: (id) => id === 'p-1' })
    const labels = (tile: Element) => Array.from(revealRowOf(tile).children).map((el) => el.getAttribute('aria-label'))
    expect(labels(tiles[0])).toEqual(['Share project', 'Export Alpha', 'Edit Alpha', 'Clone Alpha'])
    expect(labels(tiles[1])).toEqual(['Export Bravo', 'Edit Bravo', 'Clone Bravo'])
    expect(tiles[1].querySelector('[aria-hidden="true"].size-7')).toBeNull()
  })
})

// jsdom loads no CSS, so these pin the CLASS PAIRS that make the dashboard behave, not the pixels.
// Each half of a pair is useless alone, and a guard on one half passes while the page is wrong.
// The release measured the rendering in a browser.
describe('ProjectList — class guards (the pairs, not just the strings)', () => {
  it('the revealed row shows on tile hover, on focus inside the tile, and always without hover, AND the tile root is the group it reads', () => {
    const { tiles } = renderTiles()
    const row = revealRowOf(tiles[0])
    expect(classes(row)).toEqual(
      expect.arrayContaining(['opacity-0', 'group-hover/tile:opacity-100', 'group-focus-within/tile:opacity-100', '[@media(hover:none)]:opacity-100']),
    )
    // The pairing: the nearest `group/tile` above the row is the tile root itself.
    expect(row.parentElement!.closest('.group\\/tile')).toBe(tiles[0])
    expect(classes(tiles[0])).toContain('group/tile')
  })

  it('the grid\'s column queries are answered by an ANCESTOR carrying @container, never by the grid itself', () => {
    const { container } = renderTiles()
    const grid = container.querySelector('ul[aria-label="Projects"]')!
    expect(classes(grid)).toEqual(expect.arrayContaining(['grid-cols-1', '@min-[560px]:grid-cols-2', '@min-[860px]:grid-cols-3', 'gap-4']))
    expect(classes(grid)).not.toContain('@container')
    expect(grid.parentElement!.closest('.\\@container')).not.toBeNull()
  })

  it('the name button\'s ::after covers the tile (the root is relative), and the grip, Delete and the revealed row sit above it', () => {
    const { tiles } = renderTiles()
    const tile = tiles[0]
    const open = tile.querySelector('button[aria-label^="View history for "]')!
    expect(classes(tile)).toContain('relative')
    expect(classes(open)).toEqual(expect.arrayContaining(['after:absolute', 'after:inset-0', "after:content-['']"]))
    const grip = tile.querySelector('[draggable="true"]')!
    const deleteWrap = tile.querySelector('button[aria-label^="Delete "]')!.parentElement!
    for (const el of [grip, deleteWrap, revealRowOf(tile)]) {
      expect(classes(el), el.outerHTML.slice(0, 60)).toEqual(expect.arrayContaining(['relative', 'z-[1]']))
    }
  })

  it('the drop box REPLACES the border colour and its hover, in both themes (known-bad: a dark: border left beside it)', () => {
    const { tiles } = renderTiles()
    fireDrag('dragStart', tiles[0].querySelector('[draggable="true"]')!)
    fireDrag('dragOver', tiles[1])
    const borderColour = (el: Element) => classes(el).filter((c) => /^(dark:)?(hover:)?border-(?!2$)/.test(c))
    expect(borderColour(tiles[1])).toEqual(['border-spert-blue'])
    // Control: the tile at rest carries the rest colours and the hover's, and no drop box.
    expect(borderColour(tiles[0])).toEqual(['border-[#eee]', 'dark:border-[#2d3748]', 'hover:border-[#93c5fd]', 'dark:hover:border-[#3b82f6]'])
  })

  it('the dragged tile shows at half opacity (B26)', () => {
    const { tiles } = renderTiles()
    fireDrag('dragStart', tiles[0].querySelector('[draggable="true"]')!)
    expect([classes(tiles[0]).includes('opacity-50'), classes(tiles[1]).includes('opacity-50')]).toEqual([true, false])
  })
})
