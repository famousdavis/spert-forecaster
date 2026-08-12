// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'

import { dropGapForPointer, reorderIntoGap } from './drag-reorder'

describe('dropGapForPointer', () => {
  // Row 2 spans y=100..140, so its midpoint is y=120.
  const ROW_INDEX = 2
  const TOP = 100
  const HEIGHT = 40

  it('targets the gap above the row when the pointer is in the upper half', () => {
    expect(dropGapForPointer(ROW_INDEX, 105, TOP, HEIGHT)).toBe(2)
  })

  it('targets the gap below the row when the pointer is in the lower half', () => {
    expect(dropGapForPointer(ROW_INDEX, 135, TOP, HEIGHT)).toBe(3)
  })

  it('treats the exact midpoint as the lower half', () => {
    // Pins the boundary direction. Either choice is defensible; what matters is
    // that the line and the drop agree, and both call this function.
    expect(dropGapForPointer(ROW_INDEX, 120, TOP, HEIGHT)).toBe(3)
    expect(dropGapForPointer(ROW_INDEX, 119, TOP, HEIGHT)).toBe(2)
  })

  it('is measured against the row, not the viewport', () => {
    // Same pointer y, two rows at different offsets: the one whose lower half
    // contains the pointer gets the gap below it.
    expect(dropGapForPointer(0, 30, 0, 40)).toBe(1) // lower half of 0..40
    expect(dropGapForPointer(1, 30, 20, 40)).toBe(1) // upper half of 20..60
  })
})

describe('reorderIntoGap', () => {
  const ITEMS = ['A', 'B', 'C', 'D']

  it('lands an upward-dragged item in the gap the line marked (v0.40.1 regression)', () => {
    // The reported bug: line drawn between B and C (gap 2), D dragged up onto
    // it. Through v0.40.0 this produced ['A', 'D', 'B', 'C'] — D above B, the
    // milestone directly above the line.
    expect(reorderIntoGap(ITEMS, 3, 2)).toEqual(['A', 'B', 'D', 'C'])
  })

  it('lands a downward-dragged item in the gap the line marked', () => {
    // A dragged down into the gap between C and D.
    expect(reorderIntoGap(ITEMS, 0, 3)).toEqual(['B', 'C', 'A', 'D'])
  })

  it('reaches the top of the list', () => {
    expect(reorderIntoGap(ITEMS, 3, 0)).toEqual(['D', 'A', 'B', 'C'])
  })

  it('reaches the bottom of the list', () => {
    expect(reorderIntoGap(ITEMS, 0, 4)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('returns null for both gaps that bracket the dragged item', () => {
    // Dropping just above or just below yourself is the identity move; callers
    // skip the store write rather than persisting an unchanged order.
    expect(reorderIntoGap(ITEMS, 1, 1)).toBeNull()
    expect(reorderIntoGap(ITEMS, 1, 2)).toBeNull()
  })

  it('does not mutate the input array', () => {
    const original = [...ITEMS]
    reorderIntoGap(ITEMS, 3, 1)
    expect(ITEMS).toEqual(original)
  })

  it('moves an item exactly one position in each direction', () => {
    // The tightest real moves, and the ones an off-by-one would swallow.
    expect(reorderIntoGap(ITEMS, 2, 1)).toEqual(['A', 'C', 'B', 'D'])
    expect(reorderIntoGap(ITEMS, 1, 3)).toEqual(['A', 'C', 'B', 'D'])
  })
})
