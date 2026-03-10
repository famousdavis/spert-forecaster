// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  randomTruncatedNormal,
  randomLognormalFromMeanStdDev,
  randomGammaFromMeanStdDev,
  randomTriangular,
  randomUniform,
  percentileFromSorted,
} from '@/shared/lib/math'
import { calculateSprintStartDate, calculateSprintFinishDate } from '@/shared/lib/dates'
import type { ForecastConfig, ForecastResult } from '@/shared/types'
import type { DistributionType } from '../types'
import { MAX_TRIAL_SPRINTS } from '../constants'

export interface SimulationInput {
  remainingBacklog: number
  velocityMean: number
  velocityStdDev: number
  startDate: string
  sprintCadenceWeeks: number
  trialCount: number
  distributionType?: DistributionType
}

export interface SimulationOutput {
  sprintsRequired: number[] // Sorted array of sprint counts from each trial
  distributionType: DistributionType
}

export interface PercentileResults {
  p50: ForecastResult
  p60: ForecastResult
  p70: ForecastResult
  p80: ForecastResult
  p90: ForecastResult
}

/**
 * Velocity sampler function type.
 * Each distribution provides a sampler that returns a raw velocity sample.
 */
export type VelocitySampler = () => number

// ============================================================================
// Sampler factories
// ============================================================================

/**
 * Bounds for triangular/uniform distributions.
 * Triangular uses ±3 SD; Uniform uses ±2 SD.
 */
export interface DistributionBounds {
  lower: number
  mode: number
  upper: number
}

/**
 * Compute symmetric bounds capped so the lower bound never goes negative.
 * When multiplier*sd > mean, the half-width is capped at mean → bounds = [0, 2*mean].
 */
function computeBounds(mean: number, stdDev: number, sdMultiplier: number): DistributionBounds {
  const hw = Math.min(sdMultiplier * stdDev, mean)
  return { lower: mean - hw, mode: mean, upper: mean + hw }
}

/**
 * Triangular bounds: ±3 SD.
 * The distribution's linear taper already suppresses values near the edges,
 * so wider bounds avoid double-penalising the tails.
 */
function triangularBounds(mean: number, stdDev: number): DistributionBounds {
  return computeBounds(mean, stdDev, 3)
}

/**
 * Uniform bounds: ±2 SD.
 * Uniform gives equal weight across the range, so tighter bounds
 * prevent overweighting extreme values.
 */
function uniformBounds(mean: number, stdDev: number): DistributionBounds {
  return computeBounds(mean, stdDev, 2)
}

/**
 * Create a velocity sampler for a parametric distribution type.
 * Triangular defaults to ±3 SD bounds; Uniform defaults to ±2 SD bounds.
 */
export function createSampler(
  distributionType: DistributionType,
  mean: number,
  stdDev: number,
  bounds?: DistributionBounds
): VelocitySampler {
  switch (distributionType) {
    case 'lognormal':
      return () => randomLognormalFromMeanStdDev(mean, stdDev)
    case 'gamma':
      return () => randomGammaFromMeanStdDev(mean, stdDev)
    case 'triangular': {
      const b = bounds ?? triangularBounds(mean, stdDev)
      return () => randomTriangular(b.lower, b.mode, b.upper)
    }
    case 'uniform': {
      const b = bounds ?? uniformBounds(mean, stdDev)
      return () => randomUniform(b.lower, b.upper)
    }
    case 'truncatedNormal':
    default:
      return () => randomTruncatedNormal(mean, stdDev, 0)
  }
}

/**
 * Create a velocity sampler that randomly selects from historical velocities.
 */
export function createBootstrapSampler(velocities: number[]): VelocitySampler {
  if (velocities.length === 0) throw new Error('Bootstrap requires historical velocity data')
  return () => velocities[Math.floor(Math.random() * velocities.length)]
}

// ============================================================================
// Core trial runners
// ============================================================================

/**
 * Core trial runner: simulates sprints until backlog is exhausted.
 *
 * @param remainingBacklog - Work remaining
 * @param sampler - Function that returns a velocity sample from the chosen distribution
 * @param productivityFactors - Optional per-sprint multipliers (index 0 = first sprint)
 * @param scopeGrowthPerSprint - Optional scope growth per sprint (positive = growing, negative = shrinking)
 */
export function runTrial(
  remainingBacklog: number,
  sampler: VelocitySampler,
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): number {
  let remaining = remainingBacklog
  let sprints = 0

  while (remaining > 0 && sprints < MAX_TRIAL_SPRINTS) {
    if (scopeGrowthPerSprint !== undefined) remaining += scopeGrowthPerSprint
    const baseVelocity = Math.max(0.1, sampler())
    const factor = productivityFactors?.[sprints] ?? 1.0
    remaining -= baseVelocity * factor
    sprints++
  }

  return sprints
}

