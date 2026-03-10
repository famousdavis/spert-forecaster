// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { BurnUpConfig } from '../types'
import { COLORS } from '@/shared/lib/colors'

// Fixed colors for backlog and done lines
const BACKLOG_COLOR = COLORS.burnUp.backlog
const DONE_COLOR = COLORS.burnUp.done

interface MilestoneRefLine {
  id: string
  name: string
  color: string
  yValue: number
}

export interface BurnUpDataPoint {
  sprintNumber: number
  dateLabel: string
  backlog: number
  cumulativeDone: number | null
  line1?: number
  line2?: number
  line3?: number
}

interface BurnUpChartCanvasProps {
  chartData: BurnUpDataPoint[]
  config: BurnUpConfig
  yAxisMax: number
  milestoneRefLines: MilestoneRefLine[]
  fontSizes: { axisTick: number; axisLabel: number; dateLabel: number; legend: number }
}

/**
 * Pure presentational Recharts rendering for the burn-up chart.
 * Receives pre-computed data and renders the chart — no state or business logic.
 */
export function BurnUpChartCanvas({
  chartData,
  config,
  yAxisMax,
  milestoneRefLines,
  fontSizes,
}: BurnUpChartCanvasProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border.light} />
        <XAxis
          dataKey="sprintNumber"
          tick={(props) => {
            const { x, y, payload } = props
            const point = chartData.find((p) => p.sprintNumber === payload.value)
            const dateLabel = point?.dateLabel || ''
            return (
              <g transform={`translate(${x},${y})`}>
                <text x={0} y={0} dy={14} textAnchor="middle" fontSize={fontSizes.axisTick} fill={COLORS.text.primary}>
                  {payload.value}
                </text>
                <text x={0} y={0} dy={30} textAnchor="middle" fontSize={fontSizes.dateLabel} fill={COLORS.text.secondary}>
                  {dateLabel}
                </text>
              </g>
            )
          }}
          tickLine={{ transform: 'translate(0, 0)' }}
          axisLine={{ stroke: '#e5e7eb' }}
          interval={chartData.length <= 25 ? 0 : chartData.length <= 50 ? 1 : chartData.length <= 80 ? 2 : Math.floor(chartData.length / 25)}
        />
        <YAxis
          domain={[0, yAxisMax]}
          label={{ value: 'Work Units', angle: -90, position: 'insideLeft', fontSize: fontSizes.axisLabel }}
          tick={{ fontSize: fontSizes.axisTick }}
        />
        <Tooltip
          formatter={(value, name) => {
            if (value === undefined || value === null) return ['-', name]
            return [typeof value === 'number' ? value.toFixed(1) : value, name]
          }}
          labelFormatter={(sprintNumber) => {
            const point = chartData.find((p) => p.sprintNumber === sprintNumber)
            return point ? `Sprint ${sprintNumber} (${point.dateLabel})` : `Sprint ${sprintNumber}`
          }}
          contentStyle={{ fontSize: fontSizes.axisTick }}
        />
        <Legend wrapperStyle={{ fontSize: fontSizes.legend, paddingTop: 20 }} verticalAlign="bottom" />

        {/* Confidence interval areas (rendered first so lines appear on top) */}
        {config.showConfidenceIntervals && (
          <>
            <Area
              type="linear"
              dataKey="line1"
              stroke="none"
              fill={config.lines[0].color}
              fillOpacity={0.15}
              connectNulls={false}
              legendType="none"
              name=""
            />
            <Area
              type="linear"
              dataKey="line2"
              stroke="none"
              fill={config.lines[1].color}
              fillOpacity={0.15}
              connectNulls={false}
              legendType="none"
              name=""
            />
            <Area
              type="linear"
              dataKey="line3"
              stroke="none"
              fill={config.lines[2].color}
              fillOpacity={0.15}
              connectNulls={false}
              legendType="none"
              name=""
            />
          </>
        )}

        {/* Scope line (solid) - total product scope over time */}
        {config.showScopeLine !== false && (
          <Line
            type="stepAfter"
            dataKey="backlog"
            name="Scope"
            stroke={BACKLOG_COLOR}
            dot={false}
            strokeWidth={3.5}
            connectNulls={false}
          />
        )}

        {/* Cumulative done line (solid) */}
        <Line
          type="stepAfter"
          dataKey="cumulativeDone"
          name="Done"
          stroke={DONE_COLOR}
          dot={false}
          strokeWidth={3.5}
          connectNulls={false}
        />

        {/* Forecast lines (dashed) */}
        {config.lines.map((line, idx) => (
          <Line
            key={idx}
            type="linear"
            dataKey={`line${idx + 1}`}
            name={line.label}
            stroke={line.color}
            strokeDasharray="6 4"
            dot={false}
            strokeWidth={3}
            connectNulls={false}
          />
        ))}

        {/* Milestone reference lines */}
        {milestoneRefLines.map((ref) => (
          <ReferenceLine
            key={ref.id}
            y={ref.yValue}
            stroke={ref.color}
            strokeDasharray="8 4"
            strokeWidth={1.5}
            label={{
              value: ref.name,
              position: 'insideTopLeft',
              fontSize: fontSizes.axisTick,
              fill: ref.color,
            }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
