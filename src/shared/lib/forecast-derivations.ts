// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Pure forecast derivations, extracted whole from useSprintData and
// useForecastInputs (D25).
//
// WHY BOTH HOOKS, AND WHY TOGETHER. Two callers need these values from
// outside React: the staleness comparand (isRecordStale) and the AI snapshot
// builder. Neither can call a hook. Extracting only useForecastInputs' half
// would leave both unable to reach resolvedSprintDates, velocityStats,
// scopeChange and completedSprintCount, which is exactly the gap an earlier
// revision of this work left open.
//
// Both hooks are now useMemo wrappers over the functions below, so there is
// one implementation of each derivation rather than a React copy and a
// non-React copy that can drift.

import type {
  ForecastMode,
  Project,
  Sprint,
  VelocityStats,
  ForecastInputs,
} from '@/shared/types'

import { calculateVelocityStats, calculateScopeChangeStats } from './statistics'
import type { ScopeChangeStats } from './statistics'
import { today, resolveAnchorDate, resolveAllSprintDates } from './dates'
import {
  DEFAULT_CV,
  DEFAULT_VOLATILITY_MULTIPLIER,
  MIN_SPRINTS_FOR_HISTORY,
  MIN_SPRINTS_FOR_BOOTSTRAP,
} from './forecast-constants'

// ============================================================================
// Sprint-derived values (from useSprintData)
// ============================================================================

export interface DerivedSprintData {
  projectSprints: Sprint[]
  includedSprints: Sprint[]
  includedSprintCount: number
  calculatedStats: VelocityStats
  scopeChangeStats: ScopeChangeStats | null
  completedSprintCount: number
  forecastStartDate: string
  resolvedSprintDates: Map<number, { startDate: string; finishDate: string }> | undefined
  canUseBootstrap: boolean
  historicalVelocities: number[]
}

/**
 * Derive every sprint-dependent forecast value for one project.
 *
 * `forecastStartDate` falls back to today() when cadence or first-sprint date
 * is missing. That fallback makes a comparand built in this configuration
 * drift across midnight — not reachable with a published record, since
 * canRunForecast gates the run on both fields, but reachable on the `absent`
 * path where nothing compares it.
 */
export function deriveSprintData(
  project: Project | undefined,
  allSprints: Sprint[]
): DerivedSprintData {
  const projectSprints = project
    ? allSprints.filter((s) => s.projectId === project.id)
    : []
  const includedSprints = projectSprints.filter((s) => s.includedInForecast)
  const calculatedStats = calculateVelocityStats(includedSprints)
  const scopeChangeStats = calculateScopeChangeStats(projectSprints)

  const completedSprintCount =
    projectSprints.length === 0
      ? 0
      : Math.max(...projectSprints.map((s) => s.sprintNumber))

  const sprintDateInputs = projectSprints.map((s) => ({
    sprintNumber: s.sprintNumber,
    customFinishDate: s.customFinishDate,
  }))

  const hasSchedule = !!project?.firstSprintStartDate && !!project?.sprintCadenceWeeks

  // No `projectSprints.length === 0 → today()` short-circuit: for a project
  // with no logged sprints the forecast must anchor on the FIRST sprint's
  // start (sprint 1 = firstSprintStartDate), not the current date.
  // resolveAnchorDate already returns firstSprintStartDate for an empty
  // history, so an unstarted project forecasts from its real schedule (e.g. a
  // future first-sprint date) rather than today(). Do not reinstate the
  // short-circuit. (v0.35.4)
  const forecastStartDate = hasSchedule
    ? resolveAnchorDate(
        project!.firstSprintStartDate!,
        project!.sprintCadenceWeeks!,
        sprintDateInputs
      )
    : today()

  const resolvedSprintDates =
    hasSchedule && projectSprints.length > 0
      ? resolveAllSprintDates(
          project!.firstSprintStartDate!,
          project!.sprintCadenceWeeks!,
          sprintDateInputs
        )
      : undefined

  return {
    projectSprints,
    includedSprints,
    includedSprintCount: includedSprints.length,
    calculatedStats,
    scopeChangeStats,
    completedSprintCount,
    forecastStartDate,
    resolvedSprintDates,
    canUseBootstrap: includedSprints.length >= MIN_SPRINTS_FOR_BOOTSTRAP,
    historicalVelocities: includedSprints.map((s) => s.doneValue),
  }
}

// ============================================================================
// Input-derived values (from useForecastInputs)
// ============================================================================

/**
 * Find the most recent defined backlog-at-end value from the given sprint list.
 * Walks back from the highest sprintNumber so sprints without a recorded
 * backlog are skipped. Returns undefined when no sprint in the list has one.
 *
 * The caller pre-filters to the relevant scope (e.g. the included-in-forecast
 * subset), since this function picks from whatever it is given.
 */
export function getLastSprintBacklog(sprints: Sprint[]): number | undefined {
  if (sprints.length === 0) return undefined
  const descending = [...sprints].sort((a, b) => b.sprintNumber - a.sprintNumber)
  for (const s of descending) {
    if (s.backlogAtSprintEnd !== undefined) return s.backlogAtSprintEnd
  }
  return undefined
}

