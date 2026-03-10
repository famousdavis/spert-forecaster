// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  mean,
  standardDeviation,
  percentileFromSorted,
  normalToLognormalParams,
  normalToGammaParams,
  randomNormal,
  randomTruncatedNormal,
  randomLognormal,
  randomLognormalFromMeanStdDev,
  randomGamma,
  randomGammaFromMeanStdDev,
  randomTriangular,
  randomUniform,
} from './math'

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0)
  })

  it('returns the value for single-element array', () => {
    expect(mean([42])).toBe(42)
  })

  it('calculates correctly for known values', () => {
    expect(mean([2, 4, 6])).toBe(4)
    expect(mean([10, 20, 30, 40])).toBe(25)
  })

  it('handles negative values', () => {
    expect(mean([-10, 10])).toBe(0)
    expect(mean([-3, -1, 2])).toBeCloseTo(-2 / 3)
  })
})

describe('standardDeviation', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(standardDeviation([])).toBe(0)
    expect(standardDeviation([42])).toBe(0)
  })

  it('returns 0 for identical values', () => {
    expect(standardDeviation([5, 5, 5, 5])).toBe(0)
  })

  it('calculates Bessel-corrected sample std dev', () => {
    // Known: stddev of [2,4,4,4,5,5,7,9] with Bessel correction = ~2.138
    const result = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2.138, 2)
  })

  it('handles two values', () => {
    // stddev of [0, 10] with n-1: sqrt((25+25)/1) = sqrt(50) ≈ 7.071
    expect(standardDeviation([0, 10])).toBeCloseTo(7.071, 2)
  })
})

describe('percentileFromSorted', () => {
  it('returns 0 for empty array', () => {
    expect(percentileFromSorted([], 50)).toBe(0)
  })

  it('returns the value for single-element array at any percentile', () => {
    expect(percentileFromSorted([42], 0)).toBe(42)
    expect(percentileFromSorted([42], 50)).toBe(42)
    expect(percentileFromSorted([42], 100)).toBe(42)
  })

  it('returns first element at P0', () => {
    expect(percentileFromSorted([10, 20, 30], 0)).toBe(10)
  })

  it('returns last element at P100', () => {
    expect(percentileFromSorted([10, 20, 30], 100)).toBe(30)
  })

  it('interpolates correctly at P50', () => {
    expect(percentileFromSorted([10, 20], 50)).toBe(15)
    expect(percentileFromSorted([10, 20, 30], 50)).toBe(20)
  })

  it('clamps percentile below 0 to 0 (BUG-4 regression)', () => {
    expect(percentileFromSorted([10, 20, 30], -10)).toBe(10)
  })

  it('clamps percentile above 100 to 100 (BUG-4 regression)', () => {
    expect(percentileFromSorted([10, 20, 30], 150)).toBe(30)
  })

  it('handles large arrays with known percentiles', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    expect(percentileFromSorted(arr, 50)).toBeCloseTo(50.5, 1)
    expect(percentileFromSorted(arr, 90)).toBeCloseTo(90.1, 0)
  })
})

describe('normalToLognormalParams', () => {
  it('converts known values correctly', () => {
    const { muLn, sigmaLn } = normalToLognormalParams(10, 5)
    // σ_ln² = ln(1 + (5/10)²) = ln(1.25)
    const expectedSigmaLnSq = Math.log(1.25)
    expect(sigmaLn).toBeCloseTo(Math.sqrt(expectedSigmaLnSq), 6)
    // μ_ln = ln(10) - σ_ln²/2
    expect(muLn).toBeCloseTo(Math.log(10) - expectedSigmaLnSq / 2, 6)
  })

  it('returns fallback for mean <= 0', () => {
    const result = normalToLognormalParams(0, 5)
    expect(result.muLn).toBeCloseTo(Math.log(0.1))
    expect(result.sigmaLn).toBe(0.1)
  })

  it('handles zero stdDev (deterministic lognormal)', () => {
    const { muLn, sigmaLn } = normalToLognormalParams(10, 0)
    // σ_ln² = ln(1 + 0) = 0, so sigmaLn = 0
    expect(sigmaLn).toBe(0)
    // μ_ln = ln(10) - 0 = ln(10)
    expect(muLn).toBeCloseTo(Math.log(10), 6)
  })
})

