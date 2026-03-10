// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { generateForecastCsv, generateFilename } from './export-csv'
import type { PercentileResults } from './monte-carlo'

function makePercentileResults(base: number): PercentileResults {
  return {
    p50: { percentile: 50, sprintsRequired: base, finishDate: '2024-03-01' },
    p60: { percentile: 60, sprintsRequired: base + 1, finishDate: '2024-03-15' },
    p70: { percentile: 70, sprintsRequired: base + 2, finishDate: '2024-03-29' },
    p80: { percentile: 80, sprintsRequired: base + 3, finishDate: '2024-04-12' },
    p90: { percentile: 90, sprintsRequired: base + 4, finishDate: '2024-04-26' },
  }
}

const baseExportData = {
  config: {
    projectName: 'Test Project',
    remainingBacklog: 100,
    velocityMean: 20,
    velocityStdDev: 5,
    startDate: '2024-01-01',
    sprintCadenceWeeks: 2,
    trialCount: 5,
  },
  truncatedNormalResults: makePercentileResults(5),
  lognormalResults: makePercentileResults(5),
  gammaResults: makePercentileResults(5),
  bootstrapResults: null,
  triangularResults: makePercentileResults(5),
  uniformResults: makePercentileResults(5),
  truncatedNormalSprintsRequired: [4, 5, 5, 6, 7],
  lognormalSprintsRequired: [4, 5, 5, 6, 7],
  gammaSprintsRequired: [4, 5, 5, 6, 7],
  bootstrapSprintsRequired: null,
  triangularSprintsRequired: [4, 5, 5, 6, 7],
  uniformSprintsRequired: [4, 5, 5, 6, 7],
}

