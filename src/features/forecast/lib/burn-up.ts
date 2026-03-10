// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Sprint } from '@/shared/types'
import type { QuadSimulationData } from './monte-carlo'
import type { BurnUpConfig, DistributionType } from '../types'
import { percentileFromSorted } from '@/shared/lib/math'
import { calculateSprintStartDate, calculateSprintFinishDate, formatDateCompact } from '@/shared/lib/dates'

const MAX_FORECAST_SPRINTS = 200

export interface BurnUpDataPoint {
  sprintNumber: number
  date: string
  dateLabel: string
  backlog: number
  cumulativeDone: number | null
  line1?: number
  line2?: number
  line3?: number
}

export interface BurnUpCalculationInput {
  sprints: Sprint[]
  forecastBacklog: number
  simulationData: QuadSimulationData
  config: BurnUpConfig
  sprintCadenceWeeks: number
  firstSprintStartDate: string
  completedSprintCount: number
}

function getDistributionData(sim: QuadSimulationData, dist: DistributionType): number[] | null {
  return sim[dist]
}

function getSprintFinishDate(firstStart: string, sprintNum: number, cadence: number): string {
  const start = calculateSprintStartDate(firstStart, sprintNum, cadence)
  return calculateSprintFinishDate(start, cadence)
}

function calculateIntersectionSprint(sorted: number[], percentile: number, completed: number): number {
  if (sorted.length === 0) return completed + 1
  const needed = percentileFromSorted(sorted, percentile)
  if (!Number.isFinite(needed) || needed < 0) return completed + 1
  return completed + Math.ceil(needed)
}

function calculateImpliedVelocity(sorted: number[], percentile: number, backlog: number): number {
  const needed = percentileFromSorted(sorted, percentile)
  return needed <= 0 ? backlog : backlog / needed
}

export function calculateBurnUpData(input: BurnUpCalculationInput): BurnUpDataPoint[] {
  const { sprints, forecastBacklog, simulationData, config, sprintCadenceWeeks, firstSprintStartDate, completedSprintCount } = input

  const sortedSprints = [...sprints].sort((a, b) => a.sprintNumber - b.sprintNumber)
  const totalDone = sortedSprints.reduce((sum, s) => sum + s.doneValue, 0)
  const hasBacklogHistory = sortedSprints.some((s) => s.backlogAtSprintEnd !== undefined)
  const syntheticBacklog = forecastBacklog + totalDone

  const distData = getDistributionData(simulationData, config.distribution) ?? simulationData.truncatedNormal

  return buildChartData({
    sortedSprints,
    forecastBacklog,
    distData,
    config,
    sprintCadenceWeeks,
    firstSprintStartDate,
    completedSprintCount,
    totalDone,
    hasBacklogHistory,
    syntheticBacklog,
  })
}

interface BuildChartDataInput {
  sortedSprints: Sprint[]
  forecastBacklog: number
  distData: number[]
  config: BurnUpConfig
  sprintCadenceWeeks: number
  firstSprintStartDate: string
  completedSprintCount: number
  totalDone: number
  hasBacklogHistory: boolean
  syntheticBacklog: number
}

function buildChartData(input: BuildChartDataInput): BurnUpDataPoint[] {
  const { sortedSprints, forecastBacklog, distData, config, sprintCadenceWeeks, firstSprintStartDate, completedSprintCount, totalDone, hasBacklogHistory, syntheticBacklog } = input

  const intersections = config.lines.map((l) => calculateIntersectionSprint(distData, l.percentile, completedSprintCount))
  const velocities = config.lines.map((l) => calculateImpliedVelocity(distData, l.percentile, forecastBacklog))
  const maxSprint = intersections.length > 0
    ? Math.min(Math.max(...intersections), completedSprintCount + MAX_FORECAST_SPRINTS)
    : completedSprintCount
  const finalScope = hasBacklogHistory ? totalDone + forecastBacklog : syntheticBacklog

  const points: BurnUpDataPoint[] = []

  // Historical data points
  let cumDone = 0
  for (const sprint of sortedSprints) {
    cumDone += sprint.doneValue
    const finishDate = getSprintFinishDate(firstSprintStartDate, sprint.sprintNumber, sprintCadenceWeeks)
    const rawScope = hasBacklogHistory && sprint.backlogAtSprintEnd !== undefined
      ? cumDone + sprint.backlogAtSprintEnd
      : syntheticBacklog
    // Cap historical scope to finalScope so the line stays flat when forecast targets a milestone
    const scope = Math.min(rawScope, finalScope)

    points.push({
      sprintNumber: sprint.sprintNumber,
      date: finishDate,
      dateLabel: formatDateCompact(finishDate),
      backlog: scope,
      cumulativeDone: cumDone,
    })
  }

  // Forecast projection points
  for (let num = completedSprintCount + 1; num <= maxSprint; num++) {
    const sprintsIn = num - completedSprintCount
    const finishDate = getSprintFinishDate(firstSprintStartDate, num, sprintCadenceWeeks)

    const lines = config.lines.map((_, i) => {
      if (num > intersections[i]) return undefined
      const projected = totalDone + sprintsIn * velocities[i]
      return Math.min(projected, finalScope)
    })

    points.push({
      sprintNumber: num,
      date: finishDate,
      dateLabel: formatDateCompact(finishDate),
      backlog: finalScope,
      cumulativeDone: null,
      line1: lines[0],
      line2: lines[1],
      line3: lines[2],
    })
  }

  // Connect forecast lines to Done line end
  if (sortedSprints.length > 0 && points.length > sortedSprints.length) {
    const lastIdx = sortedSprints.length - 1
    points[lastIdx] = { ...points[lastIdx], line1: totalDone, line2: totalDone, line3: totalDone }
  }

  // Origin point when no sprints
  if (sortedSprints.length === 0 && points.length === 0) {
    points.push({
      sprintNumber: 0,
      date: firstSprintStartDate,
      dateLabel: formatDateCompact(firstSprintStartDate),
      backlog: finalScope,
      cumulativeDone: 0,
      line1: 0,
      line2: 0,
      line3: 0,
    })
  }

  return points
}

/**
 * Check if bootstrap distribution is available for burn-up chart
 */
export function isBootstrapAvailable(simulationData: QuadSimulationData): boolean {
  return simulationData.bootstrap !== null && simulationData.bootstrap.length > 0
}
