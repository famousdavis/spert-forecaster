// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The read-only snapshot an external AI client reads through the SPERT MCP
// server. Pure: same inputs, same bytes.
//
// ─────────────────────────────────────────────────────────────────────────
// TWO RULES GOVERN THIS FILE.
// ─────────────────────────────────────────────────────────────────────────
//
// 1. EVERY FIELD IS ADDED BY NAME. There is no spread anywhere in this
//    module, and there must never be one. The stores this reads from carry
//    workspace-reconciliation tokens and export-attribution fields that must
//    not leave the browser; an allowlist cannot leak a field nobody wrote,
//    whereas a spread leaks every field added after it was written. The
//    settings store is the likeliest leak path, because its export
//    attribution fields carry no underscore prefix to make them conspicuous.
//
// 2. SCREEN PARITY IS CLAIMED ONLY WHERE IT HOLDS. The percentile grid is a
//    pure function of arguments this builder reproduces exactly, so its
//    numbers match the table on screen. Anything else that mirrors an
//    on-screen control must emit the value the control actually RENDERS —
//    which, for two of the three summary selectors, is a derived fallback
//    and not the stored cell. The test is mechanical: open the JSX and read
//    the `value={...}` prop. If a value cannot be reproduced, notVisibleToYou
//    has to say so. There is no third option.

import type {
  Milestone,
  Project,
  ProductivityAdjustment,
  Sprint,
} from '@/shared/types'
import type { DistributionType } from '@/shared/types/burn-up'
import { PROJECT_SCOPE, type ScopeSelection } from '@/shared/types/scope'
import type { ForecastRunRecord, ForecastViewState } from '@/shared/state/forecast-results-store'
import type { ForecastInputSnapshot } from '@/shared/lib/forecast-staleness'
import {
  deriveSprintData,
  deriveForecastInputs,
} from '@/shared/lib/forecast-derivations'
import { firstChangedScalar, isRecordStale } from '@/shared/lib/forecast-staleness'
import { MIN_SPRINTS_FOR_BOOTSTRAP } from '@/shared/lib/forecast-constants'
import { getVisibleDistributions } from '@/features/forecast/types'
import { calculatePercentileResult } from '@/features/forecast/lib/monte-carlo'
import { MAX_TRIAL_SPRINTS, DEFAULT_PERCENTILES } from '@/features/forecast/constants'
import {
  computeMilestoneCompletionInfo,
  computeVisibleForecastMilestones,
} from '@/features/forecast/lib/milestones'
import {
  targetDateToSprintCount,
  calculateDeadlineProbability,
} from '@/features/forecast/lib/deadline'
import { canRunForecast, getRunForecastBlockedReason } from '@/features/forecast/lib/run-forecast-prereqs'
import { safeParseNumber } from '@/shared/lib/validation'
import { APP_VERSION } from '@/shared/constants'
import {
  MAX_SNAPSHOT_SPRINTS,
  SNAPSHOT_BYTE_BUDGET,
  SNAPSHOT_TEXT_CAPS,
} from '../constants'

export type SnapshotStatus =
  | 'fresh'
  | 'stale'
  | 'recomputing'
  | 'absent'
  | 'unavailable'

export interface SnapshotInput {
  project: Project | undefined
  allSprints: Sprint[]
  record: ForecastRunRecord | null
  view: ForecastViewState | undefined
  comparand: ForecastInputSnapshot
  storedInputs: Parameters<typeof deriveForecastInputs>[1]
  isSimulatingProjectId: string | null
  distributionsEnabled: readonly DistributionType[] | undefined
  capturedAt: string
  /** Injectable so unit tests can exercise §7.7's escalation steps. */
  byteBudget?: number
}

/** Trim user-authored text to its cap. */
function cap(value: string | undefined, max: number): string {
  return (value ?? '').slice(0, max)
}

