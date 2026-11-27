// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do. The PDF guide house rules say the same.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { AboutTab } from './AboutTab'

/**
 * The About tab hands the user two PDFs that ship as static assets in `public/`.
 * Nothing else holds the link and the file together: rename or drop one of them
 * and the build passes, ESLint passes, every type check passes, and the button
 * 404s in the user's face. This asserts the two stay in agreement.
 *
 * Since v0.54.0 (FRAME26 pass 3) the guides are the Guides section's rows, and the
 * Connect AI section links its guide a second time, as contract §7 prescribes: the
 * rows are checked in order, and every PDF link on the page is checked against public/.
 */
describe('AboutTab guide links', () => {
  it('renders a row for each shipped guide, and every PDF it links exists in public/', () => {
    const { container } = render(<AboutTab />)

    const rows = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('.sf-guide a.sf-guide-open'),
    ).map((a) => a.getAttribute('href'))

    expect(rows).toEqual([
      '/SPERTForecaster_Quick_Reference_Guide.pdf',
      '/SPERTForecaster_Connect_AI_Guide.pdf',
    ])

    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href$=".pdf"]'),
    ).map((a) => a.getAttribute('href'))
    expect(hrefs).toHaveLength(3)

    for (const href of hrefs) {
      expect(
        existsSync(join(process.cwd(), 'public', href!)),
        `${href} is linked from the About tab but missing from public/`,
      ).toBe(true)
    }
  })
})
