// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CopyImageButton } from '@/shared/components/CopyImageButton'
import { COLORS } from '@/shared/lib/colors'
import { type ChartFontSize, CHART_FONT_SIZES } from '../types'
import { buildHistogramBins } from '../lib/cdf'
import type { Milestone, ForecastMode } from '@/shared/types'
import { ChartToolbar } from './ChartToolbar'

interface HistogramChartProps {
  truncatedNormal: number[]
  lognormal: number[]
  gamma: number[]
  bootstrap: number[] | null
  triangular: number[]
  uniform: number[]
  forecastMode: ForecastMode
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

export function HistogramChart({
  truncatedNormal,
  lognormal,
  gamma,
  bootstrap,
  triangular,
  uniform,
  forecastMode,
  startDate,
  sprintCadenceWeeks,
  completedSprintCount,
  chartRef,
  fontSize = 'small',
  onFontSizeChange,
  milestones = [],
  selectedMilestoneIndex = 0,
  onMilestoneIndexChange,
}: HistogramChartProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const fontSizes = CHART_FONT_SIZES[fontSize]
  const isSubjective = forecastMode === 'subjective'

  const chartData = useMemo(
    () => buildHistogramBins(truncatedNormal, lognormal, gamma, bootstrap, startDate, sprintCadenceWeeks, 15, triangular, uniform),
    [truncatedNormal, lognormal, gamma, bootstrap, triangular, uniform, startDate, sprintCadenceWeeks]
  )

  const hasBootstrap = bootstrap !== null

  const panelId = 'histogram-chart-panel'

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label="Probability Distribution Histogram"
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
          Probability Distribution Histogram
        </h3>
      </button>

      {isExpanded && (
        <div id={panelId} role="region" aria-label="Probability Distribution Histogram" className="px-4 pb-4 relative">
          <ChartToolbar
            idPrefix="histogram"
            milestones={milestones}
            selectedMilestoneIndex={selectedMilestoneIndex}
            onMilestoneIndexChange={onMilestoneIndexChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />

          <div ref={chartRef} className="bg-white dark:bg-gray-800 p-2">
            <p className="text-xs text-muted-foreground mb-4">
              Shows the probability density of completion at each sprint range.
              Higher bars indicate more likely outcomes.
            </p>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border.light} />
                <XAxis
                  dataKey="sprintLabel"
                  tick={(props) => {
                    const { x, y, payload } = props
                    const dataIndex = chartData.findIndex(d => d.sprintLabel === payload.value)
                    const dataPoint = chartData[dataIndex]
                    const dateLabel = dataPoint?.dateLabel || ''
                    // Calculate absolute sprint range
                    const absoluteMin = dataPoint ? dataPoint.sprintMin + completedSprintCount : 0
                    const absoluteMax = dataPoint ? dataPoint.sprintMax + completedSprintCount : 0
                    const absoluteLabel = absoluteMin === absoluteMax
                      ? `${absoluteMin}`
                      : `${absoluteMin}-${absoluteMax}`
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={fontSizes.axisTick} fill={COLORS.text.muted}>
                          {absoluteLabel}
                        </text>
                        <text x={0} y={0} dy={26} textAnchor="middle" fontSize={fontSizes.dateLabel} fill={COLORS.text.light}>
                          {dateLabel}
                        </text>
                      </g>
                    )
                  }}
                  tickLine={{ transform: 'translate(0, 0)' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  interval={0}
                />
                <YAxis
                  label={{ value: 'Probability (%)', angle: -90, position: 'insideLeft', fontSize: fontSizes.axisLabel }}
                  tick={{ fontSize: fontSizes.axisTick }}
                />
                <Tooltip
                  formatter={(value) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value, '']}
                  labelFormatter={(label) => {
                    const dataPoint = chartData.find(d => d.sprintLabel === label)
                    if (!dataPoint) return label
                    const absoluteMin = dataPoint.sprintMin + completedSprintCount
                    const absoluteMax = dataPoint.sprintMax + completedSprintCount
                    const rangeLabel = absoluteMin === absoluteMax
                      ? `Sprint ${absoluteMin}`
                      : `Sprints ${absoluteMin}-${absoluteMax}`
                    return `${rangeLabel} (${dataPoint.dateLabel})`
                  }}
                  contentStyle={{ fontSize: fontSizes.axisTick }}
                />
                <Legend
                  wrapperStyle={{ fontSize: fontSizes.legend, paddingTop: 20 }}
                  verticalAlign="bottom"
                />
                <Bar
                  dataKey="tNormal"
                  name="T-Normal"
                  fill={CHART_COLORS.tNormal}
                  opacity={0.8}
                />
                <Bar
                  dataKey="lognormal"
                  name="Lognorm"
                  fill={CHART_COLORS.lognormal}
                  opacity={0.8}
                />
                <Bar
                  dataKey="gamma"
                  name="Gamma"
                  fill={CHART_COLORS.gamma}
                  opacity={0.8}
                />
                {!isSubjective && hasBootstrap && (
                  <Bar
                    dataKey="bootstrap"
                    name="Bootstrap"
                    fill={CHART_COLORS.bootstrap}
                    opacity={0.8}
                  />
                )}
                <Bar
                  dataKey="triangular"
                  name="Triangular"
                  fill={CHART_COLORS.triangular}
                  opacity={0.8}
                />
                {isSubjective && (
                  <Bar
                    dataKey="uniform"
                    name="Uniform"
                    fill={CHART_COLORS.uniform}
                    opacity={0.8}
                  />
                )}
              </BarChart>
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