/** Distinct-value union, ascending. */
function unionAscending(...groups: Array<readonly number[]>): number[] {
  const seen = new Set<number>()
  for (const g of groups) for (const n of g) seen.add(n)
  return [...seen].sort((a, b) => a - b)
}

/**
 * The two-filter rule ForecastResults applies to its PER-MILESTONE tables:
 * charted AND not completed. Implemented once and used for both
 * `milestones[].chartedAndIncomplete` and `scopes[].renderedOnScreen`, which
 * were previously the same predicate written twice.
 */
function chartedAndIncompleteSet(milestones: Milestone[]): Set<number> {
  const completion = computeMilestoneCompletionInfo(milestones)
  return new Set(
    computeVisibleForecastMilestones(milestones, completion).map((v) => v.originalIndex)
  )
}

/** Trials that hit the engine's per-trial sprint ceiling rather than finishing. */
function saturatedCount(sorted: number[]): number {
  let n = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] < MAX_TRIAL_SPRINTS) break
    n++
  }
  return n
}

const REDACTED_KEYS = ['_originRef', '_storageRef', '_changeLog', '_exportedBy', '_exportedById']

/**
 * Build the snapshot body.
 *
 * Returns the body plus the status, so callers do not have to re-derive it.
 */
export function buildSnapshot(input: SnapshotInput): Record<string, unknown> {
  const {
    project, allSprints, record, view, comparand, storedInputs,
    isSimulatingProjectId, distributionsEnabled, capturedAt,
  } = input
  const budget = input.byteBudget ?? SNAPSHOT_BYTE_BUDGET
  const notVisibleToYou: string[] = [...BASE_NOT_VISIBLE]

  const sprint = deriveSprintData(project, allSprints)
  const inputs = deriveForecastInputs(
    project, storedInputs, sprint.calculatedStats, sprint.includedSprintCount, sprint.includedSprints
  )
  const milestones = project?.milestones ?? []
  const adjustments = project?.productivityAdjustments ?? []
  const completion = computeMilestoneCompletionInfo(milestones)
  const chartedIncomplete = chartedAndIncompleteSet(milestones)

  // ── Freshness ladder, first match wins ──────────────────────────────────
  const ladder = resolveStatus({
    project, record, comparand, isSimulatingProjectId, inputs, sprint,
  })
  const { status, statusReason } = ladder
  const hasResults = status === 'fresh' || status === 'stale'

  // The anchor: run-captured when a record exists, live otherwise.
  const anchorStart = record?.runConfig.startDate ?? sprint.forecastStartDate
  const anchorCadence = record?.runConfig.sprintCadenceWeeks ?? (project?.sprintCadenceWeeks ?? 0)
  const anchorBacklog = record?.runConfig.remainingBacklog ?? comparand.remainingBacklog
  const anchorLastSprint = record?.runConfig.lastSprintNumber ?? sprint.completedSprintCount

  // hasBootstrap follows the RUN when a record exists — the visible set the
  // user is looking at is the one that run produced. With no record (absent,
  // and also recomputing on a project's first run, since ladder row 1
  // precedes rows 2 and 3) there is nothing to read it from, so use live.
  const hasBootstrap = record
    ? record.runConfig.includedSprintCount >= MIN_SPRINTS_FOR_BOOTSTRAP
    : sprint.canUseBootstrap
  const mode = record?.runConfig.forecastMode ?? inputs.resolvedMode
  const visibleDistributions = getVisibleDistributions(mode, hasBootstrap, distributionsEnabled)

  // ── Sprints, most recent MAX_SNAPSHOT_SPRINTS ───────────────────────────
  const ordered = [...sprint.projectSprints].sort((a, b) => a.sprintNumber - b.sprintNumber)
  const shown = ordered.slice(-MAX_SNAPSHOT_SPRINTS)
  // ⚠️ NUMBERS HERE, PROSE IN notVisibleToYou — ONE OWNER PER FACT.
  // This object used to carry a `note` saying the same thing the disclosure
  // below says. Two prose statements of one fact, in two fields, and they
  // drifted: the disclosure claimed the velocity statistics covered ALL
  // sprints while this note correctly said the included set. Correcting one
  // string would have left the mechanism in place.
  const sprintsTruncated = ordered.length > shown.length
    ? { shown: shown.length, total: ordered.length }
    : null
  if (sprintsTruncated) {
    // ⚠️ NAMES THE FIELDS, INTERPOLATES NOTHING. The previous version computed
    // its own denominator and stated it in prose; prose that restates a value
    // can drift from that value, and this one did. BASE_NOT_VISIBLE's headline
    // entry already used the naming form ("userSelections.summaryPercentile"),
    // so the two patterns sat four hundred lines apart in one file and only
    // the interpolating one went wrong.
    notVisibleToYou.push(
      'Sprint history is truncated: sprintsTruncated.shown of ' +
      'sprintsTruncated.total sprints are carried here. The velocity ' +
      'statistics are NOT computed over all of them — velocityStats.count is ' +
      'the number of sprints they cover, which is includedSprintCount. ' +
      'Sprints the user excluded from the forecast are counted in ' +
      'totalSprintCount and excluded from velocityStats.'
    )
  }

  const sprintDatesResolved = sprint.resolvedSprintDates !== undefined
  if (!sprintDatesResolved) {
    notVisibleToYou.push(
      'Sprint start and finish dates could not be resolved from the project ' +
      'schedule, so each sprint reports its own stored dates instead.'
    )
  }

  const body: Record<string, unknown> = {
    app: 'forecaster',
    appVersion: APP_VERSION,
    capturedAt,
    bodyDegraded: false,
    projectConfig: {
      name: cap(project?.name, SNAPSHOT_TEXT_CAPS.projectName),
      unitOfMeasure: cap(project?.unitOfMeasure, SNAPSHOT_TEXT_CAPS.unitOfMeasure),
      sprintCadenceWeeks: project?.sprintCadenceWeeks ?? null,
      firstSprintStartDate: project?.firstSprintStartDate ?? null,
      projectStartDate: project?.projectStartDate ?? null,
      projectFinishDate: project?.projectFinishDate ?? null,
    },
    sprintHistory: {
      lastSprintNumber: sprint.completedSprintCount,
      totalSprintCount: ordered.length,
      includedSprintCount: sprint.includedSprintCount,
      sprintsTruncated,
      sprintDatesResolved,
      velocityStats: {
        count: sprint.calculatedStats.count,
        mean: sprint.calculatedStats.mean,
        standardDeviation: sprint.calculatedStats.standardDeviation,
      },
      scopeChange: sprint.scopeChangeStats
        ? {
            averageScopeInjection: sprint.scopeChangeStats.averageScopeInjection,
            trend: sprint.scopeChangeStats.trend,
            sprintsWithData: sprint.scopeChangeStats.sprintsWithData,
          }
        : null,
      sprints: shown.map((s) => {
        const resolved = sprint.resolvedSprintDates?.get(s.sprintNumber)
        return {
          sprintNumber: s.sprintNumber,
          startDate: resolved?.startDate ?? s.sprintStartDate,
          finishDate: resolved?.finishDate ?? s.sprintFinishDate,
          doneValue: s.doneValue,
          backlogAtSprintEnd: s.backlogAtSprintEnd ?? null,
          includedInForecast: s.includedInForecast,
          hasCustomFinishDate: s.customFinishDate !== undefined,
        }
      }),
    },
    milestones: milestones.map((m, i) => ({
      name: cap(m.name, SNAPSHOT_TEXT_CAPS.milestoneName),
      backlogSize: m.backlogSize,
      cumulativeThreshold: inputs.cumulativeThresholds[i] ?? 0,
      completed: completion[i]?.completed ?? false,
      showOnChart: m.showOnChart !== false,
      chartedAndIncomplete: chartedIncomplete.has(i),
    })),
    productivityAdjustments: adjustments.map((a: ProductivityAdjustment) => ({
      name: cap(a.name, SNAPSHOT_TEXT_CAPS.adjustmentName),
      startDate: a.startDate,
      endDate: a.endDate,
      factor: a.factor,
      enabled: a.enabled !== false,
      reason: cap(a.reason, SNAPSHOT_TEXT_CAPS.adjustmentReason),
      // Evaluated for EVERY adjustment including disabled ones, so the AI can
      // explain why a disabled or already-past one changes nothing.
      appliesToForecastPeriod: a.endDate >= anchorStart,
    })),
    forecastInputs: {
      mode,
      modeWasUserOverridden: storedInputs?.forecastMode !== undefined,
      remainingBacklog: anchorBacklog,
      remainingBacklogSource: storedInputs?.remainingBacklog ? 'user' : 'derived-from-sprints',
      effectiveMean: record?.runConfig.velocityMean ?? comparand.velocityMean,
      effectiveStdDev: record?.runConfig.velocityStdDev ?? comparand.velocityStdDev,
      velocityMeanOverridden: !!storedInputs?.velocityMean,
      velocityStdDevOverridden: !!storedInputs?.velocityStdDev,
      volatilityMultiplier: inputs.volatilityMultiplier,
      velocityEstimate: safeParseNumber(inputs.velocityEstimate),
      selectedCV: inputs.selectedCV,
      scopeGrowthPerSprint: record?.runConfig.scopeGrowthPerSprint ?? comparand.scopeGrowthPerSprint,
      scopeGrowthModeled: view?.modelScopeGrowth ?? false,
      forecastStartDate: anchorStart,
      forecastStartDateSource: record ? 'run-captured' : 'live',
      trialCount: record?.runConfig.trialCount ?? comparand.trialCount,
    },
    userSelections: buildUserSelections({
      view, milestones, completion, visibleDistributions, record,
    }),
  }

  const results: Record<string, unknown> = {
    status,
    statusReason,
    runAt: record?.runAt ?? null,
    anchorSource: record ? 'run-captured' : 'live',
    visibleDistributions,
    visibleDistributionsEmpty: visibleDistributions.length === 0,
  }

  if (!hasResults) {
    // recomputing / absent carry the status block only. Omitted, not null —
    // a null `scopes` reads as "there are no scopes", which is a different
    // claim from "not carried in this state".
    notVisibleToYou.push(
      `No percentile results are carried while the forecast is "${status}". ` +
      'Re-read once the status is "fresh" or "stale".'
    )
    body.results = results
    body.deadlineProbability = null
    body.notVisibleToYou = notVisibleToYou
    return finalize(body, budget, notVisibleToYou)
  }

  const run = record!
  const computedDistributions = distributionKeys(run)
  const modeOnly = getVisibleDistributions(mode, hasBootstrap)
  const modeExcluded = computedDistributions.filter((d) => !modeOnly.includes(d))
  if (modeExcluded.length > 0) {
    notVisibleToYou.push(
      'Some computed distributions are not valid for the current forecast ' +
      'mode and are listed in modeExcludedDistributions. Do not present ' +
      'those as options the user chose to hide.'
    )
  }

  const finalThreshold = run.scopes[run.scopes.length - 1]?.cumulativeThreshold ?? 0
  const finalScopeCoversBacklog = finalThreshold >= run.runConfig.remainingBacklog

  const percentileSet = unionAscending(
    view?.selectedResultsPercentiles ?? [],
    view ? [view.customPercentile, view.customPercentile2, view.summaryPercentile] : [],
    DEFAULT_PERCENTILES
  ).filter((p) => p >= 1 && p <= 99)

  const allComplete = milestones.length > 0 && completion.every((c) => c.completed)
  const selectedIdx = view?.selectedMilestoneIndex ?? 0

  const scopes = allComplete
    ? [collapsedScope()]
    : run.scopes.map((scope, i) => ({
        kind: scope.kind,
        milestoneIndex: scope.milestoneIndex,
        label: scope.label,
        cumulativeThreshold: scope.cumulativeThreshold,
        thresholdUnreachable: scope.thresholdUnreachable,
        // The two-filter rule governs only the PER-MILESTONE tables. The main
        // results table renders the selected scope unconditionally, so a
        // hidden-but-selected milestone would otherwise be marked false on
        // exactly what the user is reading.
        renderedOnScreen:
          (scope.milestoneIndex !== null && chartedIncomplete.has(scope.milestoneIndex)) ||
          i === selectedIdx,
        byDistribution: buildByDistribution(
          run, i, computedDistributions, percentileSet, anchorStart, anchorCadence, anchorLastSprint
        ),
      }))

  if (allComplete) {
    notVisibleToYou.push(
      'Every milestone in this project is marked complete (zero work ' +
      'remaining), so every cumulative threshold is zero and all scopes ' +
      'resolve at the first sprint. One placeholder scope is reported ' +
      'instead of a per-milestone breakdown, and the summary scope selector ' +
      "has no counterpart in this snapshot's scope list."
    )
  }
  if (scopes.some((s) => !s.renderedOnScreen)) {
    notVisibleToYou.push(
      'Some scopes carry results the user is not currently looking at; they ' +
      'are marked renderedOnScreen: false.'
    )
  }
  // ⚠️ The final clause used to read "This is how the app has always behaved
  // and is not a change introduced by this connection." The second half is
  // checkable and kept; the first half was not. "Always" names no version and
  // no behaviour that can be pinned, so no mechanism could ever show it false
  // — and a claim that cannot be falsified does not belong in a channel whose
  // entire value is being trusted. Replaced with the locatable fact that
  // carries the same reassurance: the recomputation lives in the summary
  // component, not in anything this connection added.
  notVisibleToYou.push(
    'The forecast summary recomputes some percentile dates live rather than ' +
    'reading the stored run, so a date it shows at a non-standard percentile ' +
    'may differ slightly from the grid here. That recomputation is part of the ' +
    'forecast summary itself, not of this connection.'
  )

  results.computedDistributions = computedDistributions
  results.modeExcludedDistributions = modeExcluded
  results.backlogDivergence = finalThreshold === run.runConfig.remainingBacklog
    ? null
    : { finalMilestoneThreshold: finalThreshold, remainingBacklog: run.runConfig.remainingBacklog }
  results.finalScopeCoversBacklog = finalScopeCoversBacklog
  results.scopes = scopes
  body.results = results

  body.deadlineProbability = buildDeadlineProbability({
    view, run, computedDistributions, anchorStart, anchorCadence,
  })
  if (body.deadlineProbability) {
    notVisibleToYou.push(
      'The deadline probability here is computed independently from the ' +
      'stored run, so it may differ from the panel on screen — including ' +
      'when that panel\'s own scope selector reads "Entire Project", because ' +
      'the panel receives a milestone-swapped series.'
    )
  }

  body.notVisibleToYou = notVisibleToYou
  return finalize(body, budget, notVisibleToYou)
}

