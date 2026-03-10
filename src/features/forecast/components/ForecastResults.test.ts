// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { buildDynamicPercentileRows } from './ForecastResults'
import type { QuadSimulationData } from '../lib/monte-carlo'

describe('buildDynamicPercentileRows', () => {
  // Create deterministic sorted arrays — all identical values so percentile results are predictable
  const makeArray = (value: number) => Array(100).fill(value) as number[]

  const simulationData: QuadSimulationData = {
    truncatedNormal: makeArray(10),
    lognormal: makeArray(12),
    gamma: makeArray(14),
    bootstrap: null,
    triangular: makeArray(8),
    uniform: makeArray(16),
  }

  const columns = [
    { key: 'truncatedNormal' as const, label: 'T-Normal' },
    { key: 'lognormal' as const, label: 'Lognorm' },
    { key: 'gamma' as const, label: 'Gamma' },
    { key: 'triangular' as const, label: 'Triangular' },
    { key: 'uniform' as const, label: 'Uniform' },
  ]

  // A Monday start date for predictable business day calculations
  const startDate = '2025-01-06'
  const sprintCadenceWeeks = 2

  it('generates correct number of rows for selected percentiles', () => {
    const rows = buildDynamicPercentileRows(
      simulationData, [10, 50, 90], columns, startDate, sprintCadenceWeeks
    )
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.label)).toEqual(['P10', 'P50', 'P90'])
    expect(rows.map((r) => r.key)).toEqual(['p10', 'p50', 'p90'])
  })

  it('produces correct sprint counts from deterministic data', () => {
    const rows = buildDynamicPercentileRows(
      simulationData, [50], columns, startDate, sprintCadenceWeeks
    )
    expect(rows).toHaveLength(1)
    // All values are constant, so sprintsRequired == the constant value
    const values = rows[0].values
    expect(values[0]?.sprintsRequired).toBe(10) // truncatedNormal
    expect(values[1]?.sprintsRequired).toBe(12) // lognormal
    expect(values[2]?.sprintsRequired).toBe(14) // gamma
    expect(values[3]?.sprintsRequired).toBe(8)  // triangular
    expect(values[4]?.sprintsRequired).toBe(16) // uniform
  })

  it('returns null for distributions with null data', () => {
    const columnsWithBootstrap = [
      ...columns.slice(0, 3),
      { key: 'bootstrap' as const, label: 'Bootstrap' },
      ...columns.slice(3),
    ]
    const rows = buildDynamicPercentileRows(
      simulationData, [80], columnsWithBootstrap, startDate, sprintCadenceWeeks
    )
    expect(rows[0].values[3]).toBeNull() // bootstrap is null
  })

  it('handles single percentile', () => {
    const rows = buildDynamicPercentileRows(
      simulationData, [85], columns, startDate, sprintCadenceWeeks
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('P85')
  })

  it('handles all nine percentiles', () => {
    const allPercentiles = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    const rows = buildDynamicPercentileRows(
      simulationData, allPercentiles, columns, startDate, sprintCadenceWeeks
    )
    expect(rows).toHaveLength(9)
    expect(rows.map((r) => r.label)).toEqual(
      allPercentiles.map((p) => `P${p}`)
    )
  })

  it('each value includes a finishDate string', () => {
    const rows = buildDynamicPercentileRows(
      simulationData, [50], columns, startDate, sprintCadenceWeeks
    )
    for (const val of rows[0].values) {
      if (val) {
        expect(typeof val.finishDate).toBe('string')
        // ISO date format check
        expect(val.finishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
})
