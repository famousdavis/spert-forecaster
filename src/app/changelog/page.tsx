// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from 'fs'
import { join } from 'path'
import { parseChangelog } from '@/features/changelog/lib/parse-changelog'
import { ChangelogContent } from '@/features/changelog'
import { HeadingRow } from '@/shared/components/HeadingRow'

/**
 * The changelog, reached from the footer's Version link. It renders inside the SPERT® Suite frame, which the root
 * layout holds (v0.52.0): the brand row, the navigation (with no item active: no item leads here), the notices and the
 * footer are the frame's. Until v0.52.0 it had its own small header ("← Back to SPERT Forecaster") and no frame; the
 * brand and the navigation replace that link. Its body is capped (X4) and both elements below are direct children of
 * `main`, so the heading row stays full width.
 */
export default function ChangelogPage() {
  const markdown = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8')
  const entries = parseChangelog(markdown)

  return (
    <>
      <HeadingRow>Changelog</HeadingRow>
      <div className="sf-below">
        <ChangelogContent entries={entries} />
      </div>
    </>
  )
}