const BASE_NOT_VISIBLE = [
  'The raw per-trial simulation data. Only percentile summaries are carried.',
  'The charts as rendered — the burn-up chart, the histogram, and their styling.',
  'Any project other than the one currently open.',
  'Anything that has not been forecast yet.',
  'The cumulative-probability curve. The app plots it; this snapshot does not carry it.',
  'The large percentage in the forecast headline. That figure is the true ' +
    'cumulative probability at the displayed date, which is at least ' +
    'userSelections.summaryPercentile and can be materially higher, and this ' +
    'snapshot does not carry it. Quote summaryPercentile only for the ' +
    'sentence below the headline.',
]

/** Non-null distribution keys of the run's own results — never the visible set. */
function distributionKeys(run: ForecastRunRecord): DistributionType[] {
  const first = run.quadResults[0]
  if (!first) return []
  const order: DistributionType[] = [
    'lognormal', 'truncatedNormal', 'gamma', 'bootstrap', 'triangular', 'uniform',
  ]
  return order.filter((d) => first[d] !== null && first[d] !== undefined)
}

function buildByDistribution(
  run: ForecastRunRecord,
  scopeIndex: number,
  distributions: DistributionType[],
  percentiles: number[],
  startDate: string,
  cadence: number,
  lastSprintNumber: number
): Record<string, unknown> {
  const simData = run.simData[scopeIndex]
  const out: Record<string, unknown> = {}
  for (const d of distributions) {
    const sorted = simData?.[d]
    if (!sorted) continue
    out[d] = {
      // Per DISTRIBUTION, not per scope: a lognormal trial can hit the
      // engine's sprint ceiling where the gamma trial does not.
      saturatedTrialCount: saturatedCount(sorted),
      percentiles: percentiles.map((p) => {
        const r = calculatePercentileResult(sorted, p, startDate, cadence)
        return {
          p,
          sprintsFromNow: r.sprintsRequired,
          absoluteSprint: lastSprintNumber + r.sprintsRequired,
          finishDate: r.finishDate,
        }
      }),
    }
  }
  return out
}