describe('normalToGammaParams', () => {
  it('converts known values correctly', () => {
    const { shape, scale } = normalToGammaParams(10, 5)
    // shape = (10/5)² = 4
    expect(shape).toBe(4)
    // scale = 5²/10 = 2.5
    expect(scale).toBe(2.5)
  })

  it('returns fallback for mean <= 0', () => {
    const result = normalToGammaParams(-5, 3)
    expect(result.shape).toBe(1)
    expect(result.scale).toBe(0.1)
  })

  it('returns high-shape fallback for stdDev <= 0', () => {
    const result = normalToGammaParams(10, 0)
    expect(result.shape).toBe(100)
    expect(result.scale).toBeCloseTo(0.1)
  })
})

describe('randomNormal', () => {
  it('generates samples with approximately correct mean', () => {
    const samples = Array.from({ length: 10000 }, () => randomNormal(50, 10))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(50, 0) // Within ~1 of expected mean
  })
})

describe('randomTruncatedNormal', () => {
  it('never generates values below the lower bound', () => {
    const samples = Array.from({ length: 10000 }, () => randomTruncatedNormal(5, 10, 0))
    expect(samples.every((s) => s >= 0)).toBe(true)
  })

  it('approximates the mean for well-separated mean and bound', () => {
    const samples = Array.from({ length: 10000 }, () => randomTruncatedNormal(20, 3, 0))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(20, 0)
  })

  it('returns lower bound + 0.1 as fallback for extreme cases', () => {
    // When mean is far below the lower bound, rejection sampling will fail
    const result = randomTruncatedNormal(-100, 1, 0)
    expect(result).toBeCloseTo(0.1, 1)
  })
})

describe('randomLognormal / randomLognormalFromMeanStdDev', () => {
  it('always generates positive values', () => {
    const samples = Array.from({ length: 10000 }, () => randomLognormal(2, 0.5))
    expect(samples.every((s) => s > 0)).toBe(true)
  })

  it('generates samples with approximately correct mean (from convenience fn)', () => {
    const targetMean = 20
    const samples = Array.from({ length: 10000 }, () => randomLognormalFromMeanStdDev(targetMean, 5))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(targetMean, -1) // Within ~10% of expected
  })
})

describe('randomGamma', () => {
  it('always generates positive values (shape > 1, main path)', () => {
    const samples = Array.from({ length: 10000 }, () => randomGamma(5, 2))
    expect(samples.every((s) => s > 0)).toBe(true)
  })

  it('always generates positive values (shape < 1, recursive path)', () => {
    const samples = Array.from({ length: 1000 }, () => randomGamma(0.5, 2))
    expect(samples.every((s) => s > 0)).toBe(true)
  })

  it('shape = 1 produces exponential distribution (all positive)', () => {
    const samples = Array.from({ length: 10000 }, () => randomGamma(1, 5))
    expect(samples.every((s) => s > 0)).toBe(true)
    // Exponential with scale 5 has mean 5
    const avg = mean(samples)
    expect(avg).toBeCloseTo(5, 0)
  })

  it('generates samples with approximately correct mean', () => {
    // Gamma mean = shape * scale = 4 * 2.5 = 10
    const samples = Array.from({ length: 10000 }, () => randomGamma(4, 2.5))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(10, 0)
  })
})

describe('randomGammaFromMeanStdDev', () => {
  it('generates samples with approximately correct mean', () => {
    const samples = Array.from({ length: 10000 }, () => randomGammaFromMeanStdDev(20, 5))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(20, 0)
  })
})

// --- Edge case tests added in v0.10.0 ---

describe('mean edge cases', () => {
  it('handles all identical values', () => {
    expect(mean([7, 7, 7, 7, 7])).toBe(7)
  })

  it('handles very large arrays', () => {
    const arr = Array.from({ length: 100000 }, () => 1)
    expect(mean(arr)).toBe(1)
  })
})

describe('standardDeviation edge cases', () => {
  it('handles all negative values', () => {
    const result = standardDeviation([-10, -20, -30])
    expect(result).toBeCloseTo(10, 0)
  })

  it('handles two identical values', () => {
    expect(standardDeviation([5, 5])).toBe(0)
  })
})

describe('percentileFromSorted edge cases', () => {
  it('handles two-element array at various percentiles', () => {
    expect(percentileFromSorted([10, 20], 0)).toBe(10)
    expect(percentileFromSorted([10, 20], 25)).toBe(12.5)
    expect(percentileFromSorted([10, 20], 75)).toBe(17.5)
    expect(percentileFromSorted([10, 20], 100)).toBe(20)
  })
})

