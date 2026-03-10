// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { linearRegression } from './trend'

describe('linearRegression', () => {
  it('returns stable with slope 0 for empty array', () => {
    const result = linearRegression([])
    expect(result.slope).toBe(0)
    expect(result.intercept).toBe(0)
    expect(result.rSquared).toBe(0)
    expect(result.trendDirection).toBe('stable')
  })

  it('returns stable with intercept at the single point for single point', () => {
    const result = linearRegression([{ x: 3, y: 10 }])
    expect(result.slope).toBe(0)
    expect(result.intercept).toBe(10)
    expect(result.rSquared).toBe(0)
    expect(result.trendDirection).toBe('stable')
  })

  it('fits a perfect positive line', () => {
    // y = 2x + 1
    const points = [
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
      { x: 4, y: 9 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(2, 5)
    expect(result.intercept).toBeCloseTo(1, 5)
    expect(result.rSquared).toBeCloseTo(1.0, 5)
    expect(result.trendDirection).toBe('improving')
  })

  it('fits a perfect negative line', () => {
    // y = -3x + 20
    const points = [
      { x: 1, y: 17 },
      { x: 2, y: 14 },
      { x: 3, y: 11 },
      { x: 4, y: 8 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(-3, 5)
    expect(result.intercept).toBeCloseTo(20, 5)
    expect(result.rSquared).toBeCloseTo(1.0, 5)
    expect(result.trendDirection).toBe('declining')
  })

  it('returns stable for a perfectly flat line', () => {
    const points = [
      { x: 1, y: 10 },
      { x: 2, y: 10 },
      { x: 3, y: 10 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(0, 5)
    expect(result.intercept).toBeCloseTo(10, 5)
    // R² is 0 when all y values are the same (ssTot = 0)
    expect(result.rSquared).toBe(0)
    expect(result.trendDirection).toBe('stable')
  })

  it('classifies noisy data with no clear trend as stable', () => {
    // Alternating values — weak correlation
    const points = [
      { x: 1, y: 20 },
      { x: 2, y: 5 },
      { x: 3, y: 22 },
      { x: 4, y: 3 },
      { x: 5, y: 21 },
      { x: 6, y: 4 },
    ]
    const result = linearRegression(points)
    expect(result.rSquared).toBeLessThan(0.1)
    expect(result.trendDirection).toBe('stable')
  })

  it('handles two points correctly', () => {
    const result = linearRegression([
      { x: 1, y: 5 },
      { x: 3, y: 15 },
    ])
    expect(result.slope).toBeCloseTo(5, 5)
    expect(result.intercept).toBeCloseTo(0, 5)
    expect(result.rSquared).toBeCloseTo(1.0, 5)
    expect(result.trendDirection).toBe('improving')
  })

  it('handles identical x values gracefully', () => {
    const result = linearRegression([
      { x: 5, y: 10 },
      { x: 5, y: 20 },
      { x: 5, y: 30 },
    ])
    expect(result.slope).toBe(0)
    expect(result.trendDirection).toBe('stable')
  })

  it('classifies a slight upward trend with good fit as improving', () => {
    // Small positive slope but consistent
    const points = [
      { x: 1, y: 10 },
      { x: 2, y: 10.5 },
      { x: 3, y: 11 },
      { x: 4, y: 11.5 },
      { x: 5, y: 12 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(0.5, 2)
    expect(result.rSquared).toBeGreaterThan(0.9)
    expect(result.trendDirection).toBe('improving')
  })
})
