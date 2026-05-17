// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDateLong, isValidDateRange } from '@/shared/lib/dates'
import { indefiniteArticle } from '@/shared/lib/grammar'
import { useSettingsStore } from '@/shared/state/settings-store'
import type { Milestone, ForecastMode } from '@/shared/types'
import { DISTRIBUTION_LABELS, getVisibleDistributions, type DistributionType } from '../types'
import type { QuadSimulationData } from '../lib/monte-carlo'
import type { MilestoneResults } from '../hooks/useForecastState'
import type { MilestoneCompletionInfo } from '../lib/milestones'
import { PROJECT_SCOPE, type ScopeSelection } from '../lib/scope'
import {
  targetDateToSprintCount,
  calculateDeadlineProbability,
  type SprintAtDate,
  type DeadlineProbabilityResult,
} from '../lib/deadline'

interface DeadlineProbabilityPanelProps {
  targetDate: string
  onTargetDateChange: (date: string) => void
  /** Project-scope sortedSprintsRequired arrays. Caller (ForecastTab) only renders
   *  this panel when results+simulationData are available, so this prop is
   *  non-nullable at the type level. */
  simulationData: QuadSimulationData
  /** Per-milestone results+sim-data. Null when the project has no milestones or
   *  when sim hasn't run yet — milestone scope falls back to the empty state. */
  milestoneResultsState: MilestoneResults | null
  milestones: Milestone[]
  /** 1:1 with `milestones`. Completed milestones are filtered out of the scope picker. */
  milestoneCompletionInfo: MilestoneCompletionInfo[]
  forecastStartDate: string
  sprintCadenceWeeks: number
  completedSprintCount: number
  unitOfMeasure: string
  projectName: string
  remainingBacklog: number
  forecastMode: ForecastMode
}

// Shared label style — matches ForecastForm.tsx labelClass exactly so the panel
// reads as part of the same form-control vocabulary.
const labelClass =
  'flex items-end mb-1 text-sm font-semibold text-spert-text-secondary min-h-[1.75rem]'

/** Narrative routing. Cases 1 + 2 require a non-null `selectedProbability`;
 *  cases 3 + 4 ignore it and display 0% deterministically. */
type NarrativeCase = 'empty' | 'case1' | 'case2' | 'case3' | 'case4'

function determineNarrativeCase(
  targetDate: string,
  forecastStartDate: string,
  sprintAtDate: SprintAtDate | null,
  selectedProbability: number | null,
): NarrativeCase {
  if (!isValidDateRange(targetDate, false)) return 'empty'
  if (!isValidDateRange(forecastStartDate, false)) return 'empty'
  // Resolve cases 3 + 4 BEFORE the probability check — they display 0%
  // regardless of whether simulation data is present for the current scope.
  if (targetDate < forecastStartDate) return 'case3'
  if (!sprintAtDate || sprintAtDate.sprintCount === 0) return 'case4'
  // Cases 1 + 2 require simulation data for the active scope. The milestone-
  // deletion race frame and the "milestone sim not yet computed" frame both
  // land here with selectedProbability === null and fall through to empty.
  if (selectedProbability === null) return 'empty'
  return sprintAtDate.isExactMatch ? 'case1' : 'case2'
}