describe('randomNormal edge cases', () => {
  it('returns exactly the mean when stdDev is 0', () => {
    const samples = Array.from({ length: 100 }, () => randomNormal(42, 0))
    expect(samples.every((s) => s === 42)).toBe(true)
  })
})

describe('randomGamma edge cases', () => {
  it('handles very large shape parameter', () => {
    // shape=100, scale=0.1 → mean=10, very tight distribution
    const samples = Array.from({ length: 1000 }, () => randomGamma(100, 0.1))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(10, 0)
    expect(samples.every((s) => s > 0)).toBe(true)
  })

  it('handles very small shape parameter', () => {
    const samples = Array.from({ length: 1000 }, () => randomGamma(0.1, 1))
    expect(samples.every((s) => s > 0)).toBe(true)
  })
})

describe('normalToLognormalParams edge cases', () => {
  it('handles negative mean with fallback', () => {
    const result = normalToLognormalParams(-5, 3)
    expect(result.muLn).toBeCloseTo(Math.log(0.1))
    expect(result.sigmaLn).toBe(0.1)
  })
})

describe('normalToGammaParams edge cases', () => {
  it('handles negative stdDev with high-shape fallback', () => {
    // normalToGammaParams treats stdDev <= 0 as deterministic (high-shape fallback)
    const result = normalToGammaParams(10, -5)
    expect(result.shape).toBe(100)
    expect(result.scale).toBeCloseTo(0.1)
  })
})

// --- Triangular and Uniform distributions (v0.17.0) ---

describe('randomTriangular', () => {
  it('samples within bounds', () => {
    const samples = Array.from({ length: 5000 }, () => randomTriangular(10, 50, 90))
    expect(samples.every((s) => s >= 10 && s <= 90)).toBe(true)
  })

  it('floors lower bound at 0', () => {
    const samples = Array.from({ length: 5000 }, () => randomTriangular(-20, 50, 90))
    expect(samples.every((s) => s >= 0 && s <= 90)).toBe(true)
  })

  it('returns mode when upper <= lower (degenerate case)', () => {
    expect(randomTriangular(50, 30, 10)).toBe(30)
  })

  it('returns mode when upper <= 0 after flooring', () => {
    // lower=-50 floors to 0, upper=-10 → upper <= lo, returns max(0, mode)
    expect(randomTriangular(-50, -20, -10)).toBe(0)
  })

  it('handles symmetric distribution with approximately correct mean', () => {
    // Triangular(10, 50, 90): mean = (10+50+90)/3 = 50
    const samples = Array.from({ length: 10000 }, () => randomTriangular(10, 50, 90))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(50, 0)
  })

  it('handles mode at lower bound', () => {
    const samples = Array.from({ length: 5000 }, () => randomTriangular(10, 10, 50))
    expect(samples.every((s) => s >= 10 && s <= 50)).toBe(true)
  })

  it('handles mode at upper bound', () => {
    const samples = Array.from({ length: 5000 }, () => randomTriangular(10, 50, 50))
    expect(samples.every((s) => s >= 10 && s <= 50)).toBe(true)
  })
})

describe('randomUniform', () => {
  it('samples within bounds', () => {
    const samples = Array.from({ length: 5000 }, () => randomUniform(10, 90))
    expect(samples.every((s) => s >= 10 && s <= 90)).toBe(true)
  })

  it('floors lower bound at 0', () => {
    const samples = Array.from({ length: 5000 }, () => randomUniform(-20, 50))
    expect(samples.every((s) => s >= 0 && s <= 50)).toBe(true)
  })

  it('returns lower when upper <= lower (degenerate case)', () => {
    expect(randomUniform(50, 10)).toBe(50)
  })

  it('returns 0 when both bounds are negative', () => {
    // lower=-50 floors to 0, upper=-10 → upper <= lo, returns 0
    expect(randomUniform(-50, -10)).toBe(0)
  })

  it('has approximately correct mean', () => {
    // Uniform(10, 90): mean = (10+90)/2 = 50
    const samples = Array.from({ length: 10000 }, () => randomUniform(10, 90))
    const avg = mean(samples)
    expect(avg).toBeCloseTo(50, 0)
  })
})
