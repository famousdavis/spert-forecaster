// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { parseChangelog } from './parse-changelog'

/**
 * The changelog page renders whatever `parseChangelog` returns for the root
 * `CHANGELOG.md`. That parser only collects `### Section` headings and `- list
 * items` — a prose paragraph matches neither pattern and is silently dropped.
 *
 * So a well-written entry can parse to nothing and render as a bare version
 * heading with no content beneath it, and every other gate stays green: the
 * markdown is valid, the build succeeds, types check, lint passes. Nothing but
 * a human opening the page in a browser would notice.
 *
 * It happened. v0.38.2 and v0.38.3 were written as pure prose, parsed to
 * `sections: []`, and shipped as empty headings for weeks before anyone looked.
 * They were fixed in v0.38.4 by keeping the prose intro and adding `###`
 * sections whose bullets carry the same content — the prose intro is
 * GitHub-only by design, and the bullets are what the app shows.
 *
 * This asserts every entry actually reaches the page with content in it.
 *
 * If this fails, the fix is in `CHANGELOG.md`, not here: give the named entry a
 * `### Section` heading and at least one `- bullet` beneath it. Do not delete
 * the prose — add bullets alongside it, the way v0.38.4 did.
 */
describe('CHANGELOG.md renders non-empty for every entry', () => {
  const markdown = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8')
  const entries = parseChangelog(markdown)

  it('parses at least one entry', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('reaches every `## ` version heading in the file', () => {
    // A heading the version regex cannot match is a whole entry that never
    // reaches the page — the same invisible failure, one level up.
    const headings = markdown
      .split('\n')
      .filter((line) => line.startsWith('## ')).length

    expect(
      entries.length,
      `${headings - entries.length} '## ' heading(s) in CHANGELOG.md do not match ` +
        "the parser's `## vX.Y.Z - YYYY-MM-DD` format and render nowhere",
    ).toBe(headings)
  })

  it('gives every entry at least one section', () => {
    const empty = entries.filter((e) => e.sections.length === 0).map((e) => e.version)

    expect(
      empty,
      `these versions render as a bare heading with no content: ${empty.join(', ')}`,
    ).toEqual([])
  })

  it('gives every section at least one item', () => {
    const empty = entries.flatMap((e) =>
      e.sections.filter((s) => s.items.length === 0).map((s) => `v${e.version} → "${s.title}"`),
    )

    expect(
      empty,
      `these sections render as a heading with nothing beneath it: ${empty.join('; ')}`,
    ).toEqual([])
  })
})