/**
 * Core trial runner with milestone checkpoints: records the sprint number
 * at which each cumulative backlog threshold is reached.
 *
 * @param remainingBacklog - Total work remaining (sum of all milestones)
 * @param cumulativeThresholds - Ascending cumulative backlog values for each milestone
 * @param sampler - Function that returns a velocity sample from the chosen distribution
 * @param productivityFactors - Optional per-sprint multipliers (index 0 = first sprint)
 * @param scopeGrowthPerSprint - Optional scope growth per sprint (positive = growing, negative = shrinking)
 * @returns Array of sprint counts, one per milestone
 */
function runTrialWithMilestones(
  remainingBacklog: number,
  cumulativeThresholds: number[],
  sampler: VelocitySampler,
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): number[] {
  let remaining = remainingBacklog
  let sprints = 0
  let nextIdx = 0
  const results = new Array<number>(cumulativeThresholds.length).fill(MAX_TRIAL_SPRINTS)

  while (remaining > 0 && sprints < MAX_TRIAL_SPRINTS) {
    if (scopeGrowthPerSprint !== undefined) remaining += scopeGrowthPerSprint
    const baseVelocity = Math.max(0.1, sampler())
    const factor = productivityFactors?.[sprints] ?? 1.0
    const work = baseVelocity * factor
    remaining -= work
    sprints++

    // Check milestones (ascending order, pointer advances monotonically).
    // Use remaining-based check so scope growth correctly delays milestones.
    // Without scope growth: remaining = B - completed, so
    // remaining <= B - T  ⟺  completed >= T (equivalent to old check).
    while (nextIdx < cumulativeThresholds.length &&
           remaining <= remainingBacklog - cumulativeThresholds[nextIdx]) {
      results[nextIdx] = sprints
      nextIdx++
    }
  }

  // Mark any remaining milestones as reached at the final sprint
  while (nextIdx < cumulativeThresholds.length) {
    results[nextIdx] = sprints
    nextIdx++
  }

  return results
}

// ============================================================================
// Simulation functions
// ============================================================================

/**
 * Run N trials with a given sampler and return sorted sprint counts.
 * Common kernel used by all simulation entry points.
 */
function runTrials(
  remainingBacklog: number,
  sampler: VelocitySampler,
  trialCount: number,
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): number[] {
  const factors = productivityFactors && productivityFactors.length > 0 ? productivityFactors : undefined
  const sprintsRequired: number[] = []
  for (let i = 0; i < trialCount; i++) {
    sprintsRequired.push(runTrial(remainingBacklog, sampler, factors, scopeGrowthPerSprint))
  }
  sprintsRequired.sort((a, b) => a - b)
  return sprintsRequired
}

/**
 * Run a Monte Carlo simulation, optionally with productivity adjustments and scope growth.
 * Returns the distribution of sprint counts across all trials.
 */
export function runSimulation(
  input: SimulationInput,
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): SimulationOutput {
  const {
    remainingBacklog,
    velocityMean,
    velocityStdDev,
    trialCount,
    distributionType = 'truncatedNormal',
  } = input

  const sampler = createSampler(distributionType, velocityMean, velocityStdDev)

  return {
    sprintsRequired: runTrials(remainingBacklog, sampler, trialCount, productivityFactors, scopeGrowthPerSprint),
    distributionType,
  }
}

// ============================================================================
// Percentile calculation
// ============================================================================

/**
 * Calculate the finish date for a given percentile
 */
export function calculatePercentileResult(
  sortedSprintsRequired: number[],
  percentile: number,
  startDate: string,
  sprintCadenceWeeks: number
): ForecastResult {
  const sprintsRequired = Math.ceil(
    percentileFromSorted(sortedSprintsRequired, percentile)
  )
  // Calculate the finish date as the last business day of the final sprint
  // startDate is when sprint 1 starts, so sprint N starts at startDate + (N-1) * cadence
  const finalSprintStart = calculateSprintStartDate(startDate, sprintsRequired, sprintCadenceWeeks)
  const finishDate = calculateSprintFinishDate(finalSprintStart, sprintCadenceWeeks)

  return {
    percentile,
    sprintsRequired,
    finishDate,
  }
}

/**
 * Extract percentile results from a simulation
 */
function extractPercentileResults(
  sortedSprintsRequired: number[],
  startDate: string,
  sprintCadenceWeeks: number
): PercentileResults {
  return {
    p50: calculatePercentileResult(sortedSprintsRequired, 50, startDate, sprintCadenceWeeks),
    p60: calculatePercentileResult(sortedSprintsRequired, 60, startDate, sprintCadenceWeeks),
    p70: calculatePercentileResult(sortedSprintsRequired, 70, startDate, sprintCadenceWeeks),
    p80: calculatePercentileResult(sortedSprintsRequired, 80, startDate, sprintCadenceWeeks),
    p90: calculatePercentileResult(sortedSprintsRequired, 90, startDate, sprintCadenceWeeks),
  }
}

