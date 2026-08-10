// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { PercentileResults } from './monte-carlo'
import type { ProductivityAdjustment, Milestone, ForecastMode } from '@/shared/types'
import { today } from '@/shared/lib/dates'

/**
 * Escape a string for CSV: double quotes, collapse newlines, and prefix any
 * cell starting with `=`/`+`/`-`/`@`/Tab with `'` so spreadsheet apps treat
 * the cell as text, not a formula. Closes a CSV-injection vector (v0.28.3
 * L4): a project name like `=cmd|'/c calc'!A1` would otherwise execute as
 * a formula when the exported file is opened in Excel and the macro warning
 * is dismissed.
 */
function escCsv(s: string): string {
  const cleaned = s.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')
  return /^[=+\-@\t]/.test(cleaned) ? `'${cleaned}` : cleaned
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
/**
 * ⚠️ Shared by BOTH Section 2 (percentile results) and Section 2b (per-milestone).
 * These were locals of Section 2 that Section 2b read from the enclosing scope — the single
 * cross-section coupling in this function, found while costing the seams on 2026-08-10. Hoisted
 * to module scope so the two sections can be lifted independently. Behaviour unchanged.
 */
const PERCENTILE_ROWS = [
  { key: 'p50', label: '50' },
  { key: 'p60', label: '60' },
  { key: 'p70', label: '70' },
  { key: 'p80', label: '80' },
  { key: 'p90', label: '90' },
] as const

function percentileHeaderFor(hasBootstrap: boolean): string {
  let header = 'Percentile,T-Normal Sprints,T-Normal Finish Date,Lognormal Sprints,Lognormal Finish Date,Gamma Sprints,Gamma Finish Date'
  if (hasBootstrap) header += ',Bootstrap Sprints,Bootstrap Finish Date'
  header += ',Triangular Sprints,Triangular Finish Date,Uniform Sprints,Uniform Finish Date'
  return header
}

/** Section 1: Parameters — lifted from generateForecastCsv 2026-08-10. Behaviour unchanged; pinned by export-csv-oracle.json. */
function csvParameters(data: ExportData, lines: string[], hasBootstrap: boolean, totalTrials: number): void {
lines.push('SIMULATION PARAMETERS')
lines.push('Parameter,Value')
lines.push(`Project,"${escCsv(data.config.projectName)}"`)
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

}

/** Section 1b: Productivity Adjustments — lifted from generateForecastCsv 2026-08-10. Behaviour unchanged; pinned by export-csv-oracle.json. */
function csvProductivityAdjustments(data: ExportData, lines: string[]): void {
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

}

/** Section 1c: Milestones — lifted from generateForecastCsv 2026-08-10. Behaviour unchanged; pinned by export-csv-oracle.json. */
function csvMilestones(data: ExportData, lines: string[]): void {
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

}

/** Section 2: Percentile Results — lifted from generateForecastCsv 2026-08-10. Behaviour unchanged; pinned by export-csv-oracle.json. */
function csvPercentileResults(data: ExportData, lines: string[], hasBootstrap: boolean): void {
lines.push('PERCENTILE RESULTS')
const percentileHeader = percentileHeaderFor(hasBootstrap)
lines.push(percentileHeader)

for (const p of PERCENTILE_ROWS) {
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

}

/** Section 3: Frequency Distribution — lifted from generateForecastCsv 2026-08-10. Behaviour unchanged; pinned by export-csv-oracle.json. */
function csvFrequencyDistribution(data: ExportData, lines: string[], hasBootstrap: boolean, totalTrials: number): void {
lines.push('FREQUENCY DISTRIBUTION')
let freqHeader = 'Sprints,T-Normal Count,T-Normal %,T-Normal Cumul %,Lognormal Count,Lognormal %,Lognormal Cumul %,Gamma Count,Gamma %,Gamma Cumul %'
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

}

/** Section 4: Raw Trial Data — lifted from generateForecastCsv 2026-08-10. Behaviour unchanged; pinned by export-csv-oracle.json. */
function csvRawTrialData(data: ExportData, lines: string[], hasBootstrap: boolean, totalTrials: number): void {
lines.push('RAW TRIAL DATA (sorted)')
let rawHeader = 'Trial,T-Normal Sprints,Lognormal Sprints,Gamma Sprints'
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
}

/** Section 2b, ONE milestone — the loop body, not the whole section.
 *  ⚠️ Section 2b as a whole measured cc 15 against a threshold that fires ABOVE 15. Lifting it
 *  whole would have relocated a finding with zero headroom rather than resolving one, and the
 *  two-way ratchet could not have seen that, because nothing crossed. Split deliberately. */
function csvMilestoneRow(
  data: ExportData,
  lines: string[],
  hasBootstrap: boolean,
  milestoneData: NonNullable<ExportData['milestoneData']>,
  mi: number
): void {
  const ms = milestoneData.milestones[mi]
  const isLast = mi === milestoneData.milestones.length - 1
  lines.push(`Milestone: ${ms.name}${isLast ? ' (Total)' : ''} - ${ms.backlogSize} remaining / ${ms.cumulativeBacklog} cumulative`)
  lines.push(percentileHeaderFor(hasBootstrap))

  const tnResults = milestoneData.distributions.truncatedNormal[mi]
  const lnResults = milestoneData.distributions.lognormal[mi]
  const gaResults = milestoneData.distributions.gamma[mi]
  const bsResults = milestoneData.distributions.bootstrap?.[mi] ?? null
  const triResults = milestoneData.distributions.triangular[mi]
  const uniResults = milestoneData.distributions.uniform[mi]

  for (const p of PERCENTILE_ROWS) {
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

export function generateForecastCsv(data: ExportData): string {
  const lines: string[] = []
  const totalTrials = data.config.trialCount
  const hasBootstrap = data.bootstrapResults !== null && data.bootstrapSprintsRequired !== null

  csvParameters(data, lines, hasBootstrap, totalTrials)
  csvProductivityAdjustments(data, lines)
  csvMilestones(data, lines)
  csvPercentileResults(data, lines, hasBootstrap)

  // Section 2b: Per-milestone percentile results
  const md = data.milestoneData
  if (md && md.milestones.length > 0) {
    lines.push('PER-MILESTONE PERCENTILE RESULTS')
    for (let mi = 0; mi < md.milestones.length; mi++) {
      csvMilestoneRow(data, lines, hasBootstrap, md, mi)
    }
  }

  csvFrequencyDistribution(data, lines, hasBootstrap, totalTrials)
  csvRawTrialData(data, lines, hasBootstrap, totalTrials)

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