/**
 * Cumulative "remaining work to reach milestone i" — the running sum of
 * user-maintained backlogSize values. milestone.backlogSize is the work the
 * user knows remains for that release; the user updates it as work progresses,
 * as scope is added, or as scope is descoped. The simulation reads
 * cumulativeThresholds[i] as "delivered-in-trial >= threshold". Shipped
 * milestones (backlogSize = 0) contribute no increment, so their cumulative
 * equals the preceding milestone's.
 */
export function computeCumulativeThresholds(
  milestones: Array<{ backlogSize: number }>
): number[] {
  return milestones.reduce<number[]>((acc, m) => {
    acc.push((acc[acc.length - 1] ?? 0) + m.backlogSize)
    return acc
  }, [])
}

/**
 * Resolve the effective scope growth per sprint from UI state.
 *
 * Returns `number | undefined`. RunConfig wants `number | null`, and the
 * normalization to null happens ONLY in buildForecastInputSnapshot — see the
 * note there. Do not normalize at any other call site.
 */
export function resolveScopeGrowthPerSprint(
  modelScopeGrowth: boolean,
  scopeGrowthMode: 'calculated' | 'custom',
  customScopeGrowth: string,
  averageScopeInjection: number | undefined
): number | undefined {
  if (!modelScopeGrowth) return undefined
  if (scopeGrowthMode === 'custom') {
    const parsed = parseFloat(customScopeGrowth)
    return isNaN(parsed) ? undefined : parsed
  }
  return averageScopeInjection
}

/** Stored value, else auto-detect from the included sprint count. */
export function resolveForecastMode(
  storedMode: ForecastMode | undefined,
  includedSprintCount: number
): ForecastMode {
  if (storedMode) return storedMode
  return includedSprintCount >= MIN_SPRINTS_FOR_HISTORY ? 'history' : 'subjective'
}

export interface DerivedForecastInputs {
  remainingBacklog: string
  derivedBacklogFromIncluded: number | undefined
  lastSprintBacklog: number | undefined
  hasBacklogDrift: boolean
  velocityMean: string
  velocityStdDev: string
  forecastMode: ForecastMode | undefined
  resolvedMode: ForecastMode
  velocityEstimate: string
  selectedCV: number
  volatilityMultiplier: number
  effectiveMean: number
  effectiveStdDev: number
  cumulativeThresholds: number[]
  hasMilestones: boolean
}

/**
 * Derive every input-dependent forecast value for one project.
 *
 * `sprints` must be the included-in-forecast subset, so excluding a sprint
 * correctly updates the derived backlog value.
 */
export function deriveForecastInputs(
  project: Project | undefined,
  stored: ForecastInputs | undefined,
  calculatedStats: VelocityStats,
  includedSprintCount: number,
  sprints: Sprint[]
): DerivedForecastInputs {
  const milestones = project?.milestones ?? []
  const cumulativeThresholds = computeCumulativeThresholds(milestones)

  const derivedBacklogFromIncluded = getLastSprintBacklog(sprints)
  const storedBacklog = stored?.remainingBacklog
  const remainingBacklog =
    storedBacklog ||
    (derivedBacklogFromIncluded !== undefined ? String(derivedBacklogFromIncluded) : '')

  const hasBacklogDrift =
    storedBacklog !== undefined &&
    storedBacklog !== '' &&
    derivedBacklogFromIncluded !== undefined &&
    Number(storedBacklog) !== derivedBacklogFromIncluded

  const velocityMean = stored?.velocityMean ?? ''
  const velocityStdDev = stored?.velocityStdDev ?? ''
  const forecastMode = stored?.forecastMode as ForecastMode | undefined
  const velocityEstimate = stored?.velocityEstimate ?? ''
  const selectedCV = stored?.selectedCV ?? DEFAULT_CV
  const volatilityMultiplier = stored?.volatilityMultiplier ?? DEFAULT_VOLATILITY_MULTIPLIER

  const resolvedMode = resolveForecastMode(forecastMode, includedSprintCount)

  // Effective values depend on forecast mode.
  // Subjective: derived from velocity estimate + CV, pre-seeded from history
  // when no estimate is entered. History: calculated stats, manual overrides,
  // or the volatility multiplier.
  const velocityEstimateNum = Number(velocityEstimate) || 0
  const subjectiveMean =
    velocityEstimateNum > 0 ? velocityEstimateNum : calculatedStats.mean

  const effectiveMean = velocityMean
    ? Number(velocityMean)
    : resolvedMode === 'subjective'
      ? subjectiveMean
      : calculatedStats.mean

  const effectiveStdDev = velocityStdDev
    ? Number(velocityStdDev)
    : resolvedMode === 'subjective'
      ? subjectiveMean * selectedCV
      : calculatedStats.standardDeviation * volatilityMultiplier

  return {
    remainingBacklog,
    derivedBacklogFromIncluded,
    lastSprintBacklog: derivedBacklogFromIncluded,
    hasBacklogDrift,
    velocityMean,
    velocityStdDev,
    forecastMode,
    resolvedMode,
    velocityEstimate,
    selectedCV,
    volatilityMultiplier,
    effectiveMean,
    effectiveStdDev,
    cumulativeThresholds,
    hasMilestones: milestones.length > 0,
  }
}
