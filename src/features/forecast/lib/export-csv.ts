// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { PercentileResults } from './monte-carlo'
import type { ProductivityAdjustment, Milestone, ForecastMode } from '@/shared/types'
import { today } from '@/shared/lib/dates'

/** Escape a string for CSV: double quotes and collapse newlines */
function escCsv(s: string): string {
  return s.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')
}

interface ExportConfig {
  projectName: string
  remainingBacklog: number
  velocityMean: number
  velocityStdDev: number
  startDate: string
  sprintCadenceWeeks: number
  trialCount: number
  productivityAdjustments?: ProductivityAdjustment[]
  milestones?: Milestone[]
  scopeGrowthPerSprint?: number
  forecastMode?: ForecastMode
  velocityEstimate?: number
  selectedCV?: number
  volatilityMultiplier?: number
}

interface MilestoneExportData {
  name: string
  backlogSize: number
  cumulativeBacklog: number
}

interface ExportData {
  config: ExportConfig
  truncatedNormalResults: PercentileResults
  lognormalResults: PercentileResults
  gammaResults: PercentileResults
  bootstrapResults: PercentileResults | null
  triangularResults: PercentileResults
  uniformResults: PercentileResults
  truncatedNormalSprintsRequired: number[]
  lognormalSprintsRequired: number[]
  gammaSprintsRequired: number[]
  bootstrapSprintsRequired: number[] | null
  triangularSprintsRequired: number[]
  uniformSprintsRequired: number[]
  /** Per-milestone results when milestones are defined */
  milestoneData?: {
    milestones: MilestoneExportData[]
    distributions: {
      truncatedNormal: PercentileResults[]
      lognormal: PercentileResults[]
      gamma: PercentileResults[]
      bootstrap: PercentileResults[] | null
      triangular: PercentileResults[]
      uniform: PercentileResults[]
    }
  }
}

interface FrequencyCount {
  truncatedNormal: number
  lognormal: number
  gamma: number
  bootstrap: number
  triangular: number
  uniform: number
}

/**
 * Count occurrences of each sprint value and add to frequency map
 */
function countDistribution(
  sprints: number[],
  freq: Map<number, FrequencyCount>,
  key: keyof FrequencyCount
): void {
  for (const sprint of sprints) {
    const existing = freq.get(sprint) || { truncatedNormal: 0, lognormal: 0, gamma: 0, bootstrap: 0, triangular: 0, uniform: 0 }
    existing[key]++
    freq.set(sprint, existing)
  }
}

/**
 * Build frequency distribution from sorted sprint data
 */
function buildFrequencyDistribution(
  truncatedNormalSprints: number[],
  lognormalSprints: number[],
  gammaSprints: number[],
  bootstrapSprints: number[] | null,
  triangularSprints: number[],
  uniformSprints: number[]
): Map<number, FrequencyCount> {
  const freq = new Map<number, FrequencyCount>()

  countDistribution(truncatedNormalSprints, freq, 'truncatedNormal')
  countDistribution(lognormalSprints, freq, 'lognormal')
  countDistribution(gammaSprints, freq, 'gamma')
  if (bootstrapSprints) countDistribution(bootstrapSprints, freq, 'bootstrap')
  countDistribution(triangularSprints, freq, 'triangular')
  countDistribution(uniformSprints, freq, 'uniform')

  return freq
}

/**
 * Generate CSV content for forecast export
 */
