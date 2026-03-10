// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { calculateSprintStartDate, calculateSprintFinishDate, formatDateCompact } from '@/shared/lib/dates'

export interface CdfDataPoint {
  sprints: number
  dateLabel: string
  tNormal: number
  lognormal: number
  gamma: number
  bootstrap?: number
  triangular?: number
  uniform?: number
}

export interface HistogramBin {
  sprintMin: number
  sprintMax: number
  sprintLabel: string
  dateLabel: string
  tNormal: number
  lognormal: number
  gamma: number
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
 * Merge CDF data from all distributions into unified chart data
 */
export function mergeDistributions(
  tNormal: number[],
  lognormal: number[],
  gamma: number[],
  bootstrap: number[] | null,
  startDate: string,
  sprintCadenceWeeks: number,
  triangular?: number[],
  uniform?: number[]
): CdfDataPoint[] {
  const tNormalCdf = buildCdfPoints(tNormal)
  const lognormalCdf = buildCdfPoints(lognormal)
  const gammaCdf = buildCdfPoints(gamma)
  const bootstrapCdf = bootstrap ? buildCdfPoints(bootstrap) : null
  const triangularCdf = triangular ? buildCdfPoints(triangular) : null
  const uniformCdf = uniform ? buildCdfPoints(uniform) : null

  // Get all unique sprint values
  const allSprints = new Set<number>()
  tNormalCdf.forEach((_, sprints) => allSprints.add(sprints))
  lognormalCdf.forEach((_, sprints) => allSprints.add(sprints))
  gammaCdf.forEach((_, sprints) => allSprints.add(sprints))
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
      tNormal: calculateCumulativePercentage(tNormal, sprints),
      lognormal: calculateCumulativePercentage(lognormal, sprints),
      gamma: calculateCumulativePercentage(gamma, sprints),
    }
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
  tNormal: number[],
  lognormal: number[],
  gamma: number[],
  bootstrap: number[] | null,
  startDate: string,
  sprintCadenceWeeks: number,
  binCount: number = 15,
  triangular?: number[],
  uniform?: number[]
): HistogramBin[] {
  // Find global min and max across all distributions
  const allData = [tNormal, lognormal, gamma, ...(bootstrap ? [bootstrap] : []), ...(triangular ? [triangular] : []), ...(uniform ? [uniform] : [])]
  const globalMin = Math.min(...allData.map(d => d[0]))
  const globalMax = Math.max(...allData.map(d => d[d.length - 1]))

  // Calculate bin width (minimum 1 sprint per bin)
  const range = globalMax - globalMin
  const rawBinWidth = Math.ceil(range / binCount)
  const binWidth = Math.max(1, rawBinWidth)

  // Adjust bin count based on actual width (minimum 1 bin for zero-range case)
  const actualBinCount = range === 0 ? 1 : Math.ceil(range / binWidth)

  const bins: HistogramBin[] = []
  const trialCount = tNormal.length

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
      tNormal: (countInRange(tNormal, sprintMin, sprintMax) / trialCount) * 100,
      lognormal: (countInRange(lognormal, sprintMin, sprintMax) / trialCount) * 100,
      gamma: (countInRange(gamma, sprintMin, sprintMax) / trialCount) * 100,
    }

    if (bootstrap) bin.bootstrap = (countInRange(bootstrap, sprintMin, sprintMax) / trialCount) * 100
    if (triangular) bin.triangular = (countInRange(triangular, sprintMin, sprintMax) / trialCount) * 100
    if (uniform) bin.uniform = (countInRange(uniform, sprintMin, sprintMax) / trialCount) * 100

    bins.push(bin)
  }

  return bins
}
