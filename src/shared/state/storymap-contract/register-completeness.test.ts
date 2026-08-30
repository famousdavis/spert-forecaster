// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The register goes SHORT SILENTLY, and this is the check that stops it.
 *
 * `storymap-contract.test.ts` already asserts that every registered message still exists in
 * the hook. That is one direction only. Nothing asserted the converse — that every refusal in
 * the hook is registered — so a new refusal could be added and the register would simply not
 * mention it, with the whole suite green. Four such refusals existed at the time this was
 * written.
 *
 * ── THE WRITTEN PREDICATE ───────────────────────────────────────────────────
 * A refusal is REGISTRABLE when it is a STATIC single-quoted literal that reaches the user by
 * one of the two shapes the ingest path uses:
 *
 *   1. an argument to `refuse(…)` inside `ingestPayload` — the shared half, both transports;
 *   2. the `text:` of a single-line `showBanner({ kind: 'error', text: '…' })` — the arrival
 *      gates in `handleFileChange`, which are file-only by design.
 *
 * Everything else is out of population, and each exclusion is named below with its reason
 * rather than being silently absent. Two categories are excluded by construction:
 *
 *   - INTERPOLATED messages (backticks). The register matches messages as plain substrings of
 *     the hook's source, with NO `${…}` handling — unlike the F-row path, which builds a
 *     regex via `templateToRegExp`. An interpolated message could never be pinned, so
 *     registering one would create a row that can only rot.
 *   - Refusals raised OUTSIDE the ingest path — by the apply path (`The workspace changed…`)
 *     or by the readiness predicate (`Cloud projects are still loading…`). Those are facts
 *     about the workspace and the session, not about the payload, and the register's subject
 *     is what a Story Map export can trip.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRE_VALIDATOR_REGISTER } from './register'

const HOOK_PATH = join(
  import.meta.dirname, '..', '..', '..', 'features', 'projects', 'hooks', 'useImportState.ts',
)
const HOOK_SOURCE = readFileSync(HOOK_PATH, 'utf8')

/**
 * Static refusal literals, per the predicate above.
 *
 * Exported shape is a Set so the comparison is by MESSAGE, never by position — this release
 * scrambles source order, and a positional comparison would report every row as moved.
 */
