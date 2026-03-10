// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { Sprint } from '@/shared/types'
import { linearRegression, type TrendResult } from '../lib/trend'
import { mean } from '@/shared/lib/math'
import { COLORS } from '@/shared/lib/colors'

interface VelocityChartProps {
  sprints: Sprint[]
  unitOfMeasure: string
}

interface ChartDataPoint {
  sprintNumber: number
  velocity: number
  included: boolean
  trendValue?: number
}

function buildChartData(
  sprints: Sprint[],
  trend: TrendResult,
  showTrend: boolean
): ChartDataPoint[] {
  const sorted = [...sprints].sort((a, b) => a.sprintNumber - b.sprintNumber)
  return sorted.map((s) => ({
    sprintNumber: s.sprintNumber,
    velocity: s.doneValue,
    included: s.includedInForecast,
    trendValue: showTrend ? trend.slope * s.sprintNumber + trend.intercept : undefined,
  }))
}

function getTrendLabel(direction: TrendResult['trendDirection']): string {
  switch (direction) {
    case 'improving': return 'Improving'
    case 'declining': return 'Declining'
    case 'stable': return 'Stable'
  }
}

function getTrendColor(direction: TrendResult['trendDirection']): string {
  switch (direction) {
    case 'improving': return 'text-emerald-600 dark:text-emerald-400'
    case 'declining': return 'text-amber-600 dark:text-amber-400'
    case 'stable': return 'text-blue-600 dark:text-blue-400'
  }
}

export function VelocityChart({ sprints, unitOfMeasure }: VelocityChartProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showTrend, setShowTrend] = useState(true)

  const includedSprints = useMemo(
    () => sprints.filter((s) => s.includedInForecast),
    [sprints]
  )

  const trend = useMemo(
    () => linearRegression(includedSprints.map((s) => ({ x: s.sprintNumber, y: s.doneValue }))),
    [includedSprints]
  )

  const velocityMean = useMemo(
    () => includedSprints.length > 0 ? mean(includedSprints.map((s) => s.doneValue)) : 0,
    [includedSprints]
  )

  const chartData = useMemo(
    () => buildChartData(sprints, trend, showTrend),
    [sprints, trend, showTrend]
  )

  // Need at least 2 sprints to show a meaningful chart
  if (sprints.length < 2) {
    return null
  }

  const velocities = sprints.map((s) => s.doneValue)
  const minVelocity = Math.min(...velocities)
  const maxVelocity = Math.max(...velocities)
  const cv = velocityMean > 0 && includedSprints.length > 1
    ? ((Math.sqrt(includedSprints.reduce((sum, s) => sum + (s.doneValue - velocityMean) ** 2, 0) / (includedSprints.length - 1)) / velocityMean) * 100)
    : 0

  const panelId = 'velocity-chart-panel'

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label="Velocity Trend"
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
          Velocity Trend
        </h3>
        <span className={cn('text-sm font-semibold ml-2', getTrendColor(trend.trendDirection))}>
          {getTrendLabel(trend.trendDirection)}
        </span>
      </button>

      {isExpanded && (
        <div id={panelId} role="region" aria-label="Velocity Trend" className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-4">
            Velocity per sprint over time. Trend line is based on included sprints only.
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Range</div>
              <div className="text-lg font-semibold text-spert-text dark:text-gray-100">
                {minVelocity.toFixed(1)} – {maxVelocity.toFixed(1)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">CV%</div>
              <div className="text-lg font-semibold text-spert-text dark:text-gray-100">
                {cv > 0 ? `${cv.toFixed(0)}%` : '—'}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Trend</div>
              <div className={cn('text-lg font-semibold', getTrendColor(trend.trendDirection))}>
                {getTrendLabel(trend.trendDirection)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">R²</div>
              <div className="text-lg font-semibold text-spert-text dark:text-gray-100">
                {trend.rSquared.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Trend toggle */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="show-trend-line"
              checked={showTrend}
              onChange={(e) => setShowTrend(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="show-trend-line" className="text-xs text-muted-foreground cursor-pointer">
              Show trend line
            </label>
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border.light} />
                <XAxis
                  dataKey="sprintNumber"
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: COLORS.border.light }}
                  label={{ value: 'Sprint', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: COLORS.text.muted }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: COLORS.border.light }}
                  width={40}
                  label={{ value: unitOfMeasure, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: COLORS.text.muted }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value.toFixed(1) : String(value)
                    if (name === 'trendValue') return [`${v} ${unitOfMeasure}`, 'Trend']
                    return [`${v} ${unitOfMeasure}`, 'Velocity']
                  }}
                  labelFormatter={(label) => `Sprint ${label}`}
                  contentStyle={{ fontSize: 12 }}
                />
                {/* Mean reference line */}
                <ReferenceLine
                  y={velocityMean}
                  stroke={COLORS.text.light}
                  strokeDasharray="6 4"
                  label={{ value: `Mean: ${velocityMean.toFixed(1)}`, position: 'right', fontSize: 10, fill: COLORS.text.muted }}
                />
                {/* Velocity line */}
                <Line
                  type="monotone"
                  dataKey="velocity"
                  stroke={COLORS.brand.blue}
                  strokeWidth={2}
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: ChartDataPoint }
                    const isIncluded = payload?.included !== false
                    return (
                      <circle
                        key={`dot-${payload?.sprintNumber}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={isIncluded ? COLORS.brand.blue : COLORS.border.medium}
                        stroke={isIncluded ? COLORS.brand.blue : COLORS.border.medium}
                        strokeWidth={1}
                      />
                    )
                  }}
                  activeDot={{ r: 5 }}
                />
                {/* Trend line */}
                {showTrend && (
                  <Line
                    type="monotone"
                    dataKey="trendValue"
                    stroke={COLORS.status.warningDark}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Interpretation */}
          <div className="mt-4 text-sm text-muted-foreground">
            {trend.trendDirection === 'improving' && (
              <p>
                Velocity is <span className="font-semibold text-emerald-600">trending up</span> by{' '}
                {Math.abs(trend.slope).toFixed(1)} {unitOfMeasure}/sprint (R²={trend.rSquared.toFixed(2)}).
                The team appears to be accelerating.
              </p>
            )}
            {trend.trendDirection === 'declining' && (
              <p>
                Velocity is <span className="font-semibold text-amber-600">trending down</span> by{' '}
                {Math.abs(trend.slope).toFixed(1)} {unitOfMeasure}/sprint (R²={trend.rSquared.toFixed(2)}).
                Investigate potential causes like context switching, tech debt, or team changes.
              </p>
            )}
            {trend.trendDirection === 'stable' && (
              <p>
                Velocity is <span className="font-semibold text-blue-600">stable</span> with no significant trend
                (R²={trend.rSquared.toFixed(2)}). This is typical for mature teams.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
