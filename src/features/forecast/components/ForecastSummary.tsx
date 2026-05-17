// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { calculatePercentileResult, cumulativeProbabilityAtSprint, type PercentileResults, type QuadResults, type QuadSimulationData } from '../lib/monte-carlo'
import type { MilestoneResults } from '../hooks/useForecastState'
import { formatDateLong } from '@/shared/lib/dates'
import type { Milestone, ForecastMode } from '@/shared/types'
import { type DistributionType, DISTRIBUTION_LABELS, getVisibleDistributions } from '../types'
import { useSettingsStore } from '@/shared/state/settings-store'
import { indefiniteArticle } from '@/shared/lib/grammar'
import { HelpTooltip } from '@/shared/components/HelpTooltip'
import type { MilestoneCompletionInfo } from '../lib/milestones'
import { PROJECT_SCOPE, type ScopeSelection } from '../lib/scope'

interface ForecastSummaryProps {
  results: QuadResults
  simulationData: QuadSimulationData
  completedSprintCount: number
  remainingBacklog: number
  unitOfMeasure: string
  projectName: string
  sprintCadenceWeeks: number
  startDate: string
  milestones?: Milestone[]
  milestoneResultsState?: MilestoneResults | null
  /**
   * Per-milestone completion status, 1:1 with `milestones`. Computed upstream in
   * useForecastState; consumed here to filter the Scope picker and to render
   * completed milestones past-tense in the breakdown.
   */
  milestoneCompletionInfo?: MilestoneCompletionInfo[]
  hasBootstrap: boolean
  forecastMode: ForecastMode
  modelScopeGrowth?: boolean
  scopeGrowthMode?: 'calculated' | 'custom'
  scopeGrowthPerSprint?: number
  velocityMean?: string
  velocityStdDev?: string
  volatilityMultiplier?: number
}

// Lower percentiles (10/20/30/40) added in v0.31.2 to support optimistic forecasting alongside
// the conservative end of the range. Order is ascending so the dropdown reads naturally.
const PERCENTILE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95] as const

// PROJECT_SCOPE / ScopeSelection are imported from ../lib/scope so the new
// v0.33.0 DeadlineProbabilityPanel can use the same sentinel without
// duplicating the definition. Behavior is unchanged.

// Completion-status derivation lives in ../lib/milestones (shared with ForecastResults
// and useForecastState so the computation isn't duplicated). The hook lifts the value
// into context and passes it down as `milestoneCompletionInfo`.

function getResultForPercentile(
  results: PercentileResults,
  simulationData: number[],
  percentile: number,
  startDate: string,
  sprintCadenceWeeks: number
): { sprintsRequired: number; finishDate: string } {
  const standardKeys: Record<number, keyof PercentileResults> = {
    50: 'p50', 60: 'p60', 70: 'p70', 80: 'p80', 90: 'p90',
  }
  const key = standardKeys[percentile]
  if (key) {
    return results[key]
  }
  // For non-standard percentiles, calculate from simulation data
  const result = calculatePercentileResult(simulationData, percentile, startDate, sprintCadenceWeeks)
  return result
}

/**
 * Build the lower-section summary sentence.
 *
 * Project scope (milestoneName omitted): "...will finish the {backlog} {unit} backlog by Sprint N (date)."
 * Milestone scope (milestoneName provided): "...will finish the {backlog} {unit} {milestoneName} by Sprint N (date)."
 *
 * Uses "at least {a/an} {percentile}%" framing — true under sprint-quantization since the
 * displayed date is the *earliest* sprint-end where the CDF reaches the selected percentile,
 * so the actual cumulative probability at that date is ≥ percentile.
 */
