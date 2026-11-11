// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Focus when the import preview goes (v0.50.4, F4 and F5). Returns the ref for the toolbar's
 * Import button.
 *
 * The preview leaves the page when its import is applied (its Import, or Replace all data once
 * confirmed), when it is cancelled (its Cancel, or Escape), or when a failure replaces it with a
 * banner. Focus inside it fell to <body>. Once it has gone, focus goes to the toolbar's Import,
 * the control that starts an import, else New Project (Import is disabled while the first cloud
 * load is pending). Only when focus was lost: focus the user has put anywhere else stays there.
 *
 * Replace all data is why this is not ConfirmDialog's `returnFocusTo`: that dialog closes inside
 * `flushSync(setApplying(true))` (useImportState), while the preview is still up and Import is
 * disabled. The preview goes, and Import comes back, in a LATER commit, once the data is written.
 */
export function useImportFocusReturn(
  previewOpen: boolean,
  newProjectRef: RefObject<HTMLButtonElement | null>,
): RefObject<HTMLButtonElement | null> {
  const importRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(previewOpen)
  useEffect(() => {
    const closed = wasOpen.current && !previewOpen
    wasOpen.current = previewOpen
    if (!closed) return
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    const target = [importRef.current, newProjectRef.current].find((b) => b !== null && !b.disabled)
    target?.focus()
  }, [previewOpen, newProjectRef])
  return importRef
}
