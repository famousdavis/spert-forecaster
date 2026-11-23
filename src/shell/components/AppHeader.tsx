// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { MouseEvent, Ref } from 'react'
import Link from 'next/link'
import { APP_DESCRIPTION } from '@/shared/constants'
import { HeaderThemeToggle } from '@/shared/components/ThemeToggle'
import { UserMenu } from '@/features/auth'
import { ConnectAiLauncher } from '@/features/connect-ai/components/ConnectAiLauncher'

/*
 * The frame's brand row (FRAME26, contract §3, v0.52.0): a 56 px band on the page ground, in the shared 1600 px column.
 *
 * The brand is ONE LINK to the collection screen. Forecaster's tabs are in-memory state, and "/" with no other state
 * is the Projects tab, so the link points at "/" and, on a plain click, handles the navigation itself (show Projects,
 * and leave another route such as /changelog): its `preventDefault` stops Next's `<Link>` from navigating too. A
 * modified or middle click is left to the browser (and `<Link>` ignores it), which opens Projects in a new tab. It has no aria-label: its accessible name is its visible title, "SPERT® Forecaster" (WCAG
 * 2.5.3, label in name). Both favicons are decorative (`alt=""`) for the same reason; the stylesheet shows the one
 * for the current theme (`.sf-icon--light` / `--dark`), so a dark load never flashes the light file.
 *
 * The title is NOT a heading. The page's one `h1` is the heading row's, in `main` (contract §2).
 *
 * The title's colour (HDR26, v0.51.1; moved onto the frame at v0.52.0): Forecaster's favicon blue, `#0070f3`, as a
 * gradient from its light end on the left to its dark end on the right, drawn once on each word ("SPERT",
 * "Forecaster") with the frame's `.sf-grad`. The ramps are `--app-grad-light` and `--app-grad-dark`, set once on
 * `:root` in `src/app/globals.css`. The ® between the words is the frame's muted `.sf-mark`. Each ramp is checked at
 * every point against the page ground, at 3 : 1, because the title is 24 px bold, which is large text: light
 * `#4a93ff` → `#0056bf` on `#ffffff`, weakest 3.03; dark `#5f9fff` → `#0060d2` on `#101828`, weakest 3.04. Both clear
 * the bar by hundredths on purpose; a change to either end, or to the ground, needs a new measurement
 * (`AppShell.title-gradient.test.ts`). For the same reason the brand has no hover fade or ground of its own.
 *
 * The fallbacks are the frame's, not this file's: under `prefers-contrast: more` the title is solid in the frame's
 * heading colour (`#333333` / `#e2e8f0`), and in print it is solid black (`spert-frame.css`, `.sf-grad`).
 *
 * The space before "Forecaster" sits OUTSIDE the gradient spans, as text of the title: inside a span, jsdom's
 * accessible-name computation trims it.
 */

interface AppHeaderProps {
  /** Shows the Projects tab (and leaves any other route). */
  onNavigateHome: () => void
  /** Opens Cloud Storage from the account chip. */
  onOpenAccount: () => void
  /** The account chip, whichever state it shows: where focus goes when Cloud Storage closes. */
  accountButtonRef: Ref<HTMLButtonElement>
}

export function AppHeader({ onNavigateHome, onOpenAccount, accountButtonRef }: AppHeaderProps) {
  const handleBrandClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onNavigateHome()
  }

  return (
    <header className="sf-bar">
      <div className="sf-col sf-bar-row">
        <Link href="/" onClick={handleBrandClick} className="sf-brand" data-sf="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/spert-favicon-forecaster.png"
            alt=""
            className="sf-icon sf-icon--light ring-1 ring-white/20"
            data-sf="favicon"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/spert-favicon-forecaster-dark.png"
            alt=""
            className="sf-icon sf-icon--dark ring-1 ring-white/20"
            data-sf="favicon"
          />
          <span className="sf-title" data-sf="title">
            <span className="sf-grad">SPERT</span><span className="sf-mark">®</span>{' '}<span className="sf-grad">Forecaster</span>
          </span>
        </Link>
        <p className="sf-tagline" data-sf="tagline">{APP_DESCRIPTION}</p>
        <div className="sf-utils" data-sf="utils">
          <ConnectAiLauncher />
          <HeaderThemeToggle />
          <UserMenu buttonRef={accountButtonRef} onRequestOpen={onOpenAccount} />
        </div>
      </div>
    </header>
  )
}