export function buildSummaryText(
  projectName: string,
  backlog: number,
  unitOfMeasure: string,
  percentile: number,
  sprintsRequired: number,
  finishDate: string,
  completedSprintCount: number,
  distributionLabel: string,
  modelScopeGrowth?: boolean,
  scopeGrowthPerSprint?: number,
  scopeGrowthMode?: 'calculated' | 'custom',
  milestoneName?: string,
): string {
  const absoluteSprint = sprintsRequired + completedSprintCount
  const article = indefiniteArticle(percentile)
  const subject = milestoneName ?? 'backlog'
  let text = `Using the ${distributionLabel} distribution, there is at least ${article} ${percentile}% chance that ${projectName} will finish the ${backlog.toLocaleString()} ${unitOfMeasure} ${subject} by Sprint ${absoluteSprint} (${formatDateLong(finishDate)}).`
  if (modelScopeGrowth && scopeGrowthPerSprint !== undefined) {
    const sign = scopeGrowthPerSprint > 0 ? '+' : ''
    const source = scopeGrowthMode === 'custom' ? 'custom' : 'calculated'
    text += ` Scope growth of ${sign}${scopeGrowthPerSprint.toFixed(1)} ${unitOfMeasure}/sprint is modeled (${source}).`
  }
  return text
}

/** Future-tense per-milestone line used in the breakdown for not-yet-completed milestones. */
export function buildMilestoneSummaryText(
  milestoneName: string,
  sprintsRequired: number,
  finishDate: string,
  completedSprintCount: number
): string {
  const absoluteSprint = sprintsRequired + completedSprintCount
  return `${milestoneName}: Sprint ${absoluteSprint} (${formatDateLong(finishDate)})`
}

/** Past-tense per-milestone line used in the breakdown for completed milestones.
 *  A milestone is "completed" when the user has set its backlogSize to 0. The system
 *  does not know *when* it completed (release-history lives in GanttApp), so the
 *  line is intentionally terse — name + state, no sprint number, no date. The word
 *  "completed" rather than "shipped" or "released" — not every milestone represents
 *  a release event (some are markers like "Feature Complete"), but every milestone
 *  can be in a state where all its remaining work is done. */
export function buildCompletedMilestoneText(milestoneName: string): string {
  return `${milestoneName}: completed`
}

