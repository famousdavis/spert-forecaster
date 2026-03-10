// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useEffect, useRef } from 'react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  ReferenceLine,
  Tooltip,
} from 'recharts'
import type { Sprint } from '@/shared/types'
import { COLORS } from '@/shared/lib/colors'

interface VelocitySparklineProps {
  sprints: Sprint[]
}

const MAX_SPRINTS = 15

export function VelocitySparkline({ sprints }: VelocitySparklineProps) {
  const { data, mean } = useMemo(() => {
    const sorted = [...sprints].sort((a, b) => a.sprintNumber - b.sprintNumber)
    const recent = sorted.slice(-MAX_SPRINTS)
    const values = recent.map((s) => s.doneValue)
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
    return {
      data: recent.map((s) => ({
        sprint: `S${s.sprintNumber}`,
        velocity: s.doneValue,
        included: s.includedInForecast,
      })),
      mean: avg,
    }
  }, [sprints])

  const containerRef = useRef<HTMLDivElement>(null)

  // Remove SVG elements from tab order — Recharts SVGs are focusable by default
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.querySelectorAll('svg').forEach((svg) => svg.setAttribute('focusable', 'false'))
  })

  if (data.length < 2) return null

  const velocities = data.map((d) => d.velocity)
  const min = Math.min(...velocities)
  const max = Math.max(...velocities)
  const padding = (max - min) * 0.2 || 1

  return (
    <div ref={containerRef} className="rounded-md border border-border dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5" aria-hidden="true">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-medium text-spert-text-secondary dark:text-gray-300">
          Velocity trend
        </span>
        <span className="text-[10px] text-spert-text-muted dark:text-gray-400">
          {data.length} sprints
        </span>
      </div>
      <ResponsiveContainer width={140} height={40}>
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis domain={[min - padding, max + padding]} hide />
          <ReferenceLine
            y={mean}
            stroke={COLORS.border.medium}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as { sprint: string; velocity: number }
              return (
                <div className="bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg">
                  {d.sprint}: {d.velocity}
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="velocity"
            stroke={COLORS.brand.blue}
            strokeWidth={1.5}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, payload } = props as {
                cx: number
                cy: number
                payload: { sprint: string; included: boolean }
              }
              const isIncluded = payload?.included !== false
              return (
                <circle
                  key={`spark-${payload?.sprint}`}
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  fill={isIncluded ? COLORS.brand.blue : COLORS.border.medium}
                  stroke="white"
                  strokeWidth={0.5}
                />
              )
            }}
            activeDot={{ r: 3.5, fill: COLORS.brand.blue, stroke: 'white', strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
