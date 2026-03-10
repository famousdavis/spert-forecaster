// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { CopyImageButton } from '@/shared/components/CopyImageButton'
import { COLORS } from '@/shared/lib/colors'
import { type ChartFontSize, CHART_FONT_SIZES } from '../types'
import { mergeDistributions } from '../lib/cdf'
import type { Milestone, ForecastMode } from '@/shared/types'
import { ChartToolbar } from './ChartToolbar'

interface DistributionChartProps {
  truncatedNormal: number[]
  lognormal: number[]
  gamma: number[]
  bootstrap: number[] | null
  triangular: number[]
  uniform: number[]
  forecastMode: ForecastMode
  customPercentile: number
  startDate: string
  sprintCadenceWeeks: number
  completedSprintCount: number
  chartRef?: RefObject<HTMLDivElement | null>
  fontSize?: ChartFontSize
  onFontSizeChange?: (size: ChartFontSize) => void
  milestones?: Milestone[]
  selectedMilestoneIndex?: number
  onMilestoneIndexChange?: (index: number) => void
}

const CHART_COLORS = COLORS.chart

export function DistributionChart({
  truncatedNormal,
  lognormal,
  gamma,
  bootstrap,
  triangular,
  uniform,
  forecastMode,
  customPercentile,
  startDate,
  sprintCadenceWeeks,
  completedSprintCount,
  chartRef,
  fontSize = 'small',
  onFontSizeChange,
  milestones = [],
  selectedMilestoneIndex = 0,
  onMilestoneIndexChange,
}: DistributionChartProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const fontSizes = CHART_FONT_SIZES[fontSize]
  const isSubjective = forecastMode === 'subjective'

  const chartData = useMemo(
    () => mergeDistributions(truncatedNormal, lognormal, gamma, bootstrap, startDate, sprintCadenceWeeks, triangular, uniform),
    [truncatedNormal, lognormal, gamma, bootstrap, triangular, uniform, startDate, sprintCadenceWeeks]
  )

  const hasBootstrap = bootstrap !== null

  // Build a map of sprints -> dateLabel for the tooltip
  const sprintToDate = useMemo(() => {
    const map = new Map<number, string>()
    chartData.forEach(point => map.set(point.sprints, point.dateLabel))
    return map
  }, [chartData])

  const panelId = 'cdf-chart-panel'

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label="Cumulative Probability Distribution"
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
        <h3 className="text-sm font-medium text-muted-foreground">
          Cumulative Probability Distribution
        </h3>
      </button>

      {isExpanded && (
        <div id={panelId} role="region" aria-label="Cumulative Probability Distribution" className="px-4 pb-4 relative">
          <ChartToolbar
            idPrefix="cdf"
            milestones={milestones}
            selectedMilestoneIndex={selectedMilestoneIndex}
            onMilestoneIndexChange={onMilestoneIndexChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />

          <div ref={chartRef} className="bg-white dark:bg-gray-800 p-2">
            <p className="text-xs text-muted-foreground mb-4">
              Shows the probability of completing the backlog within a given number of sprints.
              The dashed line marks your selected P{customPercentile} confidence level.
            </p>
            <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border.light} />
              <XAxis
                dataKey="sprints"
                tick={(props) => {
                  const { x, y, payload } = props
                  const dateLabel = sprintToDate.get(payload.value) || ''
                  const absoluteSprint = payload.value + completedSprintCount
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={fontSizes.axisTick} fill={COLORS.text.muted}>
                        {absoluteSprint}
                      </text>
                      <text x={0} y={0} dy={26} textAnchor="middle" fontSize={fontSizes.dateLabel} fill={COLORS.text.light}>
                        {dateLabel}
                      </text>
                    </g>
                  )
                }}
                tickLine={{ transform: 'translate(0, 0)' }}
                axisLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                label={{ value: 'Probability (%)', angle: -90, position: 'insideLeft', fontSize: fontSizes.axisLabel }}
                tick={{ fontSize: fontSizes.axisTick }}
              />
              <Tooltip
                formatter={(value) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value, '']}
                labelFormatter={(sprints) => {
                  const dateLabel = sprintToDate.get(sprints as number) || ''
                  const absoluteSprint = (sprints as number) + completedSprintCount
                  return `Sprint ${absoluteSprint} (${dateLabel})`
                }}
                contentStyle={{ fontSize: fontSizes.axisTick }}
              />
              <Legend
                wrapperStyle={{ fontSize: fontSizes.legend, paddingTop: 20 }}
                verticalAlign="bottom"
              />
              <ReferenceLine
                y={customPercentile}
                stroke={COLORS.text.muted}
                strokeDasharray="5 5"
                label={{ value: `P${customPercentile}`, position: 'right', fontSize: fontSizes.axisTick }}
              />
              <Line
                type="stepAfter"
                dataKey="tNormal"
                name="T-Normal"
                stroke={CHART_COLORS.tNormal}
                dot={false}
                strokeWidth={2.5}
              />
              <Line
                type="stepAfter"
                dataKey="lognormal"
                name="Lognorm"
                stroke={CHART_COLORS.lognormal}
                dot={false}
                strokeWidth={2.5}
              />
              <Line
                type="stepAfter"
                dataKey="gamma"
                name="Gamma"
                stroke={CHART_COLORS.gamma}
                dot={false}
                strokeWidth={2.5}
              />
              {!isSubjective && hasBootstrap && (
                <Line
                  type="stepAfter"
                  dataKey="bootstrap"
                  name="Bootstrap"
                  stroke={CHART_COLORS.bootstrap}
                  dot={false}
                  strokeWidth={2.5}
                />
              )}
              <Line
                type="stepAfter"
                dataKey="triangular"
                name="Triangular"
                stroke={CHART_COLORS.triangular}
                dot={false}
                strokeWidth={2.5}
              />
              {isSubjective && (
                <Line
                  type="stepAfter"
                  dataKey="uniform"
                  name="Uniform"
                  stroke={CHART_COLORS.uniform}
                  dot={false}
                  strokeWidth={2.5}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>
          {chartRef && (
            <div className="absolute top-2 right-2">
              <CopyImageButton
                targetRef={chartRef}
                title="Copy chart as image"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
