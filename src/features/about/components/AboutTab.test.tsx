// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
 */
describe('AboutTab guide links', () => {
  it('renders a link for each shipped guide, and each target exists in public/', () => {
    const { container } = render(<AboutTab />)

    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href$=".pdf"]'),
    ).map((a) => a.getAttribute('href'))

    expect(hrefs).toEqual([
      '/SPERTForecaster_Quick_Reference_Guide.pdf',
      '/SPERTForecaster_Connect_AI_Guide.pdf',
    ])

    for (const href of hrefs) {
      expect(
        existsSync(join(process.cwd(), 'public', href!)),
        `${href} is linked from the About tab but missing from public/`,
      ).toBe(true)
    }
  })
})
