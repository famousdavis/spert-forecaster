// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// W4: preCalculateSprintFactors ranks the adjustments once and stops each day's
// scan at the first covering one. The factors must be EXACTLY those of the
// per-day minimum it replaced (calculateSprintProductivityFactor, unchanged in
// dates.ts), for every input, malformed ones included: the reference below is
// the previous loop, verbatim but for the import.

import { describe, it, expect } from 'vitest'
import { preCalculateSprintFactors } from './productivity'
import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
  calculateSprintProductivityFactor,
} from '@/shared/lib/dates'
import type { ProductivityAdjustment } from '@/shared/types'

/** preCalculateSprintFactors as it was before W4. */
function reference(first: string, cadence: number, startNumber: number, adjustments: ProductivityAdjustment[], max: number): number[] {
  const factors: number[] = []
  if (!adjustments || adjustments.length === 0) return new Array(max).fill(1.0)
  const firstForecastStart = calculateSprintStartDate(first, startNumber, cadence)
  const relevant = adjustments.filter((adj) => adj.endDate >= firstForecastStart)
  if (relevant.length === 0) return new Array(max).fill(1.0)
  const lastEnd = relevant.reduce((latest, adj) => (adj.endDate > latest ? adj.endDate : latest), relevant[0].endDate)
  for (let i = 0; i < max; i++) {
    const sprintStart = calculateSprintStartDate(first, startNumber + i, cadence)
    if (sprintStart > lastEnd) {
      while (factors.length < max) factors.push(1.0)
      break
    }
    const sprintEnd = calculateSprintFinishDate(sprintStart, cadence)
    factors.push(calculateSprintProductivityFactor(sprintStart, sprintEnd, relevant))
  }
  return factors
}

/** mulberry32: a seeded generator, so a failure names a case that can be re-run. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (r: () => number) => {
  const d = new Date(Date.UTC(2025 + Math.floor(r() * 3), 0, 1) + Math.floor(r() * 400) * 86400000)
  return d.toISOString().slice(0, 10)
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

// Malformed values a document can carry, in every field the factors read.
const ODD_DATES = ['9999-12-31', '', 'zzz', '2026-1-5', '2026-01-19999999', 20260105, null, undefined, ['2026-02-02']] as const
const ODD_FACTORS = [0, -0, 1, 0.25, NaN, Infinity, -1, '0.3', null, undefined, [0.4], {}] as const

function adjustmentsFor(r: () => number, n: number, malformed: boolean): ProductivityAdjustment[] {
  return Array.from({ length: n }, (_, i) => {
    let startDate: unknown = iso(r)
    let endDate: unknown = iso(r)
    if ((startDate as string) > (endDate as string) && r() < 0.8) [startDate, endDate] = [endDate, startDate]
    let factor: unknown = Math.round(r() * 20) / 20
    if (malformed && r() < 0.15) startDate = pick(r, ODD_DATES)
    if (malformed && r() < 0.15) endDate = pick(r, ODD_DATES)
    if (malformed && r() < 0.2) factor = pick(r, ODD_FACTORS)
    return { id: `a${i}`, name: `a${i}`, startDate, endDate, factor, enabled: true, createdAt: '', updatedAt: '' } as unknown as ProductivityAdjustment
  })
}

describe('preCalculateSprintFactors equals the per-day minimum it replaced', () => {
  it('4,000 seeded cases, a fifth of them malformed, agree factor for factor (Object.is, so NaN and -0 count)', () => {
    const r = rng(20261029)
    let compared = 0
    let rankedFirstHitDiffers = 0
    for (let c = 0; c < 4000; c++) {
      const malformed = c % 5 === 0
      const first = iso(r)
      const cadence = pick(r, [1, 2, 3, 4, 2.5, 52] as const)
      const startNumber = 1 + Math.floor(r() * 30)
      const adjustments = adjustmentsFor(r, Math.floor(r() * 12), malformed)
      const max = 40
      const expected = reference(first, cadence, startNumber, adjustments, max)
      const actual = preCalculateSprintFactors(first, cadence, startNumber, adjustments, max).factors
      expect(actual.length, `case ${c}`).toBe(expected.length)
      for (let i = 0; i < expected.length; i++) {
        if (!Object.is(actual[i], expected[i])) throw new Error(`case ${c}, sprint ${i}: ${actual[i]} !== ${expected[i]}`)
        compared++
        if (expected[i] !== 1) rankedFirstHitDiffers++
      }
    }
    // A comparison that only ever saw 1.0 would prove nothing.
    expect(compared).toBe(4000 * 40)
    expect(rankedFirstHitDiffers).toBeGreaterThan(10000)
  }, 30_000)

  it('the cases that need the ranking: overlapping adjustments, NaN among them, and factors given as text', () => {
    const a = (startDate: unknown, endDate: unknown, factor: unknown) =>
      ({ id: 'x', name: 'x', startDate, endDate, factor, enabled: true, createdAt: '', updatedAt: '' }) as unknown as ProductivityAdjustment
    const cases: ProductivityAdjustment[][] = [
      [a('2026-01-05', '2026-03-01', 0.8), a('2026-01-12', '2026-01-20', 0.2)],
      [a('2026-01-05', '2026-03-01', 0.8), a('2026-01-12', '2026-01-20', NaN)],
      [a('2026-01-05', '2026-03-01', '0.1'), a('2026-01-05', '2026-03-01', 0.5)],
      [a('2026-01-05', '2026-03-01', -0), a('2026-01-05', '2026-03-01', 0)],
      [a('2026-01-10', '2026-01-11', 0)],  // a weekend only: overlaps, covers no working day
    ]
    for (const adjustments of cases) {
      const expected = reference('2026-01-05', 2, 1, adjustments, 10)
      const actual = preCalculateSprintFactors('2026-01-05', 2, 1, adjustments, 10).factors
      expect(actual.map(String)).toEqual(expected.map(String))
      actual.forEach((f, i) => expect(Object.is(f, expected[i])).toBe(true))
    }
  })
})

describe('the work stays bounded by the sprints, not by the adjustments (W4)', () => {
  it('5,000 adjustments that never end, at a 52-week cadence, finish quickly (known-bad: past 15 s on the main thread)', () => {
    const adjustments = Array.from({ length: 5000 }, (_, i) => ({
      id: `a${i}`, name: `a${i}`, startDate: '2026-01-01', endDate: '9999-12-31', factor: 0.5 + (i % 5) / 10,
      enabled: true, createdAt: '', updatedAt: '',
    }))
    const t0 = performance.now()
    const { factors } = preCalculateSprintFactors('2026-01-05', 52, 1, adjustments)
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(factors).toHaveLength(1000)
    expect(factors.every((f) => f === 0.5)).toBe(true)
  })
})
