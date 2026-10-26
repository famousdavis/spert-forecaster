// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * public/.well-known/security.txt (RFC 9116) is how a security researcher, or
 * an enterprise reviewer's scanner, finds where to report a vulnerability in
 * SPERT Forecaster. It is a static file: nothing in the build, the type checker or the
 * linter reads it, so a typo in a field name, a lost Contact line or a lapsed
 * date ships silently.
 *
 * Every SPERT Suite site serves the same file, with only the app name, host
 * and repository changed, and they share one Expires date so that all of them
 * renew together.
 *
 * The date is the part that rots. RFC 9116 requires an `Expires` field and
 * advises keeping it less than a year ahead, and a reader is told to treat an
 * expired file as stale. So this guard fails in TWO directions on purpose:
 *
 *   - more than 366 days ahead: the date was set too far out
 *   - 30 days or less ahead: THIS IS THE RENEWAL REMINDER. The ship gate and CI
 *     turn red a month before the file expires, on whatever change happens to
 *     be in flight. Renew by moving `Expires` about eleven months forward and
 *     releasing. Do not loosen the 30 days to make a red go away.
 *
 * SECURITY_TXT_PATH points the file checks at another copy. It exists so each
 * assertion can be shown failing against a mutated copy kept OUTSIDE the
 * repository: a copy under public/ would be served by the site, and one under
 * src/ could be picked up by other tests. The tracked-file check always looks
 * at the repository itself.
 */

const ROOT = process.cwd()
const REPO_PATH = 'public/.well-known/security.txt'
const FILE = process.env.SECURITY_TXT_PATH ?? join(ROOT, REPO_PATH)

const HOST = 'forecaster.spertsuite.com'
const REPOSITORY = 'famousdavis/spert-forecaster'

const DAY_MS = 24 * 60 * 60 * 1000
const RENEWAL_WARNING_DAYS = 30
const MAX_DAYS_AHEAD = 366

const text = existsSync(FILE) ? readFileSync(FILE, 'utf-8') : ''

/** Field lines only: comments start with `#`, and blank lines carry nothing. */
const fieldLines = text
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '' && !line.startsWith('#'))

/** RFC 9116 field names are case-insensitive, so compare them lowercased. */
function values(field: string): string[] {
  const prefix = `${field.toLowerCase()}:`
  return fieldLines
    .filter((line) => line.toLowerCase().startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
}

describe('security.txt', () => {
  it('exists', () => {
    expect(existsSync(FILE), `${FILE} is missing`).toBe(true)
  })

  /**
   * An ignored file passes every check below locally and then never reaches
   * production.
   */
  it('is tracked by git, not ignored', () => {
    const listed = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--', REPO_PATH],
      { cwd: ROOT, encoding: 'utf-8' },
    ).trim()

    expect(listed, `${REPO_PATH} is ignored or missing, so it would never be deployed`).toBe(
      REPO_PATH,
    )
  })

  it('is ASCII only and ends with a newline', () => {
    expect(/^[\t\n\r\x20-\x7e]*$/.test(text), 'non-ASCII character in the file').toBe(true)
    expect(text.endsWith('\n'), 'the file must end with a newline').toBe(true)
  })

  it('writes every non-comment, non-blank line as `Field: value`', () => {
    const malformed = fieldLines.filter((line) => !/^[A-Za-z][A-Za-z0-9-]*: \S/.test(line))

    expect(fieldLines.length).toBeGreaterThan(0)
    expect(malformed, `not in \`Field: value\` form:\n  ${malformed.join('\n  ')}`).toEqual([])
  })

  describe('Expires', () => {
    const expires = values('Expires')
    const when = Date.parse(expires[0] ?? '')
    const daysAhead = (when - Date.now()) / DAY_MS

    it('appears exactly once', () => {
      expect(expires).toHaveLength(1)
    })

    it('is an ISO 8601 date-time', () => {
      expect(expires[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/)
      expect(Number.isNaN(when), `${expires[0]} does not parse as a date`).toBe(false)
    })

    it(`is more than ${RENEWAL_WARNING_DAYS} days away (the renewal reminder)`, () => {
      expect(
        daysAhead,
        `security.txt expires on ${expires[0]}, ${Math.floor(daysAhead)} days from now. ` +
          'Move Expires about eleven months forward and release.',
      ).toBeGreaterThan(RENEWAL_WARNING_DAYS)
    })

    it(`is no more than ${MAX_DAYS_AHEAD} days away (RFC 9116 advises under a year)`, () => {
      expect(daysAhead, `Expires ${expires[0]} is too far ahead`).toBeLessThanOrEqual(
        MAX_DAYS_AHEAD,
      )
    })
  })

  it('names the security mailbox as the first Contact', () => {
    expect(values('Contact')[0]).toBe('mailto:security@spertsuite.com')
  })

  it("names this repository's private vulnerability reporting as the second Contact", () => {
    expect(values('Contact')[1]).toBe(`https://github.com/${REPOSITORY}/security/advisories/new`)
  })

  it('declares the canonical URL it is served from', () => {
    expect(values('Canonical')).toEqual([`https://${HOST}/.well-known/security.txt`])
  })

  it('points Policy at the SPERT Suite security page', () => {
    expect(values('Policy')).toEqual(['https://spertsuite.com/security'])
  })
})
