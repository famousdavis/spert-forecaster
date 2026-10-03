// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { backlogTolerance, exceedsBacklog, coversBacklog } from './backlog-tolerance'
import { computeCumulativeThresholds } from './forecast-derivations'

/** Cumulative thresholds exactly as the forecast computes them, from raw milestone figures. */
function thresholds(sizes: number[]): number[] {
  return computeCumulativeThresholds(sizes.map((backlogSize) => ({ backlogSize })))
}

/**
 * SPERT Story Map's rounding, verbatim: `round2` in spert-story-map's
 * src/lib/exportForForecaster.ts. It rounds every milestone figure and the
 * backlog separately — the whole reason the tolerance exists. A copy, because
 * the function lives in another repository; it is one line and is not the
 * thing under test here.
 */
function storyMapRound2(value: number): number {
  return Math.round(value * 100) / 100
}

describe('named cases — each one tells two candidate rules apart', () => {
  it('0.13 + 0.13 against 0.25 is rounding, not an overshoot', () => {
    // 0.125 + 0.125 = 0.25, each half rounded UP by Story Map.
    const t = thresholds([0.13, 0.13])
    expect(exceedsBacklog(t[1], 0.25, 2)).toBe(false)
    expect(coversBacklog(t[1], 0.25, 2)).toBe(true)
  })

  it('a genuine overshoot just past the allowance IS flagged (k = 2, +0.02)', () => {
    // A large overshoot like 15 against 12 is flagged by every rule anyone
    // would propose, so it cannot tell a right rule from a wrong one. This
    // one sits between the rules: past 1.5 hundredths, under 5.5.
    const t = thresholds([6.02, 6])
    expect(exceedsBacklog(t[1], 12, 2)).toBe(true)
    expect(coversBacklog(t[1], 12, 2)).toBe(false)
  })

  it('rounding UNDER the backlog is covered too (0.12 + 0.12 against 0.25)', () => {
    // 0.124 + 0.124 = 0.248 → backlog 0.25, each milestone rounded DOWN.
    const t = thresholds([0.12, 0.12])
    expect(coversBacklog(t[1], 0.25, 2)).toBe(true)
    expect(exceedsBacklog(t[1], 0.25, 2)).toBe(false)
  })

  it('a genuine shortfall just past the allowance is NOT covered (k = 2, -0.02)', () => {
    const t = thresholds([5.98, 6])
    expect(coversBacklog(t[1], 12, 2)).toBe(false)
  })

  it('float noise is not an overshoot: 0.1 + 0.2 against 0.3', () => {
    const t = thresholds([0.1, 0.2])
    expect(t[1]).toBe(0.30000000000000004)
    expect(exceedsBacklog(t[1], 0.3, 2)).toBe(false)
    expect(coversBacklog(t[1], 0.3, 2)).toBe(true)
  })

  it('the allowance is exclusive above and inclusive within, at k = 3', () => {
    // backlogTolerance(3) is two hundredths.
    expect(backlogTolerance(3)).toBeCloseTo(0.02, 12)
    expect(exceedsBacklog(10.019, 10, 3)).toBe(false)
    expect(exceedsBacklog(10.021, 10, 3)).toBe(true)
    expect(coversBacklog(9.981, 10, 3)).toBe(true)
    expect(coversBacklog(9.979, 10, 3)).toBe(false)
  })

  it('the allowance grows with k — a fixed one would be wrong at both ends', () => {
    // k = 12, all twelve figures rounded up by half a hundredth: six hundredths
    // over, honestly. A fixed allowance sized to the panel's add cap of 10 is 5.5,
    // and an Update can carry k well past that cap.
    const sizes = Array.from({ length: 12 }, () => 0.13)
    const t = thresholds(sizes)
    const backlog = storyMapRound2(12 * 0.125)
    expect(t[11] - backlog).toBeCloseTo(0.06, 9)
    expect(exceedsBacklog(t[11], backlog, 12)).toBe(false)
  })
})

/** Deterministic, so a failure reproduces. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Scenario = { raw: number[]; rawBacklog: number }

/**
 * Story-Map-shaped scenarios: k releases of remaining work, and a backlog that
 * is at least their sum (work outside every release is allowed). Four
 * families, two of them adversarial:
 *   overRound  — every figure an exact half-hundredth, so every one rounds UP
 *   underRound — every figure just under a half-hundredth, so every one rounds DOWN
 *   random     — arbitrary reals, sometimes with unallocated work
 *   ribs       — point sizes × percent complete, as Story Map computes them
 */