/**
 * The all-milestones-complete collapse.
 *
 * Every threshold is zero, so every scope resolves at sprint 1 and a
 * per-milestone breakdown would be N identical rows under N different names.
 * This is a BUILDER behaviour: the record still holds N entries, so `scopes`
 * is the only place its 1:1 alignment with simData is broken — which is why
 * milestoneIndex is an explicit null rather than a stale index.
 *
 * No underscore-prefixed key may appear here, or anywhere else in the body.
 */
function collapsedScope() {
  return {
    kind: 'cumulative-final' as const,
    milestoneIndex: null,
    label: 'all milestones complete',
    cumulativeThreshold: 0,
    thresholdUnreachable: true,
    renderedOnScreen: true,
    byDistribution: {} as Record<string, unknown>,
  }
}

/**
 * What the three summary selectors DISPLAY.
 *
 * Two of the three render a DERIVED value, not the stored cell — open
 * ForecastSummary.tsx and read the `value={...}` prop on each `<select>`.
 * Emitting the raw cells here would put "lognormal" on the wire while the
 * screen reads "Gamma", or a milestone index while the screen reads "Entire
 * Project".
 */
function buildUserSelections(args: {
  view: ForecastViewState | undefined
  milestones: Milestone[]
  completion: Array<{ completed: boolean }>
  visibleDistributions: DistributionType[]
  record: ForecastRunRecord | null
}): Record<string, unknown> {
  const { view, milestones, completion, visibleDistributions, record } = args

  // effectiveDistribution: the stored choice if still offered, else the first
  // option. Reachable by enabling only Gamma in Settings.
  const stored = view?.summaryDistribution ?? 'lognormal'
  const summaryDistribution = visibleDistributions.includes(stored)
    ? stored
    : (visibleDistributions[0] ?? stored)

  // effectiveScope: a milestone id survives ONLY if that milestone is not
  // completed. ForecastSummary filters its scope options on !completed ALONE
  // — NOT on the two-filter chart rule — so a milestone with showOnChart
  // false IS still selectable here. Using the two-filter helper would drop it
  // and reproduce the very defect this reproduction exists to avoid.
  const storedScope: ScopeSelection = view?.summaryScope ?? PROJECT_SCOPE
  let summaryScope: number | null = null
  if (storedScope !== PROJECT_SCOPE) {
    const idx = milestones.findIndex((m) => m.id === storedScope)
    // Unreachable by construction — the completed check already removes any
    // id the selector would not offer — but emit null rather than -1 if it
    // somehow occurs.
    summaryScope = idx >= 0 && !completion[idx]?.completed ? idx : null
  }

  // The index joins results.scopes. In the all-milestones-complete case the
  // builder collapses scopes to one entry, so a record-clamped index has no
  // counterpart; emit null there.
  const allComplete = milestones.length > 0 && completion.every((c) => c.completed)
  const rawIndex = view?.selectedMilestoneIndex ?? 0
  const selectedMilestoneIndex =
    allComplete || !record ? null : Math.min(rawIndex, record.scopes.length - 1)

  return {
    summaryScope,
    summaryDistribution,
    // The one selector whose `value=` really is the raw cell.
    summaryPercentile: view?.summaryPercentile ?? 80,
    resultsTablePercentiles: view?.selectedResultsPercentiles ?? [],
    customPercentiles: view ? [view.customPercentile, view.customPercentile2] : [],
    selectedMilestoneIndex,
  }
}

