// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Run configuration, the staleness comparand, and the one builder that
// produces BOTH of them.
//
// ─────────────────────────────────────────────────────────────────────────
// ONE BUILDER, BOTH SIDES — read this before changing anything here.
// ─────────────────────────────────────────────────────────────────────────
// buildForecastInputSnapshot() produces the `runConfig` written onto a run
// record AND the comparand isRecordStale() compares that record against.
// They MUST come from this one function.
//
// If the publish path and the comparand path ever diverge on a single field,
// isRecordStale() returns true for a record published one millisecond
// earlier. Because autoRecalculate defaults to true, the auto-recalculate
// effect then sees a stale record on every mount and immediately after every
// publish — a continuous worker loop in the shipped default configuration.
//
// The failure is not hypothetical. resolveScopeGrowthPerSprint returns
// `number | undefined`; RunConfig.scopeGrowthPerSprint is `number | null`.
// Under field-by-field comparison `undefined !== null`, so a scope-growth-OFF
// record — the most common configuration there is — would be permanently
// stale. The `?? null` normalization therefore happens HERE and nowhere else.
//
// A test that builds one snapshot, publishes a record from it, and compares
// the record against that same snapshot passes under every implementation
// including the broken one. The real gate publishes through handleRunForecast
// and builds the comparand independently.

import type { ForecastMode, Project, Sprint, ForecastInputs } from '@/shared/types'
import { deriveSprintData, deriveForecastInputs, resolveScopeGrowthPerSprint } from './forecast-derivations'
import { safeParseNumber } from './validation'

/** Everything that can change the numbers. Compared field-by-field for staleness. */
export interface RunConfig {
  remainingBacklog: number
  velocityMean: number
  velocityStdDev: number
  /** The run-captured anchor (D15). */
  startDate: string
  trialCount: number
  sprintCadenceWeeks: number
  forecastMode: ForecastMode
  /** 0 when the project has no sprints. */
  lastSprintNumber: number
  scopeGrowthPerSprint: number | null
  includedSprintCount: number
  /**
   * Digest of (startDate, endDate, factor) for ENABLED adjustments whose
   * endDate >= the startDate above (D18). null iff that set is empty.
   *
   * Deliberately NOT a digest of the resolved per-sprint factors vector:
   * that would require a preCalculateSprintFactors call on every comparison,
   * and would make a filter or anchor mismatch between the publish side and
   * the check side possible. Tuples cannot drift.
   */
  productivityDigest: string | null
  includedVelocitiesDigest: string
  thresholdsDigest: string
}

/**
 * The comparand for isRecordStale — the same shape as RunConfig, holding
 * live values rather than the run's captured ones.
 */
export type ForecastInputSnapshot = Omit<RunConfig, never>

/** The scope-growth view state the snapshot needs. */
export interface ScopeGrowthSource {
  modelScopeGrowth: boolean
  scopeGrowthMode: 'calculated' | 'custom'
  customScopeGrowth: string
}

/** Raw state the builder reads. Every field comes from a store, never a React closure. */
export interface ForecastSnapshotSource {
  project: Project | undefined
  allSprints: Sprint[]
  storedInputs: ForecastInputs | undefined
  trialCount: number
  scopeGrowth: ScopeGrowthSource
}

/**
 * Stable, order-preserving digest. Equality is all that matters — these are
 * never parsed back — so a readable join beats a hash when a failing
 * staleness test needs diagnosing.
 */
function digest(parts: Array<string | number>): string {
  return parts.join('|')
}

/**
 * Coerce to a finite number, else the sentinel.
 *
 * NEVER let NaN into a RunConfig field. NaN !== NaN, so a NaN would make the
 * scalar-field ladder row fire on every comparison forever, and would render
 * "changed from 240 to NaN" into a user-facing status reason. Reachable:
 * effectiveMean is Number(velocityMean) for a non-empty override string, and
 * Number('abc') is NaN.
 */
function finiteOr(value: number, sentinel: number): number {
  return Number.isFinite(value) ? value : sentinel
}