/**
 * Run a full forecast simulation and return results for standard percentiles
 * (backward compatible - uses truncated normal distribution)
 */
export function runForecast(config: ForecastConfig & { sprintCadenceWeeks: number }): PercentileResults {
  const simulation = runSimulation({
    remainingBacklog: config.remainingBacklog,
    velocityMean: config.velocityMean,
    velocityStdDev: config.velocityStdDev,
    startDate: config.startDate,
    sprintCadenceWeeks: config.sprintCadenceWeeks,
    trialCount: config.trialCount,
    distributionType: 'truncatedNormal',
  })

  return extractPercentileResults(simulation.sprintsRequired, config.startDate, config.sprintCadenceWeeks)
}

// ============================================================================
// Simulation context (R4 — replaces positional parameter threading)
// ============================================================================

/**
 * Groups the parameters that flow together through the simulation pipeline.
 * Matches the shape of WorkerInput for seamless worker integration.
 */
export interface SimulationContext {
  config: ForecastConfig & { sprintCadenceWeeks: number }
  historicalVelocities?: number[]
  productivityFactors?: number[]
  scopeGrowthPerSprint?: number
}

// ============================================================================
// Quadruple distribution types and helpers
// ============================================================================

/**
 * Percentile results for all distributions (used by results table, summary, etc.)
 */
export interface QuadResults {
  truncatedNormal: PercentileResults
  lognormal: PercentileResults
  gamma: PercentileResults
  bootstrap: PercentileResults | null
  triangular: PercentileResults
  uniform: PercentileResults
}

/**
 * Simulation data structure (raw sprint counts from each distribution)
 */
export interface QuadSimulationData {
  truncatedNormal: number[]
  lognormal: number[]
  gamma: number[]
  bootstrap: number[] | null
  triangular: number[]
  uniform: number[]
}

/**
 * Custom percentile results for all distributions
 */
export interface QuadCustomResults {
  truncatedNormal: ForecastResult | null
  lognormal: ForecastResult | null
  gamma: ForecastResult | null
  bootstrap: ForecastResult | null
  triangular: ForecastResult | null
  uniform: ForecastResult | null
}

/**
 * Calculate custom percentile for all distributions
 */
export function calculateAllCustomPercentiles(
  data: QuadSimulationData,
  percentile: number,
  startDate: string,
  sprintCadenceWeeks: number
): QuadCustomResults {
  return {
    truncatedNormal: calculatePercentileResult(data.truncatedNormal, percentile, startDate, sprintCadenceWeeks),
    lognormal: calculatePercentileResult(data.lognormal, percentile, startDate, sprintCadenceWeeks),
    gamma: calculatePercentileResult(data.gamma, percentile, startDate, sprintCadenceWeeks),
    bootstrap: data.bootstrap
      ? calculatePercentileResult(data.bootstrap, percentile, startDate, sprintCadenceWeeks)
      : null,
    triangular: calculatePercentileResult(data.triangular, percentile, startDate, sprintCadenceWeeks),
    uniform: calculatePercentileResult(data.uniform, percentile, startDate, sprintCadenceWeeks),
  }
}

// ============================================================================
// Distribution sweep (R3 — single place to add new distributions)
// ============================================================================

/**
 * Run a callback for each distribution + optional bootstrap.
 * All 6 parametric distributions always run; the UI layer filters which to display.
 */
function runAllDistributions<T>(
  ctx: SimulationContext,
  runOne: (sampler: VelocitySampler) => T,
): { truncatedNormal: T; lognormal: T; gamma: T; bootstrap: T | null; triangular: T; uniform: T } {
  const { config, historicalVelocities } = ctx
  const { velocityMean: m, velocityStdDev: sd } = config
  const triBounds = triangularBounds(m, sd)
  const uniBounds = uniformBounds(m, sd)

  const truncatedNormal = runOne(createSampler('truncatedNormal', m, sd))
  const lognormal = runOne(createSampler('lognormal', m, sd))
  const gamma = runOne(createSampler('gamma', m, sd))
  const triangular = runOne(createSampler('triangular', m, sd, triBounds))
  const uniform = runOne(createSampler('uniform', m, sd, uniBounds))

  let bootstrap: T | null = null
  if (historicalVelocities && historicalVelocities.length > 0) {
    bootstrap = runOne(createBootstrapSampler(historicalVelocities))
  }

  return { truncatedNormal, lognormal, gamma, bootstrap, triangular, uniform }
}