function buildDeadlineProbability(args: {
  view: ForecastViewState | undefined
  run: ForecastRunRecord
  computedDistributions: DistributionType[]
  anchorStart: string
  anchorCadence: number
}): Record<string, unknown> | null {
  const { view, run, computedDistributions, anchorStart, anchorCadence } = args
  const targetDate = view?.targetDate
  if (!targetDate || !anchorCadence) return null

  // Two functions, in order. targetDateToSprintCount returns a SprintAtDate,
  // not a number.
  const at = targetDateToSprintCount(targetDate, anchorStart, anchorCadence)
  const finalIndex = run.simData.length - 1
  const simData = run.simData[finalIndex]
  if (!simData) return null

  const byDistribution: Record<string, unknown> = {}
  for (const d of computedDistributions) {
    const sorted = simData[d]
    if (!sorted) continue
    const r = calculateDeadlineProbability(sorted, at.sprintCount)
    byDistribution[d] = { value: r.value, wasCapped: r.wasCapped }
  }

  return {
    derivedIndependently: true,
    targetDate,
    scope: run.scopes[finalIndex]?.kind ?? 'project',
    sprintCount: at.sprintCount,
    // sprintCount === 0 is the actual guard: a target inside forecast sprint
    // 1 also yields 0, and is not "before the forecast start".
    noForecastSprintFinishesByTarget: at.sprintCount === 0,
    byDistribution,
  }
}

