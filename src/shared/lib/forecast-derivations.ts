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
import {
  today,
  resolveAnchorDate,
  resolveAllSprintDates,
  isValidIsoDate,
  findInvalidSprintDates,
  findResolvedDateSpill,
  type InvalidSprintDate,
  type ResolvedSprintDates,
  type ResolvedDateSpill,
} from './dates'
import {
  DEFAULT_CV,
  DEFAULT_VOLATILITY_MULTIPLIER,
  MIN_SPRINTS_FOR_HISTORY,
  MIN_SPRINTS_FOR_BOOTSTRAP,
  MIN_SPRINTS_TO_CHOOSE_HISTORY,
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
  resolvedSprintDates: Map<number, ResolvedSprintDates> | undefined
  /** Every stored sprint date the rule refuses, all three fields: what Sprint History marks (D12). */
  invalidStoredDates: InvalidSprintDate[]
  /** A valid first-sprint date and a cadence, so sprint dates can be worked out (D14: a refused first date counts as missing). */
  scheduleUsable: boolean
  /** Resolved dates past MAX_ISO_DATE and every custom date causing them, whatever else blocks; null when none. */
  resolvedDateSpill: ResolvedDateSpill | null
  /** Why the forecast must not run from these dates; null when nothing it uses is bad. */
  forecastDateBlock: ForecastDateBlock | null
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

  // A refused first-sprint date is treated exactly like a missing one (D14).
  const hasSchedule = isValidIsoDate(project?.firstSprintStartDate) && !!project?.sprintCadenceWeeks

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

  const invalidStoredDates = findInvalidSprintDates(projectSprints)
  const resolvedDateSpill = hasSchedule
    ? findResolvedDateSpill(sprintDateInputs, resolvedSprintDates ?? new Map(), forecastStartDate)
    : null

  return {
    projectSprints,
    includedSprints,
    includedSprintCount: includedSprints.length,
    calculatedStats,
    scopeChangeStats,
    completedSprintCount,
    forecastStartDate,
    resolvedSprintDates,
    invalidStoredDates,
    scheduleUsable: hasSchedule,
    resolvedDateSpill,
    forecastDateBlock: findForecastDateBlock(project, invalidStoredDates, resolvedDateSpill, hasSchedule),
    canUseBootstrap: includedSprints.length >= MIN_SPRINTS_FOR_BOOTSTRAP,
    historicalVelocities: includedSprints.map((s) => s.doneValue),
  }
}

/**
 * What stops a forecast from running on these dates (D12, D14), first match wins:
 *   1. the first-sprint date is present but fails the rule;
 *   2. with a usable schedule, a stored custom finish date fails the rule. Without
 *      one no custom date is used, so the missing-schedule reasons speak instead;
 *   3. a resolved sprint date, or the forecast start, fails the rule (year 10000).
 * Stored start and finish fields the forecast never reads do not block it;
 * Sprint History still marks them. Output dates are not checked (D17).
 */
export type ForecastDateBlock =
  | { kind: 'first-date'; value: unknown }
  | { kind: 'custom-finish'; sprints: Array<{ sprintNumber: number; value: unknown }> }
  | { kind: 'past-max'; spill: ResolvedDateSpill; firstSprintStartDate: string }

export function findForecastDateBlock(
  project: Project | undefined,
  invalidStoredDates: InvalidSprintDate[],
  resolvedDateSpill: ResolvedDateSpill | null,
  scheduleUsable: boolean
): ForecastDateBlock | null {
  const first = project?.firstSprintStartDate
  if (first !== undefined && !isValidIsoDate(first)) return { kind: 'first-date', value: first }
  const custom = scheduleUsable ? invalidStoredDates.filter((d) => d.field === 'customFinishDate') : []
  if (custom.length > 0) {
    return { kind: 'custom-finish', sprints: custom.map((d) => ({ sprintNumber: d.sprintNumber, value: d.value })) }
  }
  return resolvedDateSpill ? { kind: 'past-max', spill: resolvedDateSpill, firstSprintStartDate: first ?? '' } : null
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
 * backlogSize values. milestone.backlogSize is the work that remains for that
 * release, kept current by the user — or, for a milestone matched to a Story
 * Map release, by an Update from a Story Map v0.53.8+ export (SD-5). The simulation reads
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

/**
 * History mode can be chosen: 2+ included sprints whose velocities are not all the same. At a
 * standard deviation of 0 every trial draws the same velocity, a certainty the data cannot
 * support. The History button (ForecastModeToggle) is disabled exactly when this is false.
 */
export function historyModeAvailable(includedSprintCount: number, calculatedStdDev: number): boolean {
  return includedSprintCount >= MIN_SPRINTS_TO_CHOOSE_HISTORY && calculatedStdDev > 0
}

/**
 * Stored value, else auto-detect: History from 5 included sprints, provided History is available
 * at all; otherwise Subjective.
 *
 * The ONE place the mode is resolved. useForecastState reads `resolvedMode` from
 * deriveForecastInputs, and the staleness snapshot and the AI snapshot call the same function,
 * so the mode on screen, the mode a run is recorded with, and the mode the AI is told cannot
 * differ. Until v0.50.7 useForecastState kept its own copy of the sprint-count rule, and both
 * copies started five identical velocities in History at standard deviation 0, which the
 * History button refuses.
 *
 * A stored choice is returned as stored, even where History is no longer available: the user
 * picked it, and it applies again once the sprints allow it.
 */
export function resolveForecastMode(
  storedMode: ForecastMode | undefined,
  includedSprintCount: number,
  calculatedStdDev: number
): ForecastMode {
  if (storedMode) return storedMode
  return includedSprintCount >= MIN_SPRINTS_FOR_HISTORY &&
    historyModeAvailable(includedSprintCount, calculatedStdDev)
    ? 'history'
    : 'subjective'
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

  const resolvedMode = resolveForecastMode(
    forecastMode,
    includedSprintCount,
    calculatedStats.standardDeviation
  )

  // Effective values depend on forecast mode, and each mode reads only its own inputs.
  // Subjective: the velocity estimate (pre-seeded from history when none is entered) and the
  // CV. History: the calculated stats, the Velocity and Variability overrides, or the
  // volatility multiplier.
  //
  // The overrides are History inputs. Until v0.50.7 they won in Subjective too, ahead of the
  // estimate, while Reset overrides is offered in History only — so an override typed in
  // History silently replaced every estimate typed in Subjective, with no way to clear it
  // there. They stay stored, and apply again on a switch back to History, as the volatility
  // multiplier always has.
  const velocityEstimateNum = Number(velocityEstimate) || 0
  const subjectiveMean =
    velocityEstimateNum > 0 ? velocityEstimateNum : calculatedStats.mean

  const effectiveMean =
    resolvedMode === 'subjective'
      ? subjectiveMean
      : velocityMean
        ? Number(velocityMean)
        : calculatedStats.mean

  const effectiveStdDev =
    resolvedMode === 'subjective'
      ? subjectiveMean * selectedCV
      : velocityStdDev
        ? Number(velocityStdDev)
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
