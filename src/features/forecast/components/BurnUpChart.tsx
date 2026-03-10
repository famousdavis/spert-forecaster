// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import type { Sprint, Milestone } from '@/shared/types'
import type { QuadSimulationData } from '../lib/monte-carlo'
import type { BurnUpConfig, ChartFontSize } from '../types'
import { CHART_FONT_SIZES } from '../types'
import { calculateBurnUpData, isBootstrapAvailable } from '../lib/burn-up'
import { BurnUpConfigUI } from './BurnUpConfig'
import { BurnUpChartCanvas } from './BurnUpChartCanvas'

interface BurnUpChartProps {
  sprints: Sprint[]
  forecastBacklog: number
  simulationData: QuadSimulationData
  sprintCadenceWeeks: number
  firstSprintStartDate: string
  completedSprintCount: number
  productivityFactors?: number[]
  config: BurnUpConfig
  onConfigChange: (config: BurnUpConfig) => void
  chartRef?: RefObject<HTMLDivElement | null>
  fontSize?: ChartFontSize
  onFontSizeChange?: (size: ChartFontSize) => void
  milestones?: Milestone[]
  cumulativeThresholds?: number[]
}

export function BurnUpChart({
  sprints,
  forecastBacklog,
  simulationData,
  sprintCadenceWeeks,
  firstSprintStartDate,
  completedSprintCount,
  config,
  onConfigChange,
  chartRef,
  fontSize = 'small',
  onFontSizeChange,
  milestones = [],
  cumulativeThresholds = [],
}: BurnUpChartProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const fontSizes = CHART_FONT_SIZES[fontSize]

  const hasBootstrap = isBootstrapAvailable(simulationData)

  // Compute total done for milestone reference line positioning
  const totalDone = useMemo(
    () => sprints.reduce((sum, s) => sum + s.doneValue, 0),
    [sprints]
  )

  // Scope line uses the user-entered backlog directly — milestones are independent reference lines

  // Milestone reference lines on Y-axis — show all visible milestones
  const milestoneRefLines = useMemo(() => {
    if (milestones.length === 0 || cumulativeThresholds.length === 0) return []
    return milestones
      .filter((m) => m.showOnChart !== false)
      .map((m) => {
        const idx = milestones.indexOf(m)
        return {
          id: m.id,
          name: m.name,
          color: m.color,
          yValue: totalDone + cumulativeThresholds[idx],
        }
      })
  }, [milestones, cumulativeThresholds, totalDone])

  const chartData = useMemo(
    () =>
      calculateBurnUpData({
        sprints,
        forecastBacklog,
        simulationData,
        config,
        sprintCadenceWeeks,
        firstSprintStartDate,
        completedSprintCount,
      }),
    [sprints, forecastBacklog, simulationData, config, sprintCadenceWeeks, firstSprintStartDate, completedSprintCount]
  )

  // Calculate Y-axis domain based on data
  const yAxisMax = useMemo(() => {
    let max = 0
    for (const point of chartData) {
      max = Math.max(max, point.backlog)
      if (point.cumulativeDone !== null) max = Math.max(max, point.cumulativeDone)
      if (point.line1 !== undefined) max = Math.max(max, point.line1)
      if (point.line2 !== undefined) max = Math.max(max, point.line2)
      if (point.line3 !== undefined) max = Math.max(max, point.line3)
    }
    return Math.ceil(max * 1.1)
  }, [chartData])

  const panelId = 'burn-up-chart-panel'

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label="Burn-Up Chart"
      >
        <span
          className={cn(
            'inline-block text-[10px] text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
          aria-hidden="true"
        >
          ▶
        </span>
        <h3 className="text-sm font-medium text-muted-foreground">Burn-Up Chart</h3>
      </button>

      {isExpanded && (
        <div id={panelId} role="region" aria-label="Burn-Up Chart" className="px-4 pb-4">
          <BurnUpConfigUI
            config={config}
            hasBootstrap={hasBootstrap}
            onChange={onConfigChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
            chartRef={chartRef}
          />

          <div ref={chartRef} className="bg-white dark:bg-gray-800 p-2">
            <p className="text-xs text-muted-foreground mb-4">
              Shows cumulative work completed (Done) vs total product scope (Scope). Forecast lines
              show projected completion at different confidence levels.
            </p>
            <BurnUpChartCanvas
              chartData={chartData}
              config={config}
              yAxisMax={yAxisMax}
              milestoneRefLines={milestoneRefLines}
              fontSizes={fontSizes}
            />
          </div>
        </div>
      )}
    </div>
  )
}