const RERUN_TAIL = ' Ask the user to open the Forecast tab to recompute.'

function resolveStatus(args: {
  project: Project | undefined
  record: ForecastRunRecord | null
  comparand: ForecastInputSnapshot
  isSimulatingProjectId: string | null
  inputs: ReturnType<typeof deriveForecastInputs>
  sprint: ReturnType<typeof deriveSprintData>
}): { status: SnapshotStatus; statusReason: string | null } {
  const { project, record, comparand, isSimulatingProjectId, inputs } = args

  if (project && isSimulatingProjectId === project.id) {
    return {
      status: 'recomputing',
      statusReason: 'A forecast is running now. Re-read in a few seconds.',
    }
  }

  const prereq = {
    sprintCadenceWeeks: project?.sprintCadenceWeeks,
    firstSprintStartDate: project?.firstSprintStartDate,
    remainingBacklog: inputs.remainingBacklog,
    effectiveMean: inputs.effectiveMean,
  }
  const blockedReason = getRunForecastBlockedReason(prereq)
  const parsedBacklog = safeParseNumber(inputs.remainingBacklog)
  // canRunForecast tests !!remainingBacklog on the RAW STRING, so "0" passes
  // every prerequisite while the handler returns early on parsedBacklog <= 0.
  // Without widening row 2, row 3 would advise a run that silently does
  // nothing, forever.
  const runBlocked = !canRunForecast(prereq) || parsedBacklog === null || parsedBacklog <= 0
  const noBacklogMessage =
    'No usable remaining backlog has been entered on the Forecast tab, so a ' +
    'forecast cannot run yet.'

  if (!record) {
    if (runBlocked) {
      return { status: 'absent', statusReason: blockedReason ?? noBacklogMessage }
    }
    return {
      status: 'absent',
      statusReason:
        'No forecast has been run for this project in this browser session. ' +
        'Ask the user to open the Forecast tab and run one.',
    }
  }

  // Rows 4-7's closing sentence normally advises a re-run — except when the
  // run is currently blocked, which IS reachable with a record present: run a
  // forecast, then clear the backlog field.
  const tail = runBlocked
    ? ' The forecast cannot be re-run until ' + (blockedReason ?? noBacklogMessage)
    : RERUN_TAIL

  const rc = record.runConfig
  if (rc.productivityDigest !== comparand.productivityDigest) {
    return {
      status: 'stale',
      statusReason:
        'A productivity adjustment ending on or after the forecast start was ' +
        'added, removed, or edited since this forecast ran.' + tail,
    }
  }
  if (
    rc.includedVelocitiesDigest !== comparand.includedVelocitiesDigest ||
    rc.includedSprintCount !== comparand.includedSprintCount
  ) {
    return {
      status: 'stale',
      statusReason:
        'The set of sprints included in the forecast changed since it ran.' + tail,
    }
  }
  if (rc.thresholdsDigest !== comparand.thresholdsDigest) {
    return {
      status: 'stale',
      statusReason:
        'A milestone was added, removed, or resized since this forecast ran.' + tail,
    }
  }
  if (isRecordStale(rc, comparand)) {
    const changed = firstChangedScalar(rc, comparand)
    return {
      status: 'stale',
      statusReason: changed
        ? `${changed.field} changed from ${changed.before} to ${changed.after} ` +
          `since this forecast ran.${tail}`
        : 'An input changed since this forecast ran.' + tail,
    }
  }
  return { status: 'fresh', statusReason: null }
}