export function generateForecastCsv(data: ExportData): string {
  const lines: string[] = []
  const totalTrials = data.config.trialCount
  const hasBootstrap = data.bootstrapResults !== null && data.bootstrapSprintsRequired !== null

  // Section 1: Parameters
  lines.push('SIMULATION PARAMETERS')
  lines.push('Parameter,Value')
  lines.push(`Project,${data.config.projectName}`)
  lines.push(`Remaining Backlog,${data.config.remainingBacklog}`)
  lines.push(`Velocity Mean,${data.config.velocityMean}`)
  lines.push(`Velocity Std Dev,${data.config.velocityStdDev}`)
  lines.push(`Start Date,${data.config.startDate}`)
  lines.push(`Sprint Cadence (weeks),${data.config.sprintCadenceWeeks}`)
  lines.push(`Trial Count,${totalTrials}`)
  lines.push(`Forecast Mode,${data.config.forecastMode ?? 'history'}`)
  if (data.config.forecastMode === 'subjective') {
    if (data.config.velocityEstimate !== undefined) lines.push(`Velocity Estimate,${data.config.velocityEstimate}`)
    if (data.config.selectedCV !== undefined) lines.push(`Selected CV,${data.config.selectedCV}`)
  }
  if (data.config.volatilityMultiplier !== undefined && data.config.volatilityMultiplier !== 1.0) {
    lines.push(`Volatility Adjustment,${data.config.volatilityMultiplier}x`)
  }
  lines.push(`Bootstrap Enabled,${hasBootstrap ? 'Yes' : 'No'}`)
  lines.push(`Scope Growth Modeling,${data.config.scopeGrowthPerSprint !== undefined ? 'Yes' : 'No'}`)
  if (data.config.scopeGrowthPerSprint !== undefined) {
    lines.push(`Scope Growth Per Sprint,${data.config.scopeGrowthPerSprint}`)
  }
  lines.push('')

  // Section 1b: Productivity Adjustments
  const adjustments = data.config.productivityAdjustments ?? []
  lines.push('PRODUCTIVITY ADJUSTMENTS')
  if (adjustments.length === 0) {
    lines.push('None')
  } else {
    lines.push('Name,Start Date,End Date,Factor,Reason')
    for (const adj of adjustments) {
      const reason = adj.reason ? `"${escCsv(adj.reason)}"` : ''
      lines.push(`"${escCsv(adj.name)}",${adj.startDate},${adj.endDate},${Math.round(adj.factor * 100)}%,${reason}`)
    }
  }
  lines.push('')

  // Section 1c: Milestones
  const milestones = data.config.milestones ?? []
  if (milestones.length > 0) {
    lines.push('MILESTONES')
    lines.push('Order,Name,Remaining,Cumulative')
    let cumulative = 0
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i]
      cumulative += m.backlogSize
      lines.push(`${i + 1},"${escCsv(m.name)}",${m.backlogSize},${cumulative}`)
    }
    lines.push('')
  }

  // Section 2: Percentile Results
  lines.push('PERCENTILE RESULTS')
  let percentileHeader = 'Percentile,T-Normal Sprints,T-Normal Finish Date,Lognorm Sprints,Lognorm Finish Date,Gamma Sprints,Gamma Finish Date'
  if (hasBootstrap) percentileHeader += ',Bootstrap Sprints,Bootstrap Finish Date'
  percentileHeader += ',Triangular Sprints,Triangular Finish Date,Uniform Sprints,Uniform Finish Date'
  lines.push(percentileHeader)

  const percentiles = [
    { key: 'p50', label: '50' },
    { key: 'p60', label: '60' },
    { key: 'p70', label: '70' },
    { key: 'p80', label: '80' },
    { key: 'p90', label: '90' },
  ] as const

  for (const p of percentiles) {
    const truncatedNormal = data.truncatedNormalResults[p.key]
    const lognormal = data.lognormalResults[p.key]
    const gamma = data.gammaResults[p.key]
    const triangular = data.triangularResults[p.key]
    const uniform = data.uniformResults[p.key]
    let line = `P${p.label},${truncatedNormal.sprintsRequired},${truncatedNormal.finishDate},${lognormal.sprintsRequired},${lognormal.finishDate},${gamma.sprintsRequired},${gamma.finishDate}`
    if (hasBootstrap && data.bootstrapResults) {
      const bootstrap = data.bootstrapResults[p.key]
      line += `,${bootstrap.sprintsRequired},${bootstrap.finishDate}`
    }
    line += `,${triangular.sprintsRequired},${triangular.finishDate},${uniform.sprintsRequired},${uniform.finishDate}`
    lines.push(line)
  }
  lines.push('')

  // Section 2b: Per-milestone percentile results
  if (data.milestoneData && data.milestoneData.milestones.length > 0) {
    lines.push('PER-MILESTONE PERCENTILE RESULTS')
    for (let mi = 0; mi < data.milestoneData.milestones.length; mi++) {
      const ms = data.milestoneData.milestones[mi]
      const isLast = mi === data.milestoneData.milestones.length - 1
      lines.push(`Milestone: ${ms.name}${isLast ? ' (Total)' : ''} - ${ms.backlogSize} remaining / ${ms.cumulativeBacklog} cumulative`)
      lines.push(percentileHeader)

      const tnResults = data.milestoneData.distributions.truncatedNormal[mi]
      const lnResults = data.milestoneData.distributions.lognormal[mi]
      const gaResults = data.milestoneData.distributions.gamma[mi]
      const bsResults = data.milestoneData.distributions.bootstrap?.[mi] ?? null
      const triResults = data.milestoneData.distributions.triangular[mi]
      const uniResults = data.milestoneData.distributions.uniform[mi]

      for (const p of percentiles) {
        const tn = tnResults[p.key]
        const ln = lnResults[p.key]
        const ga = gaResults[p.key]
        const tri = triResults[p.key]
        const uni = uniResults[p.key]
        let line = `P${p.label},${tn.sprintsRequired},${tn.finishDate},${ln.sprintsRequired},${ln.finishDate},${ga.sprintsRequired},${ga.finishDate}`
        if (hasBootstrap && bsResults) {
          const bs = bsResults[p.key]
          line += `,${bs.sprintsRequired},${bs.finishDate}`
        }
        line += `,${tri.sprintsRequired},${tri.finishDate},${uni.sprintsRequired},${uni.finishDate}`
        lines.push(line)
      }
      lines.push('')
    }
  }

  // Section 3: Frequency Distribution
  lines.push('FREQUENCY DISTRIBUTION')
  let freqHeader = 'Sprints,T-Normal Count,T-Normal %,T-Normal Cumul %,Lognorm Count,Lognorm %,Lognorm Cumul %,Gamma Count,Gamma %,Gamma Cumul %'
  if (hasBootstrap) freqHeader += ',Bootstrap Count,Bootstrap %,Bootstrap Cumul %'
  freqHeader += ',Triangular Count,Triangular %,Triangular Cumul %,Uniform Count,Uniform %,Uniform Cumul %'
  lines.push(freqHeader)

  const freq = buildFrequencyDistribution(
    data.truncatedNormalSprintsRequired,
    data.lognormalSprintsRequired,
    data.gammaSprintsRequired,
    data.bootstrapSprintsRequired,
    data.triangularSprintsRequired,
    data.uniformSprintsRequired
  )

  // Sort by sprint count
  const sortedSprints = Array.from(freq.keys()).sort((a, b) => a - b)

  let truncatedNormalCumulative = 0
  let lognormalCumulative = 0
  let gammaCumulative = 0
  let bootstrapCumulative = 0
  let triangularCumulative = 0
  let uniformCumulative = 0

  for (const sprints of sortedSprints) {
    const counts = freq.get(sprints)!
    const truncatedNormalPct = (counts.truncatedNormal / totalTrials) * 100
    const lognormalPct = (counts.lognormal / totalTrials) * 100
    const gammaPct = (counts.gamma / totalTrials) * 100
    const triangularPct = (counts.triangular / totalTrials) * 100
    const uniformPct = (counts.uniform / totalTrials) * 100
    truncatedNormalCumulative += truncatedNormalPct
    lognormalCumulative += lognormalPct
    gammaCumulative += gammaPct
    triangularCumulative += triangularPct
    uniformCumulative += uniformPct

    let line = `${sprints},${counts.truncatedNormal},${truncatedNormalPct.toFixed(2)}%,${truncatedNormalCumulative.toFixed(2)}%,${counts.lognormal},${lognormalPct.toFixed(2)}%,${lognormalCumulative.toFixed(2)}%,${counts.gamma},${gammaPct.toFixed(2)}%,${gammaCumulative.toFixed(2)}%`

    if (hasBootstrap) {
      const bootstrapPct = (counts.bootstrap / totalTrials) * 100
      bootstrapCumulative += bootstrapPct
      line += `,${counts.bootstrap},${bootstrapPct.toFixed(2)}%,${bootstrapCumulative.toFixed(2)}%`
    }

    line += `,${counts.triangular},${triangularPct.toFixed(2)}%,${triangularCumulative.toFixed(2)}%,${counts.uniform},${uniformPct.toFixed(2)}%,${uniformCumulative.toFixed(2)}%`

    lines.push(line)
  }
  lines.push('')

  // Section 4: Raw Trial Data
  lines.push('RAW TRIAL DATA (sorted)')
  let rawHeader = 'Trial,T-Normal Sprints,Lognorm Sprints,Gamma Sprints'
  if (hasBootstrap) rawHeader += ',Bootstrap Sprints'
  rawHeader += ',Triangular Sprints,Uniform Sprints'
  lines.push(rawHeader)

  for (let i = 0; i < totalTrials; i++) {
    let line = `${i + 1},${data.truncatedNormalSprintsRequired[i]},${data.lognormalSprintsRequired[i]},${data.gammaSprintsRequired[i]}`
    if (hasBootstrap && data.bootstrapSprintsRequired) {
      line += `,${data.bootstrapSprintsRequired[i]}`
    }
    line += `,${data.triangularSprintsRequired[i]},${data.uniformSprintsRequired[i]}`
    lines.push(line)
  }

  return lines.join('\n')
}

/**
 * Trigger a CSV file download in the browser
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generate filename for the export
 */
export function generateFilename(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  return `forecast-${safeName}-${today()}.csv`
}
