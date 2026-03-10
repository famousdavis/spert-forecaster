// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { calculatePercentileResult, type PercentileResults, type QuadResults, type QuadSimulationData } from '../lib/monte-carlo'
import type { MilestoneResults } from '../hooks/useForecastState'
import { formatDateLong } from '@/shared/lib/dates'
import type { Milestone, ForecastMode } from '@/shared/types'
import { type DistributionType, DISTRIBUTION_LABELS, getVisibleDistributions } from '../types'

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
  cumulativeThresholds?: number[]
  hasBootstrap: boolean
  forecastMode: ForecastMode
  modelScopeGrowth?: boolean
  scopeGrowthMode?: 'calculated' | 'custom'
  scopeGrowthPerSprint?: number
  velocityMean?: string
  velocityStdDev?: string
  volatilityMultiplier?: number
}

const PERCENTILE_OPTIONS = [50, 60, 70, 80, 85, 90, 95] as const

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
  scopeGrowthMode?: 'calculated' | 'custom'
): string {
  const absoluteSprint = sprintsRequired + completedSprintCount
  let text = `Using the ${distributionLabel} distribution, there is a ${percentile}% chance that ${projectName} will finish the ${backlog.toLocaleString()} ${unitOfMeasure} backlog by Sprint ${absoluteSprint} (${formatDateLong(finishDate)}).`
  if (modelScopeGrowth && scopeGrowthPerSprint !== undefined) {
    const sign = scopeGrowthPerSprint > 0 ? '+' : ''
    const source = scopeGrowthMode === 'custom' ? 'custom' : 'calculated'
    text += ` Scope growth of ${sign}${scopeGrowthPerSprint.toFixed(1)} ${unitOfMeasure}/sprint is modeled (${source}).`
  }
  return text
}

export function buildMilestoneSummaryText(
  milestoneName: string,
  sprintsRequired: number,
  finishDate: string,
  completedSprintCount: number
): string {
  const absoluteSprint = sprintsRequired + completedSprintCount
  return `${milestoneName}: Sprint ${absoluteSprint} (${formatDateLong(finishDate)})`
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
  cumulativeThresholds = [],
  hasBootstrap,
  forecastMode,
  modelScopeGrowth,
  scopeGrowthMode,
  scopeGrowthPerSprint,
  velocityMean,
  velocityStdDev,
  volatilityMultiplier,
}: ForecastSummaryProps) {
  const [selectedDistribution, setSelectedDistribution] = useState<DistributionType>('truncatedNormal')
  const [selectedPercentile, setSelectedPercentile] = useState(80)

  const distributionOptions = useMemo(
    () => getVisibleDistributions(forecastMode, hasBootstrap),
    [hasBootstrap, forecastMode]
  )

  // Get the result for the selected distribution and percentile
  const selectedResult = useMemo(() => {
    const distResults = results[selectedDistribution]
    const distSimData = simulationData[selectedDistribution]
    if (!distResults || !distSimData) return null
    return getResultForPercentile(distResults, distSimData, selectedPercentile, startDate, sprintCadenceWeeks)
  }, [results, simulationData, selectedDistribution, selectedPercentile, startDate, sprintCadenceWeeks])

  const summaryText = useMemo(() => {
    if (!selectedResult) return ''
    return buildSummaryText(
      projectName,
      remainingBacklog,
      unitOfMeasure,
      selectedPercentile,
      selectedResult.sprintsRequired,
      selectedResult.finishDate,
      completedSprintCount,
      DISTRIBUTION_LABELS[selectedDistribution],
      modelScopeGrowth,
      scopeGrowthPerSprint,
      scopeGrowthMode
    )
  }, [selectedResult, projectName, remainingBacklog, unitOfMeasure, selectedPercentile, completedSprintCount, selectedDistribution, modelScopeGrowth, scopeGrowthPerSprint, scopeGrowthMode])

  const visibleMilestones = useMemo(
    () => milestones
      .map((m, idx) => ({ milestone: m, originalIndex: idx }))
      .filter(({ milestone: m }) => m.showOnChart !== false),
    [milestones]
  )

  const milestoneTexts = useMemo(() => {
    if (!milestoneResultsState || visibleMilestones.length === 0) return []
    return visibleMilestones.map(({ milestone, originalIndex }) => {
      const msResults = milestoneResultsState.milestoneResults[originalIndex]
      const msSimData = milestoneResultsState.milestoneSimulationData[originalIndex]
      if (!msResults || !msSimData) return null
      const distResults = msResults[selectedDistribution]
      const distSimData = msSimData[selectedDistribution]
      if (!distResults || !distSimData) return null
      const result = getResultForPercentile(distResults, distSimData, selectedPercentile, startDate, sprintCadenceWeeks)
      return buildMilestoneSummaryText(
        milestone.name,
        result.sprintsRequired,
        result.finishDate,
        completedSprintCount
      )
    }).filter(Boolean) as string[]
  }, [milestoneResultsState, visibleMilestones, selectedDistribution, selectedPercentile, startDate, sprintCadenceWeeks, completedSprintCount])

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

  return (
    <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-spert-blue rounded-r-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <select
          value={selectedDistribution}
          onChange={(e) => setSelectedDistribution(e.target.value as DistributionType)}
          className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
          aria-label="Distribution"
        >
          {distributionOptions.map((dist) => (
            <option key={dist} value={dist}>{DISTRIBUTION_LABELS[dist]}</option>
          ))}
        </select>
        <select
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
          {visibleMilestones.map(({ milestone }, visIdx) => {
            if (!milestoneTexts[visIdx]) return null
            return (
              <p key={milestone.id} className="text-xs text-spert-text-muted dark:text-gray-400 leading-relaxed">
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
  )
}
