// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Linear regression for velocity trend analysis
 */

export interface TrendResult {
  slope: number
  intercept: number
  rSquared: number
  trendDirection: 'improving' | 'declining' | 'stable'
}

/**
 * Least-squares linear regression on (x, y) data points.
 * Returns slope, intercept, R-squared, and a trend classification.
 *
 * Trend is 'stable' when R-squared < 0.1 (too noisy to call a direction),
 * otherwise 'improving' (slope > 0) or 'declining' (slope < 0).
 */
export function linearRegression(
  points: ReadonlyArray<{ x: number; y: number }>
): TrendResult {
  const n = points.length
  if (n < 2) {
    return { slope: 0, intercept: n === 1 ? points[0].y : 0, rSquared: 0, trendDirection: 'stable' }
  }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  let sumY2 = 0

  for (const { x, y } of points) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
    sumY2 += y * y
  }

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) {
    // All x values are the same
    return { slope: 0, intercept: sumY / n, rSquared: 0, trendDirection: 'stable' }
  }

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  // R-squared (coefficient of determination)
  const meanY = sumY / n
  let ssTot = 0
  let ssRes = 0
  for (const { x, y } of points) {
    ssTot += (y - meanY) ** 2
    ssRes += (y - (slope * x + intercept)) ** 2
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot

  let trendDirection: TrendResult['trendDirection']
  if (rSquared < 0.1) {
    trendDirection = 'stable'
  } else if (slope > 0) {
    trendDirection = 'improving'
  } else {
    trendDirection = 'declining'
  }

  return { slope, intercept, rSquared, trendDirection }
}