/**
 * Run forecasts across all distributions (T-Normal, Lognormal, Gamma, Triangular, Uniform + Bootstrap).
 * Bootstrap is only included if historical velocities are provided.
 */
export function runQuadrupleForecast(
  config: ForecastConfig & { sprintCadenceWeeks: number },
  historicalVelocities?: number[],
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): {
  truncatedNormal: { results: PercentileResults; sprintsRequired: number[] }
  lognormal: { results: PercentileResults; sprintsRequired: number[] }
  gamma: { results: PercentileResults; sprintsRequired: number[] }
  bootstrap: { results: PercentileResults; sprintsRequired: number[] } | null
  triangular: { results: PercentileResults; sprintsRequired: number[] }
  uniform: { results: PercentileResults; sprintsRequired: number[] }
} {
  const ctx: SimulationContext = { config, historicalVelocities, productivityFactors, scopeGrowthPerSprint }
  const factors = productivityFactors && productivityFactors.length > 0 ? productivityFactors : undefined

  return runAllDistributions(ctx, (sampler) => {
    const sprintsRequired = runTrials(
      config.remainingBacklog, sampler, config.trialCount, factors, scopeGrowthPerSprint
    )
    const results = extractPercentileResults(sprintsRequired, config.startDate, config.sprintCadenceWeeks)
    return { results, sprintsRequired }
  })
}

// ============================================================================
// Milestone-aware simulation functions
// ============================================================================

/**
 * Per-milestone simulation results for a single distribution
 */
export interface MilestoneDistributionResult {
  /** Per-milestone results: milestoneResults[milestoneIdx] = { results, sprintsRequired } */
  milestoneResults: Array<{ results: PercentileResults; sprintsRequired: number[] }>
}

/**
 * Full forecast result with milestone data for all distributions
 */
export interface QuadMilestoneForecastResult {
  truncatedNormal: MilestoneDistributionResult
  lognormal: MilestoneDistributionResult
  gamma: MilestoneDistributionResult
  bootstrap: MilestoneDistributionResult | null
  triangular: MilestoneDistributionResult
  uniform: MilestoneDistributionResult
}

/**
 * Milestone-aware simulation data (raw sprint counts per milestone per distribution)
 */
export interface QuadMilestoneSimulationData {
  /** milestoneData[milestoneIdx] = sorted arrays per distribution */
  milestoneData: QuadSimulationData[]
}

/**
 * Run milestone-aware simulation for a single distribution.
 * Each trial records the sprint at which each cumulative milestone threshold is reached.
 */
function runMilestoneSimulationInternal(
  remainingBacklog: number,
  cumulativeThresholds: number[],
  sampler: VelocitySampler,
  trialCount: number,
  startDate: string,
  sprintCadenceWeeks: number,
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): MilestoneDistributionResult {
  const milestoneCount = cumulativeThresholds.length

  // Collect per-milestone sprint counts across all trials
  const milestoneSprintArrays: number[][] = Array.from(
    { length: milestoneCount },
    () => new Array<number>(trialCount)
  )

  for (let i = 0; i < trialCount; i++) {
    const trialResults = runTrialWithMilestones(
      remainingBacklog, cumulativeThresholds, sampler, productivityFactors, scopeGrowthPerSprint
    )
    for (let m = 0; m < milestoneCount; m++) {
      milestoneSprintArrays[m][i] = trialResults[m]
    }
  }

  // Sort each milestone's array and extract percentile results
  const milestoneResults = milestoneSprintArrays.map((sprintArray) => {
    sprintArray.sort((a, b) => a - b)
    const results = extractPercentileResults(sprintArray, startDate, sprintCadenceWeeks)
    return { results, sprintsRequired: sprintArray }
  })

  return { milestoneResults }
}

/**
 * Run quadruple forecasts with milestone checkpoints.
 * Returns per-milestone percentile results and sorted sprint arrays for each distribution.
 */
export function runQuadrupleForecastWithMilestones(
  config: ForecastConfig & { sprintCadenceWeeks: number },
  cumulativeThresholds: number[],
  historicalVelocities?: number[],
  productivityFactors?: number[],
  scopeGrowthPerSprint?: number
): QuadMilestoneForecastResult {
  const { remainingBacklog, startDate, sprintCadenceWeeks, trialCount } = config
  const ctx: SimulationContext = { config, historicalVelocities, productivityFactors, scopeGrowthPerSprint }
  const factors = productivityFactors && productivityFactors.length > 0 ? productivityFactors : undefined

  return runAllDistributions(ctx, (sampler) =>
    runMilestoneSimulationInternal(
      remainingBacklog, cumulativeThresholds, sampler,
      trialCount, startDate, sprintCadenceWeeks, factors, scopeGrowthPerSprint
    )
  )
}