/**
 * Size the body and, if it is over budget, degrade rather than skip.
 *
 * A skipped write leaves the PRIOR snapshot in place and stale, so the AI
 * reads outdated numbers with no signal at all. Both escalation steps set
 * bodyDegraded: true.
 */
function finalize(
  body: Record<string, unknown>,
  budget: number,
  notVisibleToYou: string[]
): Record<string, unknown> {
  if (JSON.stringify(body).length <= budget) return body

  // Step 1 — drop the percentile grids for distributions the user cannot see.
  const results = body.results as Record<string, unknown> | undefined
  const visible = (results?.visibleDistributions as DistributionType[]) ?? []
  const scopes = results?.scopes as Array<Record<string, unknown>> | undefined
  if (scopes) {
    for (const scope of scopes) {
      const byDist = scope.byDistribution as Record<string, unknown>
      for (const key of Object.keys(byDist)) {
        if (!visible.includes(key as DistributionType)) delete byDist[key]
      }
    }
    body.bodyDegraded = true
    notVisibleToYou.push(
      'This project exceeded the snapshot size budget, so percentile grids ' +
      'for distributions the user cannot currently see were dropped.'
    )
    if (JSON.stringify(body).length <= budget) return body
  }

  // Step 2 — configuration only.
  notVisibleToYou.push(
    'This project exceeded the snapshot size budget even after reduction, ' +
    'so only its configuration is included.'
  )
  return {
    app: body.app,
    appVersion: body.appVersion,
    capturedAt: body.capturedAt,
    bodyDegraded: true,
    projectConfig: body.projectConfig,
    results: {
      status: 'unavailable',
      statusReason:
        "This project's data exceeded the snapshot size budget, so only its " +
        'configuration is included.',
    },
    notVisibleToYou,
  }
}

/** Exported for the leak test, so the assertion and the builder cannot drift. */
export const SNAPSHOT_REDACTED_KEYS = REDACTED_KEYS
