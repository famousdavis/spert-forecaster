// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Link from 'next/link'
import { HeadingRow } from '@/shared/components/HeadingRow'

/**
 * Any address no route matches (v0.53.0, FRAME26 clean-up F5), in SPERT® CFD's, MyScrumBudget's and Scheduler's words.
 * Until then Next's own 404 showed an `h1` "404" and an `h2` "This page could not be found." inside the frame's `main`,
 * with no heading row. It renders in the frame (the root layout holds it), with the frame's heading row and the page's
 * one `h1`. No navigation item leads here, so none is active. Nothing in the app links to an unknown address, so a 404
 * is a fresh load and "/" opens on Projects.
 */
export default function NotFound() {
  return (
    <>
      <HeadingRow>Page not found</HeadingRow>
      <div className="sf-below">
        <p>There&apos;s no page at this address.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Back to Projects
        </Link>
      </div>
    </>
  )
}
