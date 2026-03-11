// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import type { QuadResults, QuadSimulationData } from '../lib/monte-carlo'
import type { MilestoneResults } from '../hooks/useForecastState'
import type { Milestone, ForecastMode } from '@/shared/types'
import { SELECTABLE_PERCENTILES } from '../constants'
import { ReportButton } from './ReportButton'
import { CopyImageButton } from '@/shared/components/CopyImageButton'
import {
  ResultsTable,
  getDistributionColumns,
  buildDynamicPercentileRows,
  buildPercentileRows,
} from './ResultsTable'

interface ForecastResultsProps {
  results: QuadResults
  forecastMode: ForecastMode
  completedSprintCount: number
  onExport?: () => void
  milestones?: Milestone[]
  milestoneResultsState?: MilestoneResults | null
  cumulativeThresholds?: number[]
  unitOfMeasure?: string
  effectiveMean?: number
  effectiveStdDev?: number
  velocityMean?: string
  velocityStdDev?: string
  selectedCV?: number
  volatilityMultiplier?: number
  // Dynamic percentile props
  simulationData?: QuadSimulationData | null
  selectedPercentiles?: number[]
  onSelectedPercentilesChange?: (percentiles: number[]) => void
  startDate?: string
  sprintCadenceWeeks?: number
  // Report generation props
  forecastResultsRef?: RefObject<HTMLDivElement | null>
  burnUpChartRef?: RefObject<HTMLDivElement | null>
  distributionChartRef?: RefObject<HTMLDivElement | null>
  histogramChartRef?: RefObject<HTMLDivElement | null>
  projectName?: string
  summaryText?: string
}

function PercentileChips({
  selectedPercentiles,
  onToggle,
}: {
  selectedPercentiles: number[]
  onToggle: (p: number) => void
}) {
  return (
    <div className="copy-image-button flex flex-wrap gap-1.5">
      {SELECTABLE_PERCENTILES.map((p) => {
        const isSelected = selectedPercentiles.includes(p)
        return (
          <button
            key={p}
            type="button"
            onClick={() => onToggle(p)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full border cursor-pointer transition-colors duration-150',
              isSelected
                ? 'bg-spert-blue text-white border-spert-blue'
                : 'bg-transparent text-muted-foreground border-spert-border dark:border-gray-600 hover:border-spert-blue hover:text-spert-blue'
            )}
          >
            P{p}
          </button>
        )
      })}
    </div>
  )
}

function round1(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(1)
}

function buildModeContext(
  forecastMode: ForecastMode,
  effectiveMean?: number,
  effectiveStdDev?: number,
  velocityMean?: string,
  velocityStdDev?: string,
  selectedCV?: number,
  volatilityMultiplier?: number,
): React.ReactNode | null {
  if (effectiveMean === undefined || effectiveStdDev === undefined) return null

  const mean = round1(effectiveMean)
  const sd = round1(effectiveStdDev)

  if (forecastMode === 'subjective') {
    const cvPct = selectedCV !== undefined ? Math.round(selectedCV * 100) : 25
    return (
      <>
        Forecast based on subjective estimate: mean <strong>{mean}</strong>,
        CV <strong>{cvPct}%</strong> → SD <strong>{sd}</strong>.
      </>
    )
  }

  const hasOverrides = !!(velocityMean || velocityStdDev)

  if (hasOverrides) {
    return (
      <>
        Forecast based on sprint history with manual overrides: mean <strong>{mean}</strong>,
        SD <strong>{sd}</strong>.
      </>
    )
  }

  const showMultiplier = volatilityMultiplier !== undefined && volatilityMultiplier !== 1

  return (
    <>
      Forecast based on sprint history: mean <strong>{mean}</strong>,
      SD <strong>{sd}</strong>
      {showMultiplier && <> (×{volatilityMultiplier} volatility)</>}.
    </>
  )
}

