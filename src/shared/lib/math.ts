// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// General math utilities

/**
 * Calculate the arithmetic mean of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Calculate the sample standard deviation of an array of numbers
 * Uses Bessel's correction (n-1) for sample data
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1))
}

/**
 * Generate a random number from a normal distribution
 * using the Box-Muller transform
 */
export function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return z0 * stdDev + mean
}

/**
 * Calculate the percentile value from a sorted array
 * @param sortedValues - Array of numbers, must be sorted ascending
 * @param percentile - Percentile to calculate (0-100)
 */
export function percentileFromSorted(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0
  const clamped = Math.max(0, Math.min(100, percentile))
  const index = (clamped / 100) * (sortedValues.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  const weight = index - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

/**
 * Convert normal distribution parameters (mean, stdDev) to lognormal parameters (μ_ln, σ_ln)
 * so that the resulting lognormal distribution has the same mean and standard deviation.
 *
 * Given observed mean (μ) and standard deviation (σ):
 * σ_ln² = ln(1 + (σ/μ)²)
 * μ_ln = ln(μ) - σ_ln²/2
 */
export function normalToLognormalParams(
  mean: number,
  stdDev: number
): { muLn: number; sigmaLn: number } {
  if (mean <= 0) {
    console.warn(`Lognormal parameter warning: mean (${mean}) must be positive, using fallback values`)
    return { muLn: Math.log(0.1), sigmaLn: 0.1 }
  }

  const coefficientOfVariation = stdDev / mean
  const sigmaLnSquared = Math.log(1 + coefficientOfVariation * coefficientOfVariation)
  const sigmaLn = Math.sqrt(sigmaLnSquared)
  const muLn = Math.log(mean) - sigmaLnSquared / 2

  return { muLn, sigmaLn }
}

/**
 * Generate a random number from a lognormal distribution
 * using the Box-Muller transform for the underlying normal.
 *
 * @param muLn - Mean of the underlying normal distribution (not the lognormal mean)
 * @param sigmaLn - Std dev of the underlying normal distribution (not the lognormal stdDev)
 */
export function randomLognormal(muLn: number, sigmaLn: number): number {
  // Generate standard normal using Box-Muller
  const u1 = Math.random()
  const u2 = Math.random()
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

  // Transform to lognormal
  return Math.exp(muLn + sigmaLn * z0)
}

/**
 * Generate a random number from a lognormal distribution
 * given the desired mean and standard deviation of the lognormal distribution.
 *
 * This is a convenience function that converts normal params to lognormal params first.
 */
export function randomLognormalFromMeanStdDev(mean: number, stdDev: number): number {
  const { muLn, sigmaLn } = normalToLognormalParams(mean, stdDev)
  return randomLognormal(muLn, sigmaLn)
}

/**
 * Generate a random number from a truncated normal distribution
 * using rejection sampling. The distribution is truncated at lowerBound (default 0).
 *
 * This ensures we never generate negative values for quantities like velocity.
 *
 * @param mean - Mean of the underlying normal distribution
 * @param stdDev - Standard deviation of the underlying normal distribution
 * @param lowerBound - Lower bound for truncation (default 0)
 */
export function randomTruncatedNormal(
  mean: number,
  stdDev: number,
  lowerBound: number = 0
): number {
  // If mean is far above the lower bound (more than 4 std devs),
  // the probability of rejection is negligible, so use simple rejection sampling
  const maxAttempts = 1000

  for (let i = 0; i < maxAttempts; i++) {
    const sample = randomNormal(mean, stdDev)
    if (sample >= lowerBound) {
      return sample
    }
  }

  // Fallback: if we somehow can't sample (mean very close to or below lower bound),
  // return the lower bound plus a small positive value
  console.warn(`Truncated normal: fallback after ${maxAttempts} rejections (mean=${mean}, stdDev=${stdDev}, bound=${lowerBound})`)
  return lowerBound + 0.1
}

/**
 * Convert normal distribution parameters (mean, stdDev) to gamma parameters (shape, scale)
 * so that the resulting gamma distribution has the same mean and standard deviation.
 *
 * Given observed mean (μ) and standard deviation (σ):
 * shape (k) = (μ/σ)²
 * scale (θ) = σ²/μ
 *
 * Note: Gamma distribution requires positive mean.
 */
export function normalToGammaParams(
  mean: number,
  stdDev: number
): { shape: number; scale: number } {
  if (mean <= 0) {
    console.warn(`Gamma parameter warning: mean (${mean}) must be positive, using fallback values`)
    return { shape: 1, scale: 0.1 }
  }

  if (stdDev <= 0) {
    // If no variation, return a shape that produces deterministic-like output
    return { shape: 100, scale: mean / 100 }
  }

  const shape = Math.pow(mean / stdDev, 2)
  const scale = Math.pow(stdDev, 2) / mean

  return { shape, scale }
}

/**
 * Generate a random number from a gamma distribution
 * using the Marsaglia and Tsang method.
 *
 * @param shape - Shape parameter (k or α), must be > 0
 * @param scale - Scale parameter (θ), must be > 0
 */
export function randomGamma(shape: number, scale: number): number {
  // Handle shape < 1 by using the property that if X ~ Gamma(shape+1, 1),
  // then X * U^(1/shape) ~ Gamma(shape, 1) where U ~ Uniform(0,1)
  if (shape < 1) {
    const u = Math.random()
    return randomGamma(shape + 1, scale) * Math.pow(u, 1 / shape)
  }

  // Marsaglia and Tsang's method for shape >= 1
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  const MAX_ITERATIONS = 10000

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let x: number
    let v: number

    do {
      // Generate standard normal
      const u1 = Math.random()
      const u2 = Math.random()
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      v = 1 + c * x
    } while (v <= 0)

    v = v * v * v
    const u = Math.random()

    // Check acceptance
    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale
    }
  }

  // Fallback: return the distribution mean (shape * scale)
  console.warn(`Gamma sampling: max iterations (${MAX_ITERATIONS}) reached for shape=${shape}, scale=${scale}`)
  return shape * scale
}

/**
 * Generate a random number from a gamma distribution
 * given the desired mean and standard deviation.
 *
 * This is a convenience function that converts normal params to gamma params first.
 */
export function randomGammaFromMeanStdDev(mean: number, stdDev: number): number {
  const { shape, scale } = normalToGammaParams(mean, stdDev)
  return randomGamma(shape, scale)
}

/**
 * Generate a random number from a triangular distribution
 * using the inverse CDF method.
 *
 * @param lower - Lower bound (floored at 0 for velocity)
 * @param mode - Mode (most likely value)
 * @param upper - Upper bound
 */
export function randomTriangular(lower: number, mode: number, upper: number): number {
  const lo = Math.max(0, lower)
  if (upper <= lo) return Math.max(0, mode)
  const m = Math.max(lo, Math.min(upper, mode))

  const u = Math.random()
  const fc = (m - lo) / (upper - lo)

  if (u < fc) {
    return lo + Math.sqrt(u * (upper - lo) * (m - lo))
  } else {
    return upper - Math.sqrt((1 - u) * (upper - lo) * (upper - m))
  }
}

/**
 * Generate a random number from a uniform distribution.
 *
 * @param lower - Lower bound (floored at 0 for velocity)
 * @param upper - Upper bound
 */
export function randomUniform(lower: number, upper: number): number {
  const lo = Math.max(0, lower)
  if (upper <= lo) return lo
  return lo + Math.random() * (upper - lo)
}
