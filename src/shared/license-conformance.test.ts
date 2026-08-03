// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * `LICENSE` is a suite-wide artifact copied by hand into nine repositories. The
 * canonical copy lives in the SPERT® Suite landing-page repository. Every line
 * is identical across all nine except line 4, which names that repo's URL.
 *
 * Hand-copying with nothing asserting conformance is exactly how it drifted
 * before, and the drift was severe and invisible for months:
 *
 *   - GanttApp shipped 48 lines and spert-cfd 64 — neither carried the GNU GPL
 *     v3 at all, just a short notice and a gnu.org hyperlink. No Sections 0–17,
 *     no patent grant, no warranty disclaimer. GPL §4 requires giving
 *     recipients a copy of the licence; a link is a weak substitute.
 *   - This repository was missing the 54-line "How to Apply These Terms"
 *     appendix entirely (648 lines against the canonical 726).
 *   - Five repos still carried the `Statistical PERT® Software Suite` brand,
 *     retired at the v1.4 rebrand in March 2026.
 *   - Six carried older, weaker ADDITIONAL TERMS that omitted the ban on
 *     *replacing* the author attribution and the visible-UI-notice requirement.
 *
 * All nine were resynchronised on 2026-07-29. This asserts one hash rather than
 * a list of symptoms, so it catches any drift — including forms nobody has
 * thought of yet — instead of only the four above.
 *
 * The clause directions in ADDITIONAL TERMS are deliberately opposite: a)/b)
 * *compel* retention of the author name, c)/d) *withhold* the brand (GPL §7(e)
 * and §7(c)). Never add a project or brand name to clause a) — it reads
 * naturally as "keep branding consistent" but would obligate every fork to
 * carry the brand, the exact opposite of reserving it. e) limits promotional
 * use of the author’s name (§7(d)); f) requires indemnification from anyone
 * who resells with contractual warranties (§7(f)).
 *
 * If this fails: do not edit LICENSE to satisfy the test. Copy the canonical
 * file from the landing-page repository, restore line 4 to this repo's URL, and
 * only update SUITE_LICENSE_BODY_SHA256 if the canonical itself changed
 * deliberately — in which case all nine repos need the same update.
 */
const SUITE_LICENSE_BODY_SHA256 =
  '06d6dbc5fee76aa6b82198254e4a7489ef20718f7bd4445b87432878d2160630'

const REPO_URL = 'https://github.com/famousdavis/spert-forecaster'

describe('LICENSE conformance with the canonical SPERT® Suite licence', () => {
  const text = readFileSync(join(process.cwd(), 'LICENSE'), 'utf-8')
  const lines = text.split('\n')

  it('names this repository on line 4', () => {
    expect(lines[3]).toBe(`Project repository: ${REPO_URL}`)
  })

  it('is byte-identical to the canonical licence apart from that line', () => {
    const normalised = [...lines]
    normalised[3] = 'Project repository: <REPO-URL>'

    const actual = createHash('sha256').update(normalised.join('\n')).digest('hex')

    expect(
      actual,
      'LICENSE has drifted from the canonical SPERT® Suite licence. ' +
        'Recopy it from the landing-page repository rather than editing it here.',
    ).toBe(SUITE_LICENSE_BODY_SHA256)
  })
})