export function ForecastResults({
  results,
  forecastMode,
  completedSprintCount,
  onExport,
  milestones = [],
  milestoneResultsState,
  cumulativeThresholds = [],
  unitOfMeasure = '',
  effectiveMean,
  effectiveStdDev,
  velocityMean,
  velocityStdDev,
  selectedCV,
  volatilityMultiplier,
  simulationData,
  selectedPercentiles,
  onSelectedPercentilesChange,
  startDate,
  sprintCadenceWeeks,
  forecastResultsRef,
  burnUpChartRef,
  distributionChartRef,
  histogramChartRef,
  projectName,
  summaryText,
}: ForecastResultsProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const hasBootstrap = results.bootstrap !== null
  const modeContext = buildModeContext(forecastMode, effectiveMean, effectiveStdDev, velocityMean, velocityStdDev, selectedCV, volatilityMultiplier)
  const columns = getDistributionColumns(forecastMode, hasBootstrap)
  const visibleMilestones = useMemo(
    () => milestones
      .map((m, idx) => ({ milestone: m, originalIndex: idx }))
      .filter(({ milestone: m }) => m.showOnChart !== false),
    [milestones]
  )

  const hasMilestones = visibleMilestones.length > 0 && milestoneResultsState && milestoneResultsState.milestoneResults.length > 0

  // Dynamic percentile mode: we have simulation data and user-selectable percentiles
  const useDynamic = !!(simulationData && selectedPercentiles && startDate && sprintCadenceWeeks)

  const handleTogglePercentile = (p: number) => {
    if (!selectedPercentiles || !onSelectedPercentilesChange) return
    const isSelected = selectedPercentiles.includes(p)
    if (isSelected) {
      // Don't allow deselecting the last one
      if (selectedPercentiles.length <= 1) return
      onSelectedPercentilesChange(selectedPercentiles.filter((v) => v !== p))
    } else {
      onSelectedPercentilesChange([...selectedPercentiles, p].sort((a, b) => a - b))
    }
  }

  const buildRows = (resultsForRows: QuadResults, simDataForRows?: QuadSimulationData | null) => {
    if (useDynamic && simDataForRows) {
      return buildDynamicPercentileRows(simDataForRows, selectedPercentiles!, columns, startDate!, sprintCadenceWeeks!)
    }
    return buildPercentileRows(resultsForRows, columns)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 font-medium dark:text-gray-100 cursor-pointer bg-transparent border-none p-0 text-inherit text-base"
        >
          <span
            className={cn(
              'inline-block text-xs transition-transform duration-200',
              isExpanded ? 'rotate-90' : 'rotate-0'
            )}
          >
            ▶
          </span>
          Forecast Results
        </button>
        {isExpanded && (
          <div className="copy-image-button flex items-center gap-1">
            {forecastResultsRef && projectName && summaryText && (
              <ReportButton
                forecastResultsRef={forecastResultsRef}
                burnUpChartRef={burnUpChartRef}
                distributionChartRef={distributionChartRef}
                histogramChartRef={histogramChartRef}
                projectName={projectName}
                summaryText={summaryText}
              />
            )}
            {onExport && (
              <button
                onClick={onExport}
                title="Export simulation data to CSV"
                aria-label="Export simulation data to CSV"
                className="bg-transparent border-none cursor-pointer p-1 opacity-50 hover:opacity-100 transition-opacity duration-200 shrink-0"
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
            {forecastResultsRef && (
              <CopyImageButton
                targetRef={forecastResultsRef}
                title="Copy results as image"
              />
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {/* Percentile toggle chips */}
          {useDynamic && onSelectedPercentilesChange && (
            <PercentileChips
              selectedPercentiles={selectedPercentiles!}
              onToggle={handleTogglePercentile}
            />
          )}

          {hasMilestones ? (
            <div className="space-y-6">
              {visibleMilestones.map(({ milestone, originalIndex }, visIdx) => {
                const milestoneResult = milestoneResultsState.milestoneResults[originalIndex]
                if (!milestoneResult) return null

                const milestoneSimData = milestoneResultsState.milestoneSimulationData?.[originalIndex] ?? null
                const isLast = visIdx === visibleMilestones.length - 1
                const cumulativeBacklog = cumulativeThresholds[originalIndex] ?? 0
                const rows = buildRows(milestoneResult as QuadResults, milestoneSimData)

                return (
                  <div key={milestone.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ backgroundColor: milestone.color }}
                      />
                      <h4 className="text-sm font-semibold dark:text-gray-100">
                        {milestone.name}
                        <span className="ml-2 font-normal text-spert-text-muted">
                          ({milestone.backlogSize.toLocaleString()} {unitOfMeasure} remaining
                          {!isLast && ` \u2022 ${cumulativeBacklog.toLocaleString()} cumulative`})
                        </span>
                        {isLast && (
                          <span className="ml-2 text-xs font-normal text-spert-text-muted italic">
                            Total
                          </span>
                        )}
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <ResultsTable
                        rows={rows}
                        columns={columns}
                        completedSprintCount={completedSprintCount}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <ResultsTable
                rows={buildRows(results, simulationData)}
                columns={columns}
                completedSprintCount={completedSprintCount}
              />
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            {modeContext && <p>{modeContext}</p>}
            <p>
              P<em>X</em> means there is an <em>X</em>% chance of finishing by that date <em>or sooner</em>. Higher
              percentiles are more conservative.
            </p>
            <p>
              {forecastMode === 'subjective' ? (
                <>
                  <strong>T-Normal</strong>: symmetric, bounded at zero.{' '}
                  <strong>Lognorm</strong>: right-skewed.{' '}
                  <strong>Gamma</strong>: flexible shape.{' '}
                  <strong>Triangular</strong>: peak at estimate.{' '}
                  <strong>Uniform</strong>: equal probability across range.
                </>
              ) : (
                <>
                  <strong>T-Normal</strong>: symmetric, bounded at zero.{' '}
                  <strong>Lognorm</strong>: right-skewed.{' '}
                  <strong>Gamma</strong>: flexible shape.{' '}
                  <strong>Triangular</strong>: peak at mean.
                  {hasBootstrap && (
                    <>
                      {' '}<strong>Bootstrap</strong>: samples from actual sprint history (#NoEstimates).
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