function scenario(family: number, k: number, rnd: () => number): Scenario {
  const int = (n: number) => Math.floor(rnd() * n)
  if (family === 0) {
    const raw = Array.from({ length: k }, () => int(40) + [1, 3, 5, 7][int(4)] / 8)
    return { raw, rawBacklog: raw.reduce((a, b) => a + b, 0) }
  }
  if (family === 1) {
    const raw = Array.from({ length: k }, () => 3 + int(40) + 0.004999)
    return { raw, rawBacklog: raw.reduce((a, b) => a + b, 0) }
  }
  if (family === 2) {
    const raw = Array.from({ length: k }, () => rnd() * 50)
    const extra = rnd() < 0.5 ? 0 : rnd() * 5
    return { raw, rawBacklog: raw.reduce((a, b) => a + b, 0) + extra }
  }
  const sizes = [0.5, 1, 2, 3, 5, 8, 13]
  const raw = Array.from({ length: k }, () => (sizes[int(sizes.length)] * int(101)) / 100)
  return { raw, rawBacklog: raw.reduce((a, b) => a + b, 0) }
}

describe('search: Story Map rounding never reads as a real overshoot, k = 1..13', () => {
  const K_MAX = 13
  const rnd = mulberry32(37)
  const maxOver: number[] = Array(K_MAX + 1).fill(0)
  const maxUnder: number[] = Array(K_MAX + 1).fill(0)
  let spuriousOver = 0
  let spuriousUncovered = 0
  let injectedMissed = 0
  let cases = 0

  for (let n = 0; n < 4 * K_MAX * 500; n++) {
    const family = n % 4
    const k = 1 + (Math.floor(n / 4) % K_MAX)
    const { raw, rawBacklog } = scenario(family, k, rnd)
    const t = thresholds(raw.map(storyMapRound2))
    const backlog = storyMapRound2(rawBacklog)
    cases++

    // Every prefix sum is <= the backlog before rounding, so any flag is spurious.
    t.forEach((threshold, i) => {
      if (exceedsBacklog(threshold, backlog, i + 1)) spuriousOver++
    })
    const fullyAllocated = family !== 2 || rawBacklog === raw.reduce((a, b) => a + b, 0)
    if (fullyAllocated && !coversBacklog(t[k - 1], backlog, k)) spuriousUncovered++
    if (family === 0) maxOver[k] = Math.max(maxOver[k], t[k - 1] - backlog)
    if (family === 1) maxUnder[k] = Math.max(maxUnder[k], backlog - t[k - 1])

    // Non-vacuity: at this case's own magnitude, a threshold a thousandth past
    // the allowance MUST be flagged and one a thousandth inside must not — or
    // the zeros above could be a comparison that never fires.
    if (!exceedsBacklog(backlog + backlogTolerance(k) + 0.001, backlog, k)) injectedMissed++
    if (exceedsBacklog(backlog + backlogTolerance(k) - 0.001, backlog, k)) injectedMissed++
  }

  it('raises zero spurious flags, in either direction', () => {
    expect(cases).toBe(4 * K_MAX * 500)
    expect(spuriousOver).toBe(0)
    expect(spuriousUncovered).toBe(0)
  })

  it('still separates a real overshoot from rounding at every magnitude searched', () => {
    expect(injectedMissed).toBe(0)
  })

  it('both extremes land on exactly floor(k/2) hundredths — the bound is tight', () => {
    for (let k = 1; k <= K_MAX; k++) {
      expect(maxOver[k], `over, k=${k}`).toBeCloseTo(Math.floor(k / 2) / 100, 9)
      expect(maxUnder[k], `under, k=${k}`).toBeCloseTo(Math.floor(k / 2) / 100, 9)
    }
  })
})

describe('one rule: no second copy of the allowance anywhere in src', () => {
  // A tripwire, not a proof: it catches the literal, which is how every
  // earlier copy of this allowance was written (the Story Map contract check
  // carried its own until v0.44.1). It cannot see the same number spelled
  // another way.
  const SRC = join(import.meta.dirname, '..', '..')
  const LITERAL = /(?<![\d.])0\.005(?!\d)/
  const files = (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f))
  const hits = files.filter((f) => LITERAL.test(readFileSync(join(SRC, f), 'utf8')))
    .map((f) => relative(SRC, join(SRC, f)))

  it('finds the literal where it belongs (the scan can fail)', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(hits).toContain(join('shared', 'lib', 'backlog-tolerance.ts'))
  })

  it('finds it nowhere else', () => {
    expect(hits.filter((h) => h !== join('shared', 'lib', 'backlog-tolerance.ts'))).toEqual([])
  })
})
