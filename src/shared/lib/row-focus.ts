// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Where focus goes when a row leaves a list (v0.50.4).
//
// Removing a row removes the control that had focus (its Delete, its Revoke), and focus falls to
// <body>: a keyboard user starts again from the top of the page. Each such control carries
// `data-row-key="<the row's id>"`. When the user asks to remove a row, the caller records the keys
// in page order; once the confirmation has closed it asks for, in order:
//   1. the row's own control, still on the page: the removal was cancelled or refused;
//   2. the control of the row that moved into its place (the next one);
//   3. the control of the row above it;
//   4. the caller's fallbacks (the list's Add button, say).
// A candidate that is disabled or no longer on the page is skipped: focus() on either does nothing.

export const ROW_KEY_ATTR = 'data-row-key'

/** The row keys inside `root`, in page order. */
export function rowKeysInOrder(root: ParentNode | null | undefined): string[] {
  if (!root) return []
  return Array.from(root.querySelectorAll(`[${ROW_KEY_ATTR}]`), (el) => el.getAttribute(ROW_KEY_ATTR) ?? '')
}

/** The control inside `root` carrying this row key, if one is on the page. */
function rowControl(root: ParentNode | null | undefined, key: string | undefined): Element | null {
  if (!root || key === undefined) return null
  // Compared, not put into a selector: an id needs no CSS escaping this way.
  for (const el of root.querySelectorAll(`[${ROW_KEY_ATTR}]`)) {
    if (el.getAttribute(ROW_KEY_ATTR) === key) return el
  }
  return null
}

function canTakeFocus(el: Element | null | undefined): el is HTMLElement {
  return el instanceof HTMLElement && el.isConnected && !el.matches(':disabled')
}

/**
 * Where focus goes once the row `removedKey` may have left `root`: see the order above.
 * `keys` is `rowKeysInOrder(root)` as it was when the user asked to remove the row.
 */
export function focusTargetAfterRemoval(
  root: ParentNode | null | undefined,
  keys: readonly string[],
  removedKey: string,
  fallbacks: ReadonlyArray<Element | null | undefined>,
): HTMLElement | null {
  const at = keys.indexOf(removedKey)
  const candidates = [
    rowControl(root, removedKey),
    at >= 0 ? rowControl(root, keys[at + 1]) : null,
    at > 0 ? rowControl(root, keys[at - 1]) : null,
    ...fallbacks,
  ]
  return candidates.find(canTakeFocus) ?? null
}
