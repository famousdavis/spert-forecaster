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
  ResponsiveContainer,
} from 'recharts'
import type { Sprint } from '@/shared/types'
import { calculateScopeChangeStats } from '@/features/forecast/lib/statistics'
import { COLORS } from '@/shared/lib/colors'

interface ScopeAnalysisProps {
  sprints: Sprint[]
  unitOfMeasure: string
}

export function ScopeAnalysis({ sprints, unitOfMeasure }: ScopeAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const stats = useMemo(() => calculateScopeChangeStats(sprints), [sprints])

  // Don't render anything if insufficient data
  if (!stats) {
    return null
  }

  const getTrendLabel = (trend: 'growing' | 'shrinking' | 'stable') => {
    switch (trend) {
      case 'growing':
        return 'Growing'
      case 'shrinking':
        return 'Shrinking'
      case 'stable':
        return 'Stable'
    }
  }

  const getTrendColor = (trend: 'growing' | 'shrinking' | 'stable') => {
    switch (trend) {
      case 'growing':
        return 'text-amber-600'
      case 'shrinking':
        return 'text-emerald-600'
      case 'stable':
        return 'text-blue-600'
    }
  }

  const panelId = 'scope-analysis-panel'

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label="Scope Change Analysis"
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
          Scope Change Analysis
        </h3>
        {/* Inline trend indicator */}
        <span className={cn('text-sm font-semibold ml-2', getTrendColor(stats.trend))}>
          {getTrendLabel(stats.trend)}
        </span>
      </button>

      {isExpanded && (
        <div id={panelId} role="region" aria-label="Scope Change Analysis" className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-4">
            Tracks how your backlog scope has changed over time based on &quot;Backlog at End&quot; values.
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Sprints Tracked</div>
              <div className="text-lg font-semibold text-spert-text dark:text-gray-100">{stats.sprintsWithData}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Avg Change/Sprint</div>
              <div className={cn(
                'text-lg font-semibold',
                stats.averageChange > 0 ? 'text-amber-600 dark:text-amber-400' : stats.averageChange < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-spert-text dark:text-gray-100'
              )}>
                {stats.averageChange > 0 ? '+' : ''}{stats.averageChange.toFixed(1)} {unitOfMeasure}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Volatility (Std Dev)</div>
              <div className="text-lg font-semibold text-spert-text dark:text-gray-100">
                {stats.volatility.toFixed(1)} {unitOfMeasure}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Total Change</div>
              <div className={cn(
                'text-lg font-semibold',
                stats.totalChange > 0 ? 'text-amber-600 dark:text-amber-400' : stats.totalChange < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-spert-text dark:text-gray-100'
              )}>
                {stats.totalChange > 0 ? '+' : ''}{stats.totalChange.toFixed(1)} {unitOfMeasure}
              </div>
            </div>
          </div>

          {/* Sparkline chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-2">
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={stats.dataPoints} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border.light} />
                <XAxis
                  dataKey="sprintNumber"
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: COLORS.border.light }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: COLORS.border.light }}
                  width={40}
                />
                <Tooltip
                  formatter={(value) => [typeof value === 'number' ? `${value.toFixed(1)} ${unitOfMeasure}` : value, 'Scope']}
                  labelFormatter={(label) => `Sprint ${label}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="scope"
                  stroke={COLORS.brand.blue}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLORS.brand.blue }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Interpretation */}
          <div className="mt-4 text-sm text-muted-foreground">
            {stats.trend === 'growing' && (
              <p>
                Your backlog scope is <span className="font-semibold text-amber-600">growing</span> by an average of{' '}
                {Math.abs(stats.averageChange).toFixed(1)} {unitOfMeasure} per sprint. Consider reviewing scope management practices.
              </p>
            )}
            {stats.trend === 'shrinking' && (
              <p>
                Your backlog scope is <span className="font-semibold text-emerald-600">shrinking</span> by an average of{' '}
                {Math.abs(stats.averageChange).toFixed(1)} {unitOfMeasure} per sprint. Good progress!
              </p>
            )}
            {stats.trend === 'stable' && (
              <p>
                Your backlog scope is <span className="font-semibold text-blue-600">stable</span> with minimal change between sprints.
                This suggests consistent scope management.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
