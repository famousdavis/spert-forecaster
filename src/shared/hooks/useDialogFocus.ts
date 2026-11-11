// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Where focus goes when a dialog opens and when it closes: ConfirmDialog's rule since v0.50.2,
 * shared by every dialog since v0.50.3.
 *
 * Open: remember what had focus, then focus `initialFocus()`. Close, or unmount while open: focus
 * goes back to what had it, or to `returnFocusTo()` when the caller gives one. `returnFocusTo` is
 * read at close time, from the render that closed the dialog; null leaves focus where it is.
 * Before v0.50.2 every dialog let focus fall to <body> (measured on a production build: Escape in
 * "Replace all data" on the Projects tab), so a keyboard user started again from the top.
 *
 * The close runs in a passive-effect CLEANUP, after the commit that closed the dialog, so the
 * dialog is gone and the page behind it is current. A caller that moves focus in its own passive
 * effect (useProjectDelete) still has the last word: in a commit, every passive-effect cleanup
 * runs before any passive effect.
 */
export function useDialogFocus(
  isOpen: boolean,
  initialFocus: () => HTMLElement | null | undefined,
  returnFocusTo?: () => HTMLElement | null,
): void {
  // The latest callbacks. A layout effect, so the cleanup below (which runs after every layout
  // effect of the same commit) reads the closing render's.
  const initialRef = useRef(initialFocus)
  const returnRef = useRef(returnFocusTo)
  useLayoutEffect(() => {
    initialRef.current = initialFocus
    returnRef.current = returnFocusTo
  })

  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement
    initialRef.current()?.focus()
    return () => {
      // An opener that has left the page (a deleted row's Delete) takes no focus: focus() on a
      // detached element does nothing, so focus stays on <body>.
      const target = returnRef.current ? returnRef.current() : opener
      if (target instanceof HTMLElement) target.focus()
    }
  }, [isOpen])
}