describe('generateForecastCsv', () => {
  it('contains all section headers', () => {
    const csv = generateForecastCsv(baseExportData)
    expect(csv).toContain('SIMULATION PARAMETERS')
    expect(csv).toContain('PRODUCTIVITY ADJUSTMENTS')
    expect(csv).toContain('PERCENTILE RESULTS')
    expect(csv).toContain('FREQUENCY DISTRIBUTION')
    expect(csv).toContain('RAW TRIAL DATA (sorted)')
  })

  it('includes all config values in parameters section', () => {
    const csv = generateForecastCsv(baseExportData)
    expect(csv).toContain('Test Project')
    expect(csv).toContain('100')
    expect(csv).toContain('Velocity Mean,20')
    expect(csv).toContain('Velocity Std Dev,5')
    expect(csv).toContain('Sprint Cadence (weeks),2')
    expect(csv).toContain('Trial Count,5')
  })

  it('shows "None" when no productivity adjustments', () => {
    const csv = generateForecastCsv(baseExportData)
    expect(csv).toContain('None')
  })

  it('includes productivity adjustments when provided', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        productivityAdjustments: [
          {
            id: '1',
            name: 'Holiday',
            startDate: '2024-12-20',
            endDate: '2025-01-03',
            factor: 0.5,
            enabled: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('"Holiday"')
    expect(csv).toContain('2024-12-20')
    expect(csv).toContain('50%')
  })

  it('escapes double quotes in adjustment names', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        productivityAdjustments: [
          {
            id: '1',
            name: 'Team "Alpha" break',
            startDate: '2024-12-20',
            endDate: '2025-01-03',
            factor: 0.5,
            enabled: true,
            reason: 'The "annual" break',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('"Team ""Alpha"" break"')
    expect(csv).toContain('"The ""annual"" break"')
  })

  it('escapes newlines in adjustment names and reasons (BUG-3 regression)', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        productivityAdjustments: [
          {
            id: '1',
            name: 'Line1\nLine2',
            startDate: '2024-12-20',
            endDate: '2025-01-03',
            factor: 0.5,
            enabled: true,
            reason: 'Reason\r\nwith newline',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    }
    const csv = generateForecastCsv(data)
    // Newlines should be replaced with spaces
    expect(csv).toContain('"Line1 Line2"')
    expect(csv).toContain('"Reason with newline"')
    // No raw newlines within quoted fields
    const lines = csv.split('\n')
    const adjLine = lines.find((l) => l.includes('Line1'))
    expect(adjLine).toBeDefined()
    expect(adjLine).not.toContain('\r')
  })

  it('has correct column count without bootstrap', () => {
    const csv = generateForecastCsv(baseExportData)
    const lines = csv.split('\n')
    const percentileHeader = lines.find((l) => l.startsWith('Percentile,'))!
    // 11 columns: Percentile, T-Normal Sprints/Date, Lognorm Sprints/Date, Gamma Sprints/Date, Triangular Sprints/Date, Uniform Sprints/Date
    expect(percentileHeader.split(',').length).toBe(11)
    expect(csv).toContain('Bootstrap Enabled,No')
  })

  it('has correct column count with bootstrap', () => {
    const data = {
      ...baseExportData,
      bootstrapResults: makePercentileResults(5),
      bootstrapSprintsRequired: [4, 5, 5, 6, 7],
    }
    const csv = generateForecastCsv(data)
    const lines = csv.split('\n')
    const percentileHeader = lines.find((l) => l.startsWith('Percentile,'))!
    // 13 columns: +2 for Bootstrap Sprints and Bootstrap Date
    expect(percentileHeader.split(',').length).toBe(13)
    expect(csv).toContain('Bootstrap Enabled,Yes')
  })

  it('includes correct number of raw trial data rows', () => {
    const csv = generateForecastCsv(baseExportData)
    const lines = csv.split('\n')
    const rawHeaderIdx = lines.findIndex((l) => l.startsWith('RAW TRIAL DATA'))
    const dataHeader = lines[rawHeaderIdx + 1]
    expect(dataHeader).toContain('Trial,')

    // Count data rows (trialCount = 5)
    let dataRows = 0
    for (let i = rawHeaderIdx + 2; i < lines.length; i++) {
      if (lines[i].trim() === '') break
      dataRows++
    }
    expect(dataRows).toBe(5)
  })

  it('includes subjective mode fields when forecastMode is subjective', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        forecastMode: 'subjective' as const,
        velocityEstimate: 25,
        selectedCV: 0.35,
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('Forecast Mode,subjective')
    expect(csv).toContain('Velocity Estimate,25')
    expect(csv).toContain('Selected CV,0.35')
  })

  it('omits subjective fields when forecastMode is history', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        forecastMode: 'history' as const,
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('Forecast Mode,history')
    expect(csv).not.toContain('Velocity Estimate,')
    expect(csv).not.toContain('Selected CV,')
  })

  it('includes volatility adjustment when multiplier is not 1.0', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        volatilityMultiplier: 1.5,
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('Volatility Adjustment,1.5x')
  })

  it('omits volatility adjustment when multiplier is 1.0', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        volatilityMultiplier: 1.0,
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).not.toContain('Volatility Adjustment')
  })

  it('omits volatility adjustment when multiplier is undefined', () => {
    const csv = generateForecastCsv(baseExportData)
    expect(csv).not.toContain('Volatility Adjustment')
  })

  it('includes per-milestone percentile results when milestoneData provided', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        milestones: [
          { id: 'm1', name: 'MVP', backlogSize: 40, color: '#10b981', showOnChart: true, createdAt: '', updatedAt: '' },
          { id: 'm2', name: 'GA Release', backlogSize: 60, color: '#3b82f6', showOnChart: true, createdAt: '', updatedAt: '' },
        ],
      },
      milestoneData: {
        milestones: [
          { name: 'MVP', backlogSize: 40, cumulativeBacklog: 40 },
          { name: 'GA Release', backlogSize: 60, cumulativeBacklog: 100 },
        ],
        distributions: {
          truncatedNormal: [makePercentileResults(3), makePercentileResults(5)],
          lognormal: [makePercentileResults(3), makePercentileResults(5)],
          gamma: [makePercentileResults(3), makePercentileResults(5)],
          bootstrap: null,
          triangular: [makePercentileResults(3), makePercentileResults(5)],
          uniform: [makePercentileResults(3), makePercentileResults(5)],
        },
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('PER-MILESTONE PERCENTILE RESULTS')
    expect(csv).toContain('Milestone: MVP')
    expect(csv).toContain('Milestone: GA Release')
    expect(csv).toContain('(Total)')
    // Should contain per-milestone percentile data rows
    const lines = csv.split('\n')
    const milestoneSection = lines.filter((l) => l.includes('Milestone:'))
    expect(milestoneSection).toHaveLength(2)
  })

  it('includes scope growth info when provided', () => {
    const data = {
      ...baseExportData,
      config: {
        ...baseExportData.config,
        scopeGrowthPerSprint: 3.5,
      },
    }
    const csv = generateForecastCsv(data)
    expect(csv).toContain('Scope Growth Modeling,Yes')
    expect(csv).toContain('Scope Growth Per Sprint,3.5')
  })
})

describe('generateFilename', () => {
  it('generates filename with sanitized project name', () => {
    const filename = generateFilename('My Project!')
    expect(filename).toMatch(/^forecast-my-project--.*\.csv$/)
  })

  it('lowercases the project name', () => {
    const filename = generateFilename('UPPER CASE')
    expect(filename).toContain('upper-case')
  })

  it('replaces special characters with hyphens', () => {
    const filename = generateFilename('project@#$%name')
    expect(filename).not.toMatch(/[@#$%]/)
  })

  it('includes .csv extension', () => {
    const filename = generateFilename('test')
    expect(filename).toMatch(/\.csv$/)
  })
})