export function extractRegistrableRefusals(source: string): Set<string> {
  const found = new Set<string>()

  // (1) every `refuse(…)` call, including multi-line ternary forms. Scan from the call to its
  // matching close paren so both branches of a two-wording refusal are captured.
  for (const match of source.matchAll(/refuse\(/g)) {
    const start = match.index + match[0].length
    let depth = 1
    let i = start
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') depth--
      i++
    }
    const call = source.slice(start, i - 1)
    if (call.includes('`')) continue // interpolated — excluded by construction
    // A two-wording refusal is `cond ? 'A' : 'B'`, and the CONDITION contains literals too
    // (`transport === 'file'`). Only value position is a message, so scan from the first `?`.
    const valuePosition = call.includes('?') ? call.slice(call.indexOf('?')) : call
    for (const lit of valuePosition.matchAll(/'((?:[^'\\]|\\.)+)'/g)) {
      found.add(lit[1].replace(/\\'/g, "'"))
    }
  }

  // (2) single-line error banners — the arrival gates.
  for (const m of source.matchAll(/showBanner\(\{ kind: 'error', text: '((?:[^'\\]|\\.)+)' \}\)/g)) {
    found.add(m[1].replace(/\\'/g, "'"))
  }

  return found
}

/**
 * Registrable refusals that are deliberately NOT rows. Each needs a reason, so that "not
 * registered" is a decision on the record rather than an oversight.
 */
const EXCLUDED: Record<string, string> = {
  'Import failed: Could not read file':
    'A FileReader failure — a property of the browser, not of the payload. The crosslink ' +
    'transport has no FileReader at all, so no Story Map export can reach it.',
}

describe('register completeness — every refusal in the predicate is registered', () => {
  const registered = new Set(PRE_VALIDATOR_REGISTER.map((r) => r.message))
  const found = extractRegistrableRefusals(HOOK_SOURCE)

  it('finds refusals at all (guards against a vacuous pass)', () => {
    // The failure this exists to prevent: a broken extractor returns an empty set and every
    // assertion below passes while nothing is being checked.
    expect(found.size).toBeGreaterThanOrEqual(7)
  })

  it('registers every refusal the predicate finds, or excludes it with a reason', () => {
    const unaccounted = [...found].filter((m) => !registered.has(m) && !(m in EXCLUDED))
    expect(unaccounted, 'refusals in the hook that no register row mentions').toEqual([])
  })

  it('every register row is still produced by the hook', () => {
    // The other direction, by SET and keyed on message — never on `line`, and never
    // positionally, because this release moves every one of these.
    const missing = [...registered].filter((m) => !HOOK_SOURCE.includes(m))
    expect(missing, 'register rows no longer produced').toEqual([])
  })

  it('does not carry an exclusion for a refusal that no longer exists', () => {
    // An exclusion that outlives its refusal is dead weight that still looks like a decision.
    const stale = Object.keys(EXCLUDED).filter((m) => !found.has(m))
    expect(stale, 'exclusions with nothing to exclude').toEqual([])
  })

  it('gives every row a unique message', () => {
    const messages = PRE_VALIDATOR_REGISTER.map((r) => r.message)
    expect(new Set(messages).size).toBe(messages.length)
  })

  it('covers BOTH transports — the crosslink wordings are registered too', () => {
    expect(registered.has('The file contains no projects to import.')).toBe(true)
    expect(registered.has('The transfer contains no projects to import.')).toBe(true)
  })
})

// ── Controls: the extractor itself, driven directly, in BOTH directions ─────
// A control that only proves "it finds the thing I expect" passes happily while the
// classifier is broken for everything else. These exercise the discriminator each way.
describe('extractRegistrableRefusals — the shipped extractor', () => {
  it('FINDS a single-argument refuse', () => {
    expect(extractRegistrableRefusals(`refuse('Import failed: nope')`)).toEqual(
      new Set(['Import failed: nope']),
    )
  })

  it('FINDS BOTH branches of a two-wording refuse', () => {
    const src = `return refuse(\n  transport === 'file'\n    ? 'A wording.'\n    : 'B wording.',\n)`
    const out = extractRegistrableRefusals(src)
    expect(out.has('A wording.')).toBe(true)
    expect(out.has('B wording.')).toBe(true)
  })

  it('FINDS a single-line error banner', () => {
    expect(
      extractRegistrableRefusals(`showBanner({ kind: 'error', text: 'Gate refused.' })`),
    ).toEqual(new Set(['Gate refused.']))
  })

  it('SKIPS the CONDITION of a two-wording refuse, not just its branches', () => {
    // `transport === 'file'` is a discriminator, not a message. Without this the extractor
    // reports "file" as an unregistered refusal — which it did, on first run.
    const src = `refuse(\n  transport === 'file'\n    ? 'A wording.'\n    : 'B wording.',\n)`
    expect(extractRegistrableRefusals(src).has('file')).toBe(false)
  })

  it('SKIPS an interpolated refuse — it could never be pinned by substring', () => {
    expect(extractRegistrableRefusals('refuse(`Import failed: ${err.message}`)').size).toBe(0)
  })

  it('SKIPS a SUCCESS banner — the discriminator is the kind, not the shape', () => {
    expect(
      extractRegistrableRefusals(`showBanner({ kind: 'success', text: 'All data replaced.' })`).size,
    ).toBe(0)
  })

  it('SKIPS a refusal raised outside the ingest path', () => {
    // A multi-line showBanner, as the apply path uses. Out of population by the predicate.
    const src = `showBanner({\n  kind: 'error',\n  text: 'The workspace changed during import.',\n})`
    expect(extractRegistrableRefusals(src).size).toBe(0)
  })
})
