// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { buildCdfPoints, calculateCumulativePercentage, buildHistogramBins, mergeDistributions } from './cdf'

describe('buildCdfPoints', () => {
  it('returns percentile values for sorted data', () => {
    // 100 values from 1 to 100
    const sortedData = Array.from({ length: 100 }, (_, i) => i + 1)
    const cdf = buildCdfPoints(sortedData)

    // P50 should be around 50
    expect(cdf.get(50)).toBe(50)
    // P100 should be 100
    expect(cdf.get(100)).toBe(100)
  })

  it('handles single value', () => {
    const sortedData = [5]
    const cdf = buildCdfPoints(sortedData)

    // All percentiles map to 5
    expect(cdf.get(5)).toBeDefined()
  })
})

describe('calculateCumulativePercentage', () => {
  it('returns correct percentage for values within range', () => {
    const sortedData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    expect(calculateCumulativePercentage(sortedData, 5)).toBe(50)
    expect(calculateCumulativePercentage(sortedData, 10)).toBe(100)
    expect(calculateCumulativePercentage(sortedData, 1)).toBe(10)
  })

  it('returns 0 for values below range', () => {
    const sortedData = [5, 6, 7, 8, 9, 10]

    expect(calculateCumulativePercentage(sortedData, 4)).toBe(0)
  })

  it('returns 100 for values at or above max', () => {
    const sortedData = [1, 2, 3, 4, 5]

    expect(calculateCumulativePercentage(sortedData, 5)).toBe(100)
    expect(calculateCumulativePercentage(sortedData, 100)).toBe(100)
  })
})

describe('buildHistogramBins', () => {
  it('creates bins with correct counts', () => {
    // Simple case: 10 values, should create bins
    const tNormal = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const lognormal = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const gamma = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

    const bins = buildHistogramBins(tNormal, lognormal, gamma, null, '2025-01-06', 2, 5)

    // Should have bins covering the range
    expect(bins.length).toBeGreaterThan(0)
    expect(bins.length).toBeLessThanOrEqual(5)

    // Each bin should have percentages
    bins.forEach(bin => {
      expect(bin.tNormal).toBeGreaterThanOrEqual(0)
      expect(bin.lognormal).toBeGreaterThanOrEqual(0)
      expect(bin.gamma).toBeGreaterThanOrEqual(0)
      expect(bin.bootstrap).toBeUndefined()
    })
  })

  it('includes bootstrap when provided', () => {
    const tNormal = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    const lognormal = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    const gamma = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    const bootstrap = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]

    const bins = buildHistogramBins(tNormal, lognormal, gamma, bootstrap, '2025-01-06', 2)

    // All data at same value, so one bin with 100% for all
    expect(bins.length).toBe(1)
    expect(bins[0].tNormal).toBe(100)
    expect(bins[0].bootstrap).toBe(100)
  })

  it('calculates correct date labels', () => {
    const data = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]

    const bins = buildHistogramBins(data, data, data, null, '2025-01-06', 2)

    expect(bins[0].dateLabel).toBeDefined()
    expect(bins[0].dateLabel.length).toBeGreaterThan(0)
  })

  it('handles wide range of values', () => {
    // Create distributions with different ranges
    const tNormal = Array.from({ length: 100 }, (_, i) => i + 1)
    const lognormal = Array.from({ length: 100 }, (_, i) => i + 5)
    const gamma = Array.from({ length: 100 }, (_, i) => i + 10)

    const bins = buildHistogramBins(tNormal, lognormal, gamma, null, '2025-01-06', 2, 10)

    // Total percentages should sum to approximately 100 for each distribution.
    // tNormal/lognormal/gamma are optional on HistogramBin (v0.31.0) — present here because
    // non-null inputs are passed, so we assert via the non-null assertion.
    const tNormalTotal = bins.reduce((sum, bin) => sum + bin.tNormal!, 0)
    const lognormalTotal = bins.reduce((sum, bin) => sum + bin.lognormal!, 0)
    const gammaTotal = bins.reduce((sum, bin) => sum + bin.gamma!, 0)

    expect(tNormalTotal).toBeCloseTo(100, 1)
    expect(lognormalTotal).toBeCloseTo(100, 1)
    expect(gammaTotal).toBeCloseTo(100, 1)
  })

  it('creates sprint labels correctly', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    const bins = buildHistogramBins(data, data, data, null, '2025-01-06', 2, 5)

    // Each bin should have a sprint label
    bins.forEach(bin => {
      expect(bin.sprintLabel).toBeDefined()
      // Label should be either a single number or a range
      expect(bin.sprintLabel).toMatch(/^\d+(-\d+)?$/)
    })
  })

  // v0.31.0: distributions can be disabled via Settings ("Statistical methods to show")
  // and arrive as null. Functions must skip rather than throw.
  describe('null-input safety (v0.31.0)', () => {
    const data = Array.from({ length: 50 }, (_, i) => i + 1)

    it('skips null tNormal, lognormal, and gamma in buildHistogramBins', () => {
      const bins = buildHistogramBins(null, data, data, null, '2025-01-06', 2, 5)
      expect(bins.length).toBeGreaterThan(0)
      bins.forEach((bin) => {
        expect(bin.tNormal).toBeUndefined()
        expect(bin.lognormal).toBeDefined()
        expect(bin.gamma).toBeDefined()
      })
    })

    it('returns empty bins when ALL distributions are null/undefined', () => {
      const bins = buildHistogramBins(null, null, null, null, '2025-01-06', 2, 5)
      expect(bins).toEqual([])
    })

    it('does not produce NaN sprintMin/sprintMax when some distributions are null', () => {
      const bins = buildHistogramBins(null, null, data, null, '2025-01-06', 2, 5)
      bins.forEach((bin) => {
        expect(Number.isNaN(bin.sprintMin)).toBe(false)
        expect(Number.isNaN(bin.sprintMax)).toBe(false)
      })
    })

    it('mergeDistributions skips null tNormal and assigns only enabled distributions', () => {
      const points = mergeDistributions(null, data, data, null, '2025-01-06', 2)
      expect(points.length).toBeGreaterThan(0)
      points.forEach((p) => {
        expect(p.tNormal).toBeUndefined()
        expect(p.lognormal).toBeDefined()
        expect(p.gamma).toBeDefined()
        expect(p.bootstrap).toBeUndefined()
      })
    })

    it('mergeDistributions returns empty array when all inputs are null', () => {
      const points = mergeDistributions(null, null, null, null, '2025-01-06', 2)
      expect(points).toEqual([])
    })
  })
})
