// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { calculateSprintStartDate, calculateSprintFinishDate, formatDateCompact } from '@/shared/lib/dates'

export interface CdfDataPoint {
  sprints: number
  dateLabel: string
  // All distribution fields are optional — when a distribution is disabled via Settings
  // ("Statistical methods to show"), its input array arrives as null and the corresponding
  // field is omitted from the point. Recharts skips missing dataKeys naturally.
  tNormal?: number
  lognormal?: number
  gamma?: number
  bootstrap?: number
  triangular?: number
  uniform?: number
}

export interface HistogramBin {
  sprintMin: number
  sprintMax: number
  sprintLabel: string
  dateLabel: string
  // Optional for the same reason as CdfDataPoint above.
  tNormal?: number
  lognormal?: number
  gamma?: number
  bootstrap?: number
  triangular?: number
  uniform?: number
}

/**
 * Build CDF points from sorted simulation data.
 * Returns ~100 points for smooth curves without overwhelming the chart.
 */
export function buildCdfPoints(sortedData: number[]): Map<number, number> {
  const n = sortedData.length
  const cdf = new Map<number, number>()

  // Sample at regular percentile intervals for smooth curve
  for (let p = 1; p <= 100; p++) {
    const index = Math.floor((p / 100) * n) - 1
    const sprints = sortedData[Math.max(0, index)]
    cdf.set(sprints, p)
  }

  return cdf
}

/**
 * Calculate cumulative percentage: what % of trials finished in <= sprints
 * Uses binary search for efficiency on sorted data.
 */
export function calculateCumulativePercentage(sortedData: number[], sprints: number): number {
  // Binary search for the last index where value <= sprints
  let low = 0
  let high = sortedData.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (sortedData[mid] <= sprints) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return (low / sortedData.length) * 100
}

/**
 * Merge CDF data from all distributions into unified chart data.
 *
 * Any of the six distribution inputs may be null/undefined when the user has disabled
 * the distribution via Settings ("Statistical methods to show") — the corresponding field
 * is omitted from each CdfDataPoint and Recharts naturally skips the missing dataKey.
 */
export function mergeDistributions(
  tNormal: number[] | null,
  lognormal: number[] | null,
  gamma: number[] | null,
  bootstrap: number[] | null,
  startDate: string,
  sprintCadenceWeeks: number,
  triangular?: number[],
  uniform?: number[]
): CdfDataPoint[] {
  const tNormalCdf = tNormal ? buildCdfPoints(tNormal) : null
  const lognormalCdf = lognormal ? buildCdfPoints(lognormal) : null
  const gammaCdf = gamma ? buildCdfPoints(gamma) : null
  const bootstrapCdf = bootstrap ? buildCdfPoints(bootstrap) : null
  const triangularCdf = triangular ? buildCdfPoints(triangular) : null
  const uniformCdf = uniform ? buildCdfPoints(uniform) : null

  // Get all unique sprint values
  const allSprints = new Set<number>()
  if (tNormalCdf) tNormalCdf.forEach((_, sprints) => allSprints.add(sprints))
  if (lognormalCdf) lognormalCdf.forEach((_, sprints) => allSprints.add(sprints))
  if (gammaCdf) gammaCdf.forEach((_, sprints) => allSprints.add(sprints))
  if (bootstrapCdf) bootstrapCdf.forEach((_, sprints) => allSprints.add(sprints))
  if (triangularCdf) triangularCdf.forEach((_, sprints) => allSprints.add(sprints))
  if (uniformCdf) uniformCdf.forEach((_, sprints) => allSprints.add(sprints))

  const sortedSprints = Array.from(allSprints).sort((a, b) => a - b)

  return sortedSprints.map((sprints) => {
    const sprintStart = calculateSprintStartDate(startDate, sprints, sprintCadenceWeeks)
    const finishDate = calculateSprintFinishDate(sprintStart, sprintCadenceWeeks)
    const point: CdfDataPoint = {
      sprints,
      dateLabel: formatDateCompact(finishDate),
    }
    if (tNormal) point.tNormal = calculateCumulativePercentage(tNormal, sprints)
    if (lognormal) point.lognormal = calculateCumulativePercentage(lognormal, sprints)
    if (gamma) point.gamma = calculateCumulativePercentage(gamma, sprints)
    if (bootstrap) point.bootstrap = calculateCumulativePercentage(bootstrap, sprints)
    if (triangular) point.triangular = calculateCumulativePercentage(triangular, sprints)
    if (uniform) point.uniform = calculateCumulativePercentage(uniform, sprints)
    return point
  })
}

