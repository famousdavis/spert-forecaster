// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useIsClient } from '@/shared/hooks/useIsClient'

/**
 * The copyright year: the one source the footer and the About page's © line both read (FRAME26 pass 3, Y1), so the
 * two can never show different years.
 */
export function copyrightYear(): number {
  return new Date().getFullYear()
}

/**
 * The year as rendered. The shell is prerendered at build time, so the HTML carries the build's year; after 1 January
 * the browser's year differs. `suppressHydrationWarning` (on this element only) lets hydration keep the build's text
 * without a mismatch, and the key changes once hydration is over, so React mounts a fresh element with the browser's
 * year. In a render that is not a hydration, `useIsClient` is true at once and the browser's year is the first text.
 */
export function CopyrightYear() {
  const isClient = useIsClient()
  return (
    <span key={isClient ? 'client' : 'prerender'} suppressHydrationWarning>
      {copyrightYear()}
    </span>
  )
}
