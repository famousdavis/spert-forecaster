// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect } from 'react'

// v0.54.0 (FRAME26 pass 3, F1): one counted lock for the page, as CFD's `use-scroll-lock.ts` (v0.23.0). Before it each
// dialog wrote `document.body.style.overflow` itself: cancelling the sign-in consent over the open Cloud Storage modal
// cleared the lock while Cloud Storage stayed open (a wheel over its overlay scrolled the page, 100 → 122 measured at
// 1280 × 300), and New/Edit Project, Keyboard Shortcuts and Connect AI's consent took no lock at all. Every fixed-overlay
// dialog takes this lock while it is open; a dialog over another releases only its own hold, and the page unlocks with
// the last one, restoring the value it found.
//
// `overflow: hidden` on <body> propagates to the viewport while <html> is `visible` (it is), so the wheel and the
// keyboard stop scrolling the page and its position stays where it was. The frame's root `scrollbar-gutter: stable`
// keeps the column still with classic scrollbars.

let holds = 0
let previous = ''

function hold(): void {
  if (holds === 0) {
    previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  holds++
}

function release(): void {
  holds = Math.max(0, holds - 1)
  if (holds === 0) document.body.style.overflow = previous
}

/** Keeps the page from scrolling behind a dialog while `active` (by default, while mounted). */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return
    hold()
    return release
  }, [active])
}

/** Tests only: the number of holds now. */
export function scrollLockHolds(): number {
  return holds
}