/**
 * Build the snapshot. THE single producer of both a record's runConfig and
 * the comparand — see the header note.
 *
 * Un-runnable states (no cadence, unparseable backlog) still reach this
 * function on the `absent` path, so every non-optional field takes a stable
 * sentinel: 0 for numbers, '' for strings, never NaN.
 */
export function buildForecastInputSnapshot(
  src: ForecastSnapshotSource
): ForecastInputSnapshot {
  const sprint = deriveSprintData(src.project, src.allSprints)
  const inputs = deriveForecastInputs(
    src.project,
    src.storedInputs,
    sprint.calculatedStats,
    sprint.includedSprintCount,
    sprint.includedSprints
  )

  const startDate = sprint.forecastStartDate

  // THE normalization. resolveScopeGrowthPerSprint returns number | undefined;
  // RunConfig wants number | null. Here and nowhere else.
  const scopeGrowthPerSprint =
    resolveScopeGrowthPerSprint(
      src.scopeGrowth.modelScopeGrowth,
      src.scopeGrowth.scopeGrowthMode,
      src.scopeGrowth.customScopeGrowth,
      sprint.scopeChangeStats?.averageScopeInjection
    ) ?? null

  // D18: enabled adjustments whose window has not already closed before the
  // forecast starts. An adjustment ending before startDate cannot affect any
  // forecast sprint, so editing it must not invalidate the record.
  const adjustments = (src.project?.productivityAdjustments ?? []).filter(
    (a) => a.enabled !== false && a.endDate >= startDate
  )
  const productivityDigest =
    adjustments.length === 0
      ? null
      : digest(adjustments.map((a) => `${a.startDate}~${a.endDate}~${a.factor}`))

  return {
    remainingBacklog: safeParseNumber(inputs.remainingBacklog) ?? 0,
    velocityMean: finiteOr(inputs.effectiveMean, 0),
    velocityStdDev: finiteOr(inputs.effectiveStdDev, 0),
    startDate,
    trialCount: src.trialCount,
    sprintCadenceWeeks: src.project?.sprintCadenceWeeks ?? 0,
    forecastMode: inputs.resolvedMode,
    lastSprintNumber: sprint.completedSprintCount,
    scopeGrowthPerSprint,
    includedSprintCount: sprint.includedSprintCount,
    productivityDigest,
    includedVelocitiesDigest: digest(sprint.includedSprints.map((s) => s.doneValue)),
    thresholdsDigest: digest(inputs.cumulativeThresholds),
  }
}

/** The RunConfig fields compared as plain scalars by the ladder's last rung. */
export const RUN_CONFIG_SCALAR_FIELDS = [
  'remainingBacklog',
  'velocityMean',
  'velocityStdDev',
  'startDate',
  'trialCount',
  'sprintCadenceWeeks',
  'forecastMode',
  'lastSprintNumber',
  'scopeGrowthPerSprint',
] as const

/**
 * Compare a run record's captured config against live inputs.
 *
 * A null record is always stale — there is nothing to serve.
 */
export function isRecordStale(
  runConfig: RunConfig | null,
  current: ForecastInputSnapshot
): boolean {
  if (!runConfig) return true
  if (runConfig.productivityDigest !== current.productivityDigest) return true
  if (runConfig.includedVelocitiesDigest !== current.includedVelocitiesDigest) return true
  if (runConfig.includedSprintCount !== current.includedSprintCount) return true
  if (runConfig.thresholdsDigest !== current.thresholdsDigest) return true
  return RUN_CONFIG_SCALAR_FIELDS.some((f) => runConfig[f] !== current[f])
}

/**
 * The first scalar field that differs, for a human-readable status reason.
 * Returns null when the scalars all match.
 */
export function firstChangedScalar(
  runConfig: RunConfig,
  current: ForecastInputSnapshot
): { field: string; before: string | number; after: string | number } | null {
  for (const f of RUN_CONFIG_SCALAR_FIELDS) {
    if (runConfig[f] !== current[f]) {
      return { field: f, before: runConfig[f] ?? 'none', after: current[f] ?? 'none' }
    }
  }
  return null
}
