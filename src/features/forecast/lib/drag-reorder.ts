// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Drag-to-reorder mechanics, expressed in *gaps* rather than rows.
 *
 * A gap is a position between rows, indexed 0..length: gap 0 is above the first
 * row, gap N is below the last. The distinction is the whole point. A row index
 * cannot say whether the dragged item lands above or below that row, so a
 * row-indexed drop has to guess — and through v0.40.0 MilestoneList guessed
 * differently depending on drag direction while always drawing the insertion
 * line below the hovered row:
 *
 *   [A, B, C, D], drag D onto B, line drawn under B
 *     splice-out then splice-in at row index 1 → [A, D, B, C]   D lands ABOVE B
 *
 * Dragging down happened to agree with the line (removing the item first shifts
 * the later indices down by one, which cancels the off-by-one), so the defect
 * only surfaced on upward drags — the direction the user reported.
 *
 * Resolving the pointer to a gap removes the guess: the line and the drop are
 * computed from the same gap, so the item always lands where the line was.
 */

/**
 * Resolve the gap a pointer is targeting within a row: the upper half of the
 * row means the gap above it, the lower half the gap below.
 *
 * Takes primitives rather than a DOMRect so it stays trivially pure — jsdom's
 * getBoundingClientRect is all zeros, which would make this untestable through
 * a rect.
 */
export function dropGapForPointer(
  rowIndex: number,
  pointerY: number,
  rowTop: number,
  rowHeight: number
): number {
  return pointerY >= rowTop + rowHeight / 2 ? rowIndex + 1 : rowIndex
}

/**
 * Move the item at `fromIndex` into `gapIndex`, returning the new order.
 *
 * Returns null when the move is a no-op, so callers can skip a pointless store
 * write: the two gaps bracketing an item (`fromIndex` and `fromIndex + 1`) are
 * that item's own position, and dropping into either leaves the order unchanged.
 */
export function reorderIntoGap<T>(items: T[], fromIndex: number, gapIndex: number): T[] | null {
  if (gapIndex === fromIndex || gapIndex === fromIndex + 1) return null

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  // Removing the item first shifts every later position down by one, so a gap
  // beyond the item's old home has to come back by one to stay the same gap.
  next.splice(gapIndex > fromIndex ? gapIndex - 1 : gapIndex, 0, moved)
  return next
}