export function ForecastSummary({
  results,
  simulationData,
  completedSprintCount,
  remainingBacklog,
  unitOfMeasure,
  projectName,
  sprintCadenceWeeks,
  startDate,
  milestones = [],
  milestoneResultsState,
  milestoneCompletionInfo: completionInfo = [],
  hasBootstrap,
  forecastMode,
  modelScopeGrowth,
  scopeGrowthMode,
  scopeGrowthPerSprint,
  velocityMean,
  velocityStdDev,
  volatilityMultiplier,
}: ForecastSummaryProps) {
  // Initial value aligned with the v0.32.0 Settings default. The actual rendered selection is
  // `effectiveDistribution` below, which falls back to the first enabled distribution if this
  // value isn't visible in the current Settings.
  const [selectedDistribution, setSelectedDistribution] = useState<DistributionType>('lognormal')
  const [selectedPercentile, setSelectedPercentile] = useState(80)
  const [selectedScope, setSelectedScope] = useState<ScopeSelection>(PROJECT_SCOPE)
  const distributionsEnabled = useSettingsStore((s) => s.distributionsEnabled)

  const distributionOptions = useMemo(
    () => getVisibleDistributions(forecastMode, hasBootstrap, distributionsEnabled),
    // do not drop distributionsEnabled — array reference stability is provided by Zustand
    // (same array identity until setDistributionsEnabled fires). Dropping it would freeze
    // the visible set against Settings changes within a single render session.
    [hasBootstrap, forecastMode, distributionsEnabled]
  )

  // Derive the "effective" distribution: if the user's selectedDistribution is still in the
  // visible set, use it; otherwise fall back to the first visible option. Computed at render
  // time rather than via a state-fallback useEffect — this avoids cascading renders entirely
  // and the value naturally tracks Settings changes without state synchronization.
  const effectiveDistribution: DistributionType = distributionOptions.includes(selectedDistribution)
    ? selectedDistribution
    : (distributionOptions[0] ?? selectedDistribution)

  // Scope options: "Entire Project" plus any not-yet-completed milestone. If the user
  // previously selected a milestone that has since been completed, fall back to
  // Entire Project.
  const scopeOptions = useMemo(() => {
    const opts: Array<{ value: ScopeSelection; label: string }> = [
      { value: PROJECT_SCOPE, label: 'Entire Project' },
    ]
    milestones.forEach((m, idx) => {
      if (!completionInfo[idx]?.completed) {
        opts.push({ value: m.id, label: m.name })
      }
    })
    return opts
  }, [milestones, completionInfo])

  const effectiveScope: ScopeSelection = useMemo(() => {
    if (selectedScope === PROJECT_SCOPE) return PROJECT_SCOPE
    return scopeOptions.some((o) => o.value === selectedScope) ? selectedScope : PROJECT_SCOPE
  }, [selectedScope, scopeOptions])

  // Resolve the milestone index for the effective scope (or null for project scope).
  const effectiveMilestoneIndex: number | null = useMemo(() => {
    if (effectiveScope === PROJECT_SCOPE) return null
    const idx = milestones.findIndex((m) => m.id === effectiveScope)
    return idx === -1 ? null : idx
  }, [effectiveScope, milestones])

  // Pull the right results + sim data for the effective scope. For project scope, the
  // top-level results; for milestone scope, the per-milestone slice from milestoneResultsState.
  const activeResults = useMemo<PercentileResults | null>(() => {
    if (effectiveMilestoneIndex === null) {
      return results[effectiveDistribution] ?? null
    }
    if (!milestoneResultsState) return null
    return milestoneResultsState.milestoneResults[effectiveMilestoneIndex]?.[effectiveDistribution] ?? null
  }, [effectiveMilestoneIndex, results, milestoneResultsState, effectiveDistribution])

  const activeSimData = useMemo<number[] | null>(() => {
    if (effectiveMilestoneIndex === null) {
      return simulationData[effectiveDistribution] ?? null
    }
    if (!milestoneResultsState) return null
    return milestoneResultsState.milestoneSimulationData[effectiveMilestoneIndex]?.[effectiveDistribution] ?? null
  }, [effectiveMilestoneIndex, simulationData, milestoneResultsState, effectiveDistribution])

  // The sprintsRequired + finishDate for the user-selected percentile under the effective scope.
  const selectedResult = useMemo(() => {
    if (!activeResults || !activeSimData) return null
    return getResultForPercentile(activeResults, activeSimData, selectedPercentile, startDate, sprintCadenceWeeks)
  }, [activeResults, activeSimData, selectedPercentile, startDate, sprintCadenceWeeks])

  // True cumulative probability at the displayed date. Because dates round up to sprint-end,
  // the actual CDF here is ≥ selectedPercentile — and may be quite a bit higher when the
  // surrounding sprint bucket holds many simulated outcomes. Headline uses this rather than
  // selectedPercentile to keep the (percent, date) pair internally consistent.
  //
  // Capped at 99%: no forward-looking probability assertion ever claims complete certainty.
  // Symmetric with the new DeadlineProbabilityPanel cap (v0.33.0) so the two adjacent
  // headlines on the Forecast tab agree on the ceiling. DistributionChart axes/tooltips
  // remain uncapped — those are mathematical CDF visualizations, not headline assertions.
  // Cap-after-round arithmetic: Math.round(99.5) === 100, then Math.min(99, 100) === 99.
  const trueCdfPercent = useMemo(() => {
    if (!selectedResult || !activeSimData) return null
    return Math.min(99, Math.round(cumulativeProbabilityAtSprint(activeSimData, selectedResult.sprintsRequired)))
  }, [selectedResult, activeSimData])

  // The milestone object for milestone-scope rendering (so we can use its name + backlogSize).
  const effectiveMilestone: Milestone | null =
    effectiveMilestoneIndex !== null ? milestones[effectiveMilestoneIndex] ?? null : null

  const summaryText = useMemo(() => {
    if (!selectedResult) return ''
    // Project scope → "backlog" subject + remainingBacklog. Milestone scope → milestone name as
    // subject + the milestone's own incremental backlogSize.
    const backlogForSummary = effectiveMilestone ? effectiveMilestone.backlogSize : remainingBacklog
    return buildSummaryText(
      projectName,
      backlogForSummary,
      unitOfMeasure,
      selectedPercentile,
      selectedResult.sprintsRequired,
      selectedResult.finishDate,
      completedSprintCount,
      DISTRIBUTION_LABELS[effectiveDistribution],
      modelScopeGrowth,
      scopeGrowthPerSprint,
      scopeGrowthMode,
      effectiveMilestone?.name,
    )
  }, [selectedResult, projectName, remainingBacklog, unitOfMeasure, selectedPercentile, completedSprintCount, effectiveDistribution, modelScopeGrowth, scopeGrowthPerSprint, scopeGrowthMode, effectiveMilestone])

  // Breakdown filter: charted (showOnChart !== false) AND not the currently selected Scope
  // (coexistence option C — supporting detail under the headline; never duplicates it).
  const visibleMilestones = useMemo(
    () => milestones
      .map((m, idx) => ({ milestone: m, originalIndex: idx }))
      .filter(({ milestone: m }) => m.showOnChart !== false)
      .filter(({ milestone: m }) => effectiveScope === PROJECT_SCOPE || m.id !== effectiveScope),
    [milestones, effectiveScope]
  )

  /**
   * One line of text per breakdown row. For completed milestones, render the
   * past-tense "completed" line. For not-yet-completed milestones, fall back to
   * the future-tense forecast pulled from milestoneResultsState.
   */
  const milestoneTexts = useMemo(() => {
    if (visibleMilestones.length === 0) return []
    return visibleMilestones.map(({ milestone, originalIndex }) => {
      const c = completionInfo[originalIndex]
      if (c?.completed) {
        return buildCompletedMilestoneText(milestone.name)
      }
      if (!milestoneResultsState) return null
      const msResults = milestoneResultsState.milestoneResults[originalIndex]
      const msSimData = milestoneResultsState.milestoneSimulationData[originalIndex]
      if (!msResults || !msSimData) return null
      const distResults = msResults[effectiveDistribution]
      const distSimData = msSimData[effectiveDistribution]
      if (!distResults || !distSimData) return null
      const result = getResultForPercentile(distResults, distSimData, selectedPercentile, startDate, sprintCadenceWeeks)
      return buildMilestoneSummaryText(
        milestone.name,
        result.sprintsRequired,
        result.finishDate,
        completedSprintCount
      )
    }).filter(Boolean) as string[]
  }, [milestoneResultsState, visibleMilestones, completionInfo, effectiveDistribution, selectedPercentile, startDate, sprintCadenceWeeks, completedSprintCount])

  const handleCopy = () => {
    let fullText = summaryText
    if (milestoneTexts.length > 0) {
      fullText += '\n\nMilestones:\n' + milestoneTexts.map((t) => `  - ${t}`).join('\n')
    }
    navigator.clipboard.writeText(fullText).then(() => {
      toast.success('Summary copied to clipboard')
    }).catch(() => {
      toast.error('Failed to copy to clipboard')
    })
  }

  if (!selectedResult) return null

  // Hero lead: plain-language summary of the forecast. Mode-agnostic — "forecast judgments"
  // covers the full set of inputs (project scope, included sprint history, velocity overrides,
  // subjective estimates, productivity adjustments, scope-growth assumptions) without
  // privileging one mode's vocabulary. The mode-specific source line is still rendered as a
  // small italic note under the lower-section summary.
  const heroLead = `Based upon your forecast judgments,`

  // Headline percent shown in the hero is the *true* CDF at the displayed date, not the
  // user's selected percentile. Falls back to selected percentile if the helper couldn't
  // compute (no sim data) — should never happen when selectedResult is non-null but the
  // belt-and-braces makes the JSX safe.
  const heroPercent = trueCdfPercent ?? selectedPercentile
  const heroArticle = indefiniteArticle(heroPercent)
  const heroDate = formatDateLong(selectedResult.finishDate)

  return (
    <>
      <section
        aria-labelledby="forecast-hero-heading"
        className="mt-4 bg-spert-blue/5 dark:bg-spert-blue/20 border-l-4 border-spert-blue rounded-r-lg p-5"
      >
        <h2
          id="forecast-hero-heading"
          className="text-sm font-semibold uppercase tracking-wide text-spert-text-muted dark:text-gray-300 mb-2"
        >
          Your forecast
        </h2>
        <p className="text-lg leading-relaxed text-spert-text dark:text-gray-100">
          {heroLead} there is {heroArticle}{' '}
          <strong className="text-spert-blue">{heroPercent}%</strong> chance{' '}
          {effectiveMilestone
            ? <>{effectiveMilestone.name} will be reached by{' '}</>
            : <>the project will finish by{' '}</>}
          <strong className="text-spert-blue">{heroDate}</strong>.
        </p>
      </section>
    <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-spert-blue rounded-r-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <select
          name="summaryScope"
          value={effectiveScope}
          onChange={(e) => setSelectedScope(e.target.value as ScopeSelection)}
          className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
          aria-label="Scope"
        >
          {scopeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex items-center">
          <select
            name="summaryDistribution"
            value={effectiveDistribution}
            onChange={(e) => setSelectedDistribution(e.target.value as DistributionType)}
            className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
            aria-label="Distribution"
          >
            {distributionOptions.map((dist) => (
              <option key={dist} value={dist}>{DISTRIBUTION_LABELS[dist]}</option>
            ))}
          </select>
          <HelpTooltip
            ariaLabel="About the distribution choices"
            content={
              <>Only Truncated Normal is shown by default. Add more distributions in
                {' '}<strong>Settings → Statistical methods to show</strong>.</>
            }
          />
        </div>
        <select
          name="summaryPercentile"
          value={selectedPercentile}
          onChange={(e) => setSelectedPercentile(Number(e.target.value))}
          className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
          aria-label="Percentile"
        >
          {PERCENTILE_OPTIONS.map((p) => (
            <option key={p} value={p}>P{p}</option>
          ))}
        </select>
        <button
          onClick={handleCopy}
          title="Copy summary as text"
          aria-label="Copy summary as text"
          className="ml-auto bg-transparent border-none cursor-pointer p-1 opacity-50 hover:opacity-100 transition-opacity duration-200"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        </button>
      </div>
      <p className="text-sm text-spert-text dark:text-gray-200 leading-relaxed">
        {summaryText}
      </p>
      <p className="text-xs text-spert-text-muted dark:text-gray-400 mt-1 italic">
        {forecastMode === 'subjective'
          ? 'Based on subjective judgment.'
          : velocityMean || velocityStdDev
            ? 'Based on sprint history with manual overrides.'
            : volatilityMultiplier !== undefined && volatilityMultiplier !== 1
              ? `Based on sprint history (×${volatilityMultiplier} volatility).`
              : 'Based on sprint history.'}
      </p>
      {milestoneTexts.length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-blue-200 dark:border-blue-700">
          {visibleMilestones.map(({ milestone, originalIndex }, visIdx) => {
            if (!milestoneTexts[visIdx]) return null
            // Completed milestones render italic so users can eye-scan the
            // boundary between "what's done" and "what's still ahead."
            const isCompleted = completionInfo[originalIndex]?.completed === true
            return (
              <p
                key={milestone.id}
                className={`text-xs text-spert-text-muted dark:text-gray-400 leading-relaxed${isCompleted ? ' italic' : ''}`}
              >
                <span
                  className="inline-block size-2 rounded-full mr-1.5 align-middle"
                  style={{ backgroundColor: milestone.color }}
                />
                {milestoneTexts[visIdx]}
              </p>
            )
          })}
        </div>
      )}
    </div>
    </>
  )
}