/**
 * Count how many values fall within the given range [min, max]
 * Uses binary search for efficiency on sorted data.
 */
function countInRange(sortedData: number[], min: number, max: number): number {
  // Find first index where value >= min
  let low = 0
  let high = sortedData.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (sortedData[mid] < min) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  const startIndex = low

  // Find first index where value > max
  low = 0
  high = sortedData.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (sortedData[mid] <= max) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  const endIndex = low

  return endIndex - startIndex
}

/**
 * Build histogram bins from sorted simulation data.
 * Bins are calculated as equal-width intervals across the range of sprints.
 */
export function buildHistogramBins(
  tNormal: number[] | null,
  lognormal: number[] | null,
  gamma: number[] | null,
  bootstrap: number[] | null,
  startDate: string,
  sprintCadenceWeeks: number,
  binCount: number = 15,
  triangular?: number[],
  uniform?: number[]
): HistogramBin[] {
  // Find global min and max across all enabled distributions. When a distribution is null
  // (user disabled in Settings), it's excluded from the range calculation.
  const allData: number[][] = []
  if (tNormal) allData.push(tNormal)
  if (lognormal) allData.push(lognormal)
  if (gamma) allData.push(gamma)
  if (bootstrap) allData.push(bootstrap)
  if (triangular) allData.push(triangular)
  if (uniform) allData.push(uniform)

  // No enabled distributions — return empty bins. Caller (HistogramChart) should
  // also gate rendering on this case, but defensive empty return prevents NaN propagation.
  if (allData.length === 0) return []

  const globalMin = Math.min(...allData.map((d) => d[0]))
  const globalMax = Math.max(...allData.map((d) => d[d.length - 1]))

  // Calculate bin width (minimum 1 sprint per bin)
  const range = globalMax - globalMin
  const rawBinWidth = Math.ceil(range / binCount)
  const binWidth = Math.max(1, rawBinWidth)

  // Adjust bin count based on actual width (minimum 1 bin for zero-range case)
  const actualBinCount = range === 0 ? 1 : Math.ceil(range / binWidth)

  const bins: HistogramBin[] = []
  // Trial count derived from the first available distribution (all distributions are
  // simulated with the same trial count, so this is safe regardless of which is enabled).
  const trialCount = allData[0].length

  for (let i = 0; i < actualBinCount; i++) {
    const sprintMin = globalMin + i * binWidth
    const sprintMax = sprintMin + binWidth - 1

    // Calculate date label for bin midpoint
    const midSprint = Math.round((sprintMin + sprintMax) / 2)
    const sprintStart = calculateSprintStartDate(startDate, midSprint, sprintCadenceWeeks)
    const finishDate = calculateSprintFinishDate(sprintStart, sprintCadenceWeeks)

    const bin: HistogramBin = {
      sprintMin,
      sprintMax,
      sprintLabel: sprintMin === sprintMax ? `${sprintMin}` : `${sprintMin}-${sprintMax}`,
      dateLabel: formatDateCompact(finishDate),
    }

    if (tNormal) bin.tNormal = (countInRange(tNormal, sprintMin, sprintMax) / trialCount) * 100
    if (lognormal) bin.lognormal = (countInRange(lognormal, sprintMin, sprintMax) / trialCount) * 100
    if (gamma) bin.gamma = (countInRange(gamma, sprintMin, sprintMax) / trialCount) * 100
    if (bootstrap) bin.bootstrap = (countInRange(bootstrap, sprintMin, sprintMax) / trialCount) * 100
    if (triangular) bin.triangular = (countInRange(triangular, sprintMin, sprintMax) / trialCount) * 100
    if (uniform) bin.uniform = (countInRange(uniform, sprintMin, sprintMax) / trialCount) * 100

    bins.push(bin)
  }

  return bins
}
