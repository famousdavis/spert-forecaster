// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import type { PercentileResults, QuadResults, QuadSimulationData } from '../lib/monte-carlo'
import { calculatePercentileResult } from '../lib/monte-carlo'
import { formatDate } from '@/shared/lib/dates'
import type { DistributionType } from '../types'
import { getVisibleDistributions, DISTRIBUTION_LABELS } from '../types'
import type { ForecastMode } from '@/shared/types'

export interface DistColumn {
  key: DistributionType
  label: string
}

export function getDistributionColumns(forecastMode: ForecastMode, hasBootstrap: boolean): DistColumn[] {
  return getVisibleDistributions(forecastMode, hasBootstrap).map((key) => ({
    key,
    label: DISTRIBUTION_LABELS[key],
  }))
}

export interface PercentileRow {
  key: string
  label: string
  values: ({ sprintsRequired: number; finishDate: string } | null)[]
}

/** Build rows dynamically from simulation data for any set of percentiles */
export function buildDynamicPercentileRows(
  simulationData: QuadSimulationData,
  percentiles: number[],
  columns: DistColumn[],
  startDate: string,
  sprintCadenceWeeks: number,
): PercentileRow[] {
  return percentiles.map((p) => ({
    key: `p${p}`,
    label: `P${p}`,
    values: columns.map((col) => {
      const sprintsArray = simulationData[col.key]
      if (!sprintsArray) return null
      const result = calculatePercentileResult(sprintsArray, p, startDate, sprintCadenceWeeks)
      return { sprintsRequired: result.sprintsRequired, finishDate: result.finishDate }
    }),
  }))
}

type PercentileKey = 'p50' | 'p60' | 'p70' | 'p80' | 'p90'

/** Legacy fallback: build rows from pre-computed QuadResults */
export function buildPercentileRows(
  results: QuadResults,
  columns: DistColumn[]
): PercentileRow[] {
  const percentiles: { key: PercentileKey; label: string }[] = [
    { key: 'p50', label: 'P50' },
    { key: 'p60', label: 'P60' },
    { key: 'p70', label: 'P70' },
    { key: 'p80', label: 'P80' },
    { key: 'p90', label: 'P90' },
  ]
  return percentiles.map(({ key, label }) => ({
    key,
    label,
    values: columns.map((col) => {
      const distResults = results[col.key]
      if (!distResults) return null
      return (distResults as PercentileResults)[key]
    }),
  }))
}

export function ResultsTable({
  rows,
  columns,
  completedSprintCount,
}: {
  rows: PercentileRow[]
  columns: DistColumn[]
  completedSprintCount: number
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border">
          <th rowSpan={2} className="px-2 py-3 text-left text-sm font-medium text-muted-foreground align-bottom">Conf.</th>
          {columns.map((col) => (
            <th key={col.key} colSpan={2} className="px-2 py-2 text-center text-sm font-medium text-muted-foreground border-b border-border">
              {col.label}
            </th>
          ))}
        </tr>
        <tr className="border-b border-border">
          {columns.map((col) => [
            <th key={`${col.key}-sprint`} className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">Sprint</th>,
            <th key={`${col.key}-date`} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const baseResult = row.values[0]
          return (
            <tr key={row.key} className="border-b border-border">
              <td className="px-2 py-3 text-sm font-medium dark:text-gray-100">{row.label}</td>
              {row.values.map((result, colIdx) => {
                const col = columns[colIdx]
                if (!result) return (
                  <td key={col.key} colSpan={2} className="px-2 py-3 text-sm text-muted-foreground text-center">—</td>
                )
                const diffSprints = colIdx > 0 && baseResult && result.sprintsRequired !== baseResult.sprintsRequired
                const diffDate = colIdx > 0 && baseResult && result.finishDate !== baseResult.finishDate
                return [
                  <td key={`${col.key}-sprint`} className={cn('px-2 py-3 text-right text-sm dark:text-gray-100', diffSprints && 'text-spert-blue font-medium')}>
                    {result.sprintsRequired + completedSprintCount}
                  </td>,
                  <td key={`${col.key}-date`} className={cn('px-2 py-3 text-sm dark:text-gray-100', diffDate && 'text-spert-blue font-medium')}>
                    {formatDate(result.finishDate)}
                  </td>,
                ]
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
