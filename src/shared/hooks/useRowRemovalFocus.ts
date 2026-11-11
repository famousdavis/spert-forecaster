// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useRef, type RefObject } from 'react'
import { focusTargetAfterRemoval, rowKeysInOrder } from '@/shared/lib/row-focus'

/**
 * Focus after a row is removed through a ConfirmDialog (v0.50.4; the order is in row-focus.ts).
 *
 * Call `remember(key)` when the user asks to remove the row, before anything is removed: it
 * records the rows' order inside `root`. Pass `returnFocusTo` to the dialog. It reads `fallbacks`
 * when the dialog closes, so a fallback rendered only sometimes (an Add button) counts when it is
 * on the page then.
 */
export function useRowRemovalFocus(
  rootRef: RefObject<HTMLElement | null>,
  fallbacks: ReadonlyArray<RefObject<HTMLElement | null>>,
): { remember: (key: string) => void; returnFocusTo: () => HTMLElement | null } {
  const pending = useRef<{ key: string; keys: string[] } | null>(null)
  const remember = useCallback(
    (key: string) => {
      pending.current = { key, keys: rowKeysInOrder(rootRef.current) }
    },
    [rootRef],
  )
  const returnFocusTo = () => {
    const p = pending.current
    if (p === null) return null
    return focusTargetAfterRemoval(rootRef.current, p.keys, p.key, fallbacks.map((r) => r.current))
  }
  return { remember, returnFocusTo }
}