export function DeadlineProbabilityPanel({
  targetDate,
  onTargetDateChange,
  simulationData,
  milestoneResultsState,
  milestones,
  milestoneCompletionInfo,
  forecastStartDate,
  sprintCadenceWeeks,
  completedSprintCount,
  unitOfMeasure,
  projectName,
  remainingBacklog,
  forecastMode,
}: DeadlineProbabilityPanelProps) {
  // Collapsed by default — same pattern as ForecastResults (v0.31.3) and the
  // other post-results sections (Custom Percentile, charts). One fewer wall of
  // controls on first load.
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedScope, setSelectedScope] = useState<ScopeSelection>(PROJECT_SCOPE)

  const distributionsEnabled = useSettingsStore((s) => s.distributionsEnabled)
  const hasBootstrap = simulationData.bootstrap !== null
  const visibleDistributions = useMemo(
    () => getVisibleDistributions(forecastMode, hasBootstrap, distributionsEnabled),
    [forecastMode, hasBootstrap, distributionsEnabled],
  )

  const [selectedDistribution, setSelectedDistribution] = useState<DistributionType>(
    () => visibleDistributions[0] ?? 'lognormal',
  )

  // Form-control IDs (form-hygiene rule: every <input>/<select> needs an id
  // tied to a <label htmlFor>). useId per ProjectsTab convention so two panels
  // on the same page would not collide.
  const formId = useId()
  const dateInputId = `${formId}-date`
  const scopeSelectId = `${formId}-scope`
  const distSelectId = `${formId}-dist`

  // Drift protection: if Settings changes the enabled distributions while
  // selectedDistribution still references a disabled one, fall back. Inline
  // ternary (not useMemo) — same shape as ForecastSummary.tsx:177-179.
  const effectiveDistribution: DistributionType = visibleDistributions.includes(selectedDistribution)
    ? selectedDistribution
    : (visibleDistributions[0] ?? selectedDistribution)

  // Scope picker options: only NOT-yet-completed milestones. Completed
  // milestones contribute zero remaining work — showing them in the inverse
  // query would render a probability identical to the preceding milestone
  // under a misleading label (the same problem v0.32.1 fixed for chart
  // dropdowns). Same filter as ForecastSummary's scope picker.
  const scopeOptions = useMemo(
    () =>
      milestones
        .map((m, idx) => ({ id: m.id, name: m.name, idx }))
        .filter(({ idx }) => !milestoneCompletionInfo[idx]?.completed),
    [milestones, milestoneCompletionInfo],
  )

  // Effective scope drift protection: if the user previously selected a
  // milestone that has since been completed or deleted, fall back to
  // "Entire Project". Memoized — depends on scopeOptions identity.
  const effectiveScope: ScopeSelection = useMemo(() => {
    if (selectedScope === PROJECT_SCOPE) return PROJECT_SCOPE
    return scopeOptions.some((o) => o.id === selectedScope) ? selectedScope : PROJECT_SCOPE
  }, [selectedScope, scopeOptions])

  // Resolve milestone index for the effective scope (or -1 for project scope).
  const milestoneIdx = useMemo(() => {
    if (effectiveScope === PROJECT_SCOPE) return -1
    return milestones.findIndex((m) => m.id === effectiveScope)
  }, [effectiveScope, milestones])

  // Per-distribution sortedSprintsRequired arrays for the active scope.
  // Project-scope reads from `simulationData` directly; milestone-scope reads
  // from `milestoneResultsState.milestoneSimulationData[milestoneIdx]`.
  //
  // Staleness note: these arrays only update on Run Forecast. The panel reads
  // them as-is, matching PercentileSelector and ForecastSummary's behavior —
  // the date input is reactive but the underlying distribution is not.
  const activeSortedData = useMemo((): Partial<Record<DistributionType, number[]>> => {
    if (effectiveScope === PROJECT_SCOPE) {
      return {
        truncatedNormal: simulationData.truncatedNormal,
        lognormal: simulationData.lognormal,
        gamma: simulationData.gamma,
        bootstrap: simulationData.bootstrap ?? undefined,
        triangular: simulationData.triangular,
        uniform: simulationData.uniform,
      }
    }
    if (milestoneIdx < 0) return {}
    const msData = milestoneResultsState?.milestoneSimulationData[milestoneIdx]
    if (!msData) return {}
    return {
      truncatedNormal: msData.truncatedNormal,
      lognormal: msData.lognormal,
      gamma: msData.gamma,
      bootstrap: msData.bootstrap ?? undefined,
      triangular: msData.triangular,
      uniform: msData.uniform,
    }
  }, [effectiveScope, simulationData, milestoneResultsState, milestoneIdx])

  const sprintAtDate = useMemo((): SprintAtDate | null => {
    if (!isValidDateRange(targetDate, false)) return null
    if (!isValidDateRange(forecastStartDate, false)) return null
    return targetDateToSprintCount(targetDate, forecastStartDate, sprintCadenceWeeks)
  }, [targetDate, forecastStartDate, sprintCadenceWeeks])

  const perDistributionProbabilities = useMemo((): Partial<
    Record<DistributionType, DeadlineProbabilityResult>
  > => {
    if (!sprintAtDate) return {}
    const result: Partial<Record<DistributionType, DeadlineProbabilityResult>> = {}
    for (const dist of visibleDistributions) {
      const sorted = activeSortedData[dist]
      if (sorted) {
        result[dist] = calculateDeadlineProbability(sorted, sprintAtDate.sprintCount)
      }
    }
    return result
  }, [sprintAtDate, visibleDistributions, activeSortedData])

  // Cap footnote is shown when ANY distribution capped — not just the selected
  // one — because the footnote explains a property of the methodology, not of
  // one column. If the user switches distributions and the cap suddenly
  // disappears from a non-displayed column, the footnote remains accurate as
  // long as some column in the table is capped.
  const anyWasCapped = useMemo(
    () => Object.values(perDistributionProbabilities).some((r) => r?.wasCapped),
    [perDistributionProbabilities],
  )

  const selectedProbability =
    perDistributionProbabilities[effectiveDistribution]?.value ?? null

  // Backlog clause is only used in project-scope narrative — milestone scope
  // doesn't mention units/backlog (matching the hero callout pattern).
  const backlogForScope =
    effectiveScope === PROJECT_SCOPE
      ? remainingBacklog
      : (milestones[milestoneIdx]?.backlogSize ?? 0)

  const displayName = projectName || 'the project'
  // Belt-and-suspenders fallback. The expected guard for "milestone disappeared
  // mid-render" is the determineNarrativeCase routing to 'empty' via
  // selectedProbability === null; this default is paranoid defense so the JSX
  // never interpolates undefined into the prose if the indexing ever lands
  // somewhere unexpected.
  const milestoneName =
    milestoneIdx >= 0 ? milestones[milestoneIdx]?.name || 'the milestone' : 'the milestone'

  const narrativeCase = determineNarrativeCase(
    targetDate,
    forecastStartDate,
    sprintAtDate,
    selectedProbability,
  )

  // Absolute sprint number for display. Hero callout shows date only; this
  // panel shows sprint inline because the sprint-quantization step is the
  // panel's *whole point* — hiding it would mislead.
  const absoluteSprint = sprintAtDate ? sprintAtDate.sprintCount + completedSprintCount : 0
  // For case 4 only: "the first forecast sprint" displays as the sprint
  // immediately following completedSprintCount.
  const firstForecastAbsoluteSprint = 1 + completedSprintCount

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="deadline-probability-panel"
      >
        <span
          className={cn(
            'inline-block text-[10px] text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90',
          )}
          aria-hidden="true"
        >
          ▶
        </span>
        <h3 className="text-sm font-medium text-muted-foreground">Deadline Probability</h3>
      </button>

      {isExpanded && (
        <div id="deadline-probability-panel" className="px-4 pb-4 space-y-4">
          {/* Control row */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[170px]">
              <label htmlFor={dateInputId} className={labelClass}>
                Target Date
              </label>
              <input
                id={dateInputId}
                name="targetDate"
                type="date"
                value={targetDate}
                min={forecastStartDate}
                max="2050-12-31"
                aria-invalid={
                  targetDate !== '' && !isValidDateRange(targetDate, false) ? 'true' : undefined
                }
                onChange={(e) => onTargetDateChange(e.target.value)}
                className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div className="min-w-[160px]">
              <label htmlFor={scopeSelectId} className={labelClass}>
                Scope
              </label>
              <select
                id={scopeSelectId}
                name="deadlineScope"
                value={effectiveScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
              >
                <option value={PROJECT_SCOPE}>Entire Project</option>
                {scopeOptions.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[160px]">
              <label htmlFor={distSelectId} className={labelClass}>
                Distribution
              </label>
              <select
                id={distSelectId}
                name="deadlineDistribution"
                value={effectiveDistribution}
                onChange={(e) => setSelectedDistribution(e.target.value as DistributionType)}
                className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
              >
                {visibleDistributions.map((d) => (
                  <option key={d} value={d}>
                    {DISTRIBUTION_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Narrative */}
          {narrativeCase === 'empty' && (
            <p className="text-sm text-muted-foreground italic">
              Enter a target date to see the probability of completing by that date.
            </p>
          )}

          {narrativeCase === 'case1' && effectiveScope === PROJECT_SCOPE && (
            <p aria-live="polite" className="text-sm text-spert-text dark:text-gray-100 leading-relaxed">
              There is{' '}
              <strong>
                {indefiniteArticle(selectedProbability!)} {selectedProbability!}%
              </strong>{' '}
              probability that <strong>{displayName}</strong> will finish the{' '}
              {backlogForScope.toLocaleString()} {unitOfMeasure} backlog by{' '}
              <strong>{formatDateLong(sprintAtDate!.sprintFinishDate)}</strong> (Sprint{' '}
              {absoluteSprint}).
            </p>
          )}

          {narrativeCase === 'case2' && effectiveScope === PROJECT_SCOPE && (
            <p aria-live="polite" className="text-sm text-spert-text dark:text-gray-100 leading-relaxed">
              There is{' '}
              <strong>
                {indefiniteArticle(selectedProbability!)} {selectedProbability!}%
              </strong>{' '}
              probability that <strong>{displayName}</strong> will finish the{' '}
              {backlogForScope.toLocaleString()} {unitOfMeasure} backlog by{' '}
              <strong>{formatDateLong(sprintAtDate!.sprintFinishDate)}</strong> (Sprint{' '}
              {absoluteSprint}), which is before your{' '}
              <strong>{formatDateLong(targetDate)}</strong> target.
            </p>
          )}

          {narrativeCase === 'case1' && effectiveScope !== PROJECT_SCOPE && (
            <p aria-live="polite" className="text-sm text-spert-text dark:text-gray-100 leading-relaxed">
              There is{' '}
              <strong>
                {indefiniteArticle(selectedProbability!)} {selectedProbability!}%
              </strong>{' '}
              probability that <strong>{milestoneName}</strong> will be reached by{' '}
              <strong>{formatDateLong(sprintAtDate!.sprintFinishDate)}</strong> (Sprint{' '}
              {absoluteSprint}).
            </p>
          )}

          {narrativeCase === 'case2' && effectiveScope !== PROJECT_SCOPE && (
            <p aria-live="polite" className="text-sm text-spert-text dark:text-gray-100 leading-relaxed">
              There is{' '}
              <strong>
                {indefiniteArticle(selectedProbability!)} {selectedProbability!}%
              </strong>{' '}
              probability that <strong>{milestoneName}</strong> will be reached by{' '}
              <strong>{formatDateLong(sprintAtDate!.sprintFinishDate)}</strong> (Sprint{' '}
              {absoluteSprint}), which is before your{' '}
              <strong>{formatDateLong(targetDate)}</strong> target.
            </p>
          )}

          {narrativeCase === 'case3' && (
            <p aria-live="polite" className="text-sm text-spert-text dark:text-gray-100 leading-relaxed">
              Your <strong>{formatDateLong(targetDate)}</strong> target falls before the
              forecast window begins. Probability: <strong>0%</strong>.
            </p>
          )}

          {narrativeCase === 'case4' && (
            <p aria-live="polite" className="text-sm text-spert-text dark:text-gray-100 leading-relaxed">
              Your <strong>{formatDateLong(targetDate)}</strong> target falls within Sprint{' '}
              {firstForecastAbsoluteSprint} (the first forecast sprint), before any sprint can
              complete. Probability: <strong>0%</strong>.
            </p>
          )}

          {/* Per-distribution probability table — only for cases 1 + 2 */}
          {(narrativeCase === 'case1' || narrativeCase === 'case2') && (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {visibleDistributions.map((d) => (
                    <col key={d} style={{ width: '6rem' }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {visibleDistributions.map((d) => (
                      <th
                        key={d}
                        scope="col"
                        className="text-left px-2 py-1 font-medium text-spert-text-secondary dark:text-gray-300 border-b border-spert-border dark:border-gray-700"
                      >
                        {DISTRIBUTION_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {visibleDistributions.map((d) => {
                      const r = perDistributionProbabilities[d]
                      return (
                        <td
                          key={d}
                          className="px-2 py-1 text-spert-text dark:text-gray-100"
                        >
                          {r ? `${r.value}%` : '—'}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Footnotes */}
          {(narrativeCase === 'case1' || narrativeCase === 'case2') && (
            <p className="text-xs text-spert-text-muted dark:text-gray-400 italic">
              Probability is computed at the end of Sprint {absoluteSprint} (
              {formatDateLong(sprintAtDate!.sprintFinishDate)}), the last complete sprint on or
              before your target.
            </p>
          )}

          {anyWasCapped && (
            <p className="text-xs text-spert-text-muted dark:text-gray-400 italic">
              Forecast caps probability at 99% — no completion date can be predicted with
              complete certainty.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
