// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { mean, standardDeviation } from '@/shared/lib/math'
import type { Sprint, VelocityStats } from '@/shared/types'

/**
 * Calculate velocity statistics from a list of sprints
 */
export function calculateVelocityStats(sprints: Sprint[]): VelocityStats {
  const includedSprints = sprints.filter((s) => s.includedInForecast)
  const velocities = includedSprints.map((s) => s.doneValue)

  return {
    count: velocities.length,
    mean: mean(velocities),
    standardDeviation: standardDeviation(velocities),
  }
}

/**
 * Scope change data point for analysis
 */
export interface ScopeChangeDataPoint {
  sprintNumber: number
  scope: number
  change: number
  percentChange: number
}

/**
 * Scope change trend analysis result
 */
export interface ScopeChangeStats {
  dataPoints: ScopeChangeDataPoint[]
  averageChange: number
  averagePercentChange: number
  /** Net new scope added per sprint, accounting for completed work. Use for simulation input. */
  averageScopeInjection: number
  volatility: number
  trend: 'growing' | 'shrinking' | 'stable'
  sprintsWithData: number
  totalChange: number
  latestScope: number
}

/**
 * Calculate scope change statistics from sprint history
 * Uses backlogAtSprintEnd to track scope changes over time
 * Returns null if insufficient data (less than 2 sprints with backlog data)
 */
export function calculateScopeChangeStats(sprints: Sprint[]): ScopeChangeStats | null {
  // Filter sprints that have backlogAtSprintEnd and sort by sprint number
  const sprintsWithBacklog = sprints
    .filter((s) => s.backlogAtSprintEnd !== undefined && s.backlogAtSprintEnd !== null)
    .sort((a, b) => a.sprintNumber - b.sprintNumber)

  // Need at least 2 data points to calculate changes
  if (sprintsWithBacklog.length < 2) {
    return null
  }

  const dataPoints: ScopeChangeDataPoint[] = []
  const changes: number[] = []
  const percentChanges: number[] = []
  const injections: number[] = []

  // First data point has no change (baseline)
  dataPoints.push({
    sprintNumber: sprintsWithBacklog[0].sprintNumber,
    scope: sprintsWithBacklog[0].backlogAtSprintEnd!,
    change: 0,
    percentChange: 0,
  })

  // Calculate changes between consecutive sprints
  for (let i = 1; i < sprintsWithBacklog.length; i++) {
    const prevScope = sprintsWithBacklog[i - 1].backlogAtSprintEnd!
    const currentScope = sprintsWithBacklog[i].backlogAtSprintEnd!
    const change = currentScope - prevScope
    const percentChange = prevScope !== 0 ? (change / prevScope) * 100 : 0

    // Net new scope injected = backlog change + work completed
    // This isolates scope additions from velocity burn-down
    const injection = change + sprintsWithBacklog[i].doneValue

    changes.push(change)
    percentChanges.push(percentChange)
    injections.push(injection)

    dataPoints.push({
      sprintNumber: sprintsWithBacklog[i].sprintNumber,
      scope: currentScope,
      change,
      percentChange,
    })
  }

  const averageChange = mean(changes)
  const averagePercentChange = mean(percentChanges)
  const averageScopeInjection = mean(injections)
  const volatility = standardDeviation(changes)

  // Determine trend based on average change relative to volatility
  let trend: 'growing' | 'shrinking' | 'stable'
  if (Math.abs(averageChange) < volatility * 0.1) {
    trend = 'stable'
  } else if (averageChange > 0) {
    trend = 'growing'
  } else {
    trend = 'shrinking'
  }

  const firstScope = sprintsWithBacklog[0].backlogAtSprintEnd!
  const latestScope = sprintsWithBacklog[sprintsWithBacklog.length - 1].backlogAtSprintEnd!
  const totalChange = latestScope - firstScope

  return {
    dataPoints,
    averageChange,
    averagePercentChange,
    averageScopeInjection,
    volatility,
    trend,
    sprintsWithData: sprintsWithBacklog.length,
    totalChange,
    latestScope,
  }
}
