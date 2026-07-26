// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { buildSnapshot, type SnapshotInput } from './build-snapshot'
import { sanitizeForFirestore } from '@/shared/firebase/firestore-sanitize'
import type { Project, Sprint } from '@/shared/types'
import type { ForecastRunRecord, ForecastViewState } from '@/shared/state/forecast-results-store'
import type { RunConfig } from '@/shared/lib/forecast-staleness'
import { buildForecastInputSnapshot } from '@/shared/lib/forecast-staleness'

const PERCENTILES = {
  p50: { percentile: 50, finishDate: '2026-02-02', sprintsRequired: 1 },
  p60: { percentile: 60, finishDate: '2026-02-16', sprintsRequired: 2 },
  p70: { percentile: 70, finishDate: '2026-02-16', sprintsRequired: 2 },
  p80: { percentile: 80, finishDate: '2026-03-02', sprintsRequired: 3 },
  p90: { percentile: 90, finishDate: '2026-03-16', sprintsRequired: 4 },
}

const PROJECT: Project = {
  id: 'p1',
  name: 'Mobile App Launch',
  unitOfMeasure: 'story points',
  sprintCadenceWeeks: 2,
  firstSprintStartDate: '2026-01-05',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function sprint(n: number, doneValue: number, included = true): Sprint {
  return {
    id: `s${n}`,
    projectId: 'p1',
    sprintNumber: n,
    doneValue,
    includedInForecast: included,
    backlogAtSprintEnd: 500 - n * 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const SPRINTS = [1, 2, 3, 4, 5, 6].map((n) => sprint(n, 40 + n))

const VIEW: ForecastViewState = {
  selectedMilestoneIndex: 0,
  customPercentile: 85,
  customPercentile2: 65,
  selectedResultsPercentiles: [10, 50, 90],
  targetDate: '',
  modelScopeGrowth: false,
  scopeGrowthMode: 'calculated',
  customScopeGrowth: '',
  summaryDistribution: 'lognormal',
  summaryPercentile: 80,
  summaryScope: '__project__',
}

const STORED_INPUTS = { remainingBacklog: '100', velocityMean: '43', velocityStdDev: '5' }

/**
 * Build the comparand exactly as readForecastInputSnapshot would.
 *
 * The fixture's runConfig is derived from this rather than hand-written, for
 * the same reason production derives both from one builder: a hand-written
 * config disagrees with the live derivation on the forecast anchor, and every
 * ladder row then reports "stale" for a reason that has nothing to do with
 * what the test is asserting.
 */
function comparandFor(project: Project | undefined, allSprints: Sprint[]) {
  return buildForecastInputSnapshot({
    project,
    allSprints,
    storedInputs: STORED_INPUTS,
    trialCount: 10000,
    scopeGrowth: { modelScopeGrowth: false, scopeGrowthMode: 'calculated', customScopeGrowth: '' },
  })
}

function runConfig(over: Partial<RunConfig> = {}): RunConfig {
  return { ...comparandFor(PROJECT, SPRINTS), ...over }
}

function record(over: Partial<ForecastRunRecord> = {}): ForecastRunRecord {
  const sim = {
    truncatedNormal: [1, 2, 3, 4], lognormal: [1, 2, 3, 4], gamma: [1, 2, 3, 4],
    bootstrap: null, triangular: [1, 2, 3, 4], uniform: [1, 2, 3, 4],
  }
  const quad = {
    truncatedNormal: PERCENTILES, lognormal: PERCENTILES, gamma: PERCENTILES,
    bootstrap: null, triangular: PERCENTILES, uniform: PERCENTILES,
  }
  return {
    projectId: 'p1',
    runAt: '2026-02-01T10:00:00.000Z',
    runConfig: runConfig(),
    simData: [sim],
    quadResults: [quad],
    scopes: [{
      kind: 'project', milestoneIndex: null, label: 'Mobile App Launch',
      cumulativeThreshold: 100, thresholdUnreachable: false,
    }],
    ...over,
  }
}

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  const project = over.project !== undefined ? over.project : PROJECT
  const allSprints = over.allSprints ?? SPRINTS
  const storedInputs = over.storedInputs !== undefined ? over.storedInputs : STORED_INPUTS
  // The comparand always reflects the LIVE state under test, so a test that
  // edits storedInputs, sprints, or milestones gets a comparand that has
  // genuinely moved away from the record — which is what makes the stale rows
  // fire for the reason the test names.
  const comparand = buildForecastInputSnapshot({
    project,
    allSprints,
    storedInputs,
    trialCount: 10000,
    scopeGrowth: { modelScopeGrowth: false, scopeGrowthMode: 'calculated', customScopeGrowth: '' },
  })
  return {
    project,
    allSprints,
    record: record(),
    view: VIEW,
    comparand,
    storedInputs,
    isSimulatingProjectId: null,
    distributionsEnabled: undefined,
    capturedAt: '2026-02-01T10:05:00.000Z',
    ...over,
    // Never let an override silently reuse a stale comparand.
    ...(over.comparand ? { comparand: over.comparand } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RK4 — the highest-rated risk in this feature.
// ═══════════════════════════════════════════════════════════════════════════

describe('the builder never emits workspace or attribution fields', () => {
  const SENTINELS = {
    originRef: 'SENTINEL-ORIGIN-e3f1',
    storageRef: 'SENTINEL-STORAGE-9a72',
    changeLog: 'SENTINEL-CHANGELOG-4bd8',
    exportedBy: 'SENTINEL-EXPORTED-BY-c015',
    exportedById: 'SENTINEL-EXPORTED-ID-77ae',
    exportName: 'SENTINEL-EXPORT-NAME-1f30',
    exportId: 'SENTINEL-EXPORT-ID-6c4b',
  }

  /**
   * A project object carrying every marker, so a spread anywhere in the
   * builder pulls at least one distinctive string into the payload.
   */
  function pollutedProject(): Project {
    return {
      ...PROJECT,
      _originRef: SENTINELS.originRef,
      _storageRef: SENTINELS.storageRef,
      _changeLog: [{ op: 'add', entity: 'project', id: SENTINELS.changeLog, at: 1 }],
      _exportedBy: SENTINELS.exportedBy,
      _exportedById: SENTINELS.exportedById,
      exportName: SENTINELS.exportName,
      exportId: SENTINELS.exportId,
    } as unknown as Project
  }

  /** Walk every key in the emitted structure. */
  function allKeys(value: unknown, acc: string[] = []): string[] {
    if (Array.isArray(value)) {
      for (const v of value) allKeys(v, acc)
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        acc.push(k)
        allKeys(v, acc)
      }
    }
    return acc
  }

  it('emits no key beginning with an underscore', () => {
    // Asserted on the POST-sanitize artifact, because that is what actually
    // reaches Firestore.
    const body = sanitizeForFirestore(buildSnapshot(input({ project: pollutedProject() })))
    const underscored = allKeys(body).filter((k) => k.startsWith('_'))
    expect(underscored).toEqual([])
  })

  it('emits no exportName or exportId key', () => {
    // These two carry NO underscore prefix, which is exactly why they need
    // their own assertion — the settings store is the likeliest leak path
    // and nothing about their names makes them conspicuous.
    const body = sanitizeForFirestore(buildSnapshot(input({ project: pollutedProject() })))
    const keys = allKeys(body)
    expect(keys).not.toContain('exportName')
    expect(keys).not.toContain('exportId')
  })

  it('emits no sentinel VALUE anywhere in the serialized body', () => {
    // The strongest of the three: catches a leak that renamed the key on its
    // way out, which neither key-name assertion would see.
    const body = sanitizeForFirestore(buildSnapshot(input({ project: pollutedProject() })))
    const json = JSON.stringify(body)
    for (const [name, sentinel] of Object.entries(SENTINELS)) {
      expect([name, json.includes(sentinel)]).toEqual([name, false])
    }
  })

  it('holds under the degraded and minimal escalation steps too', () => {
    // A reducer that rebuilds the body is a second place a spread could
    // appear, and it runs only under memory pressure — the least-tested path.
    for (const byteBudget of [4_000, 10]) {
      const body = sanitizeForFirestore(
        buildSnapshot(input({ project: pollutedProject(), byteBudget }))
      )
      const json = JSON.stringify(body)
      expect(body.bodyDegraded).toBe(true)
      expect(allKeys(body).filter((k) => k.startsWith('_'))).toEqual([])
      for (const sentinel of Object.values(SENTINELS)) {
        expect(json.includes(sentinel)).toBe(false)
      }
    }
  })

  it('never names the integrity fields in notVisibleToYou', () => {
    const body = buildSnapshot(input())
    const disclosures = (body.notVisibleToYou as string[]).join(' ').toLowerCase()
    for (const banned of [
      'originref', 'storageref', 'changelog', 'exportedby', 'workspace',
      'fingerprint', 'provenance', 'attribution',
    ]) {
      expect([banned, disclosures.includes(banned)]).toEqual([banned, false])
    }
  })

  it('lets no Map reach the write — sanitize reduces one to {} silently', () => {
    const body = buildSnapshot(input())
    const hasMap = (v: unknown): boolean => {
      if (v instanceof Map || v instanceof Set) return true
      if (Array.isArray(v)) return v.some(hasMap)
      if (v && typeof v === 'object') return Object.values(v).some(hasMap)
      return false
    }
    expect(hasMap(body)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// The freshness ladder — every row reachable, with its stated reason.
// ═══════════════════════════════════════════════════════════════════════════

describe('freshness ladder', () => {
  const results = (b: Record<string, unknown>) => b.results as Record<string, unknown>

  it('row 1: a run in flight for THIS project reports recomputing', () => {
    const b = buildSnapshot(input({ isSimulatingProjectId: 'p1' }))
    expect(results(b).status).toBe('recomputing')
    expect(String(results(b).statusReason)).toContain('running now')
    // The reduced body: percentile data is OMITTED, not null.
    expect(results(b).scopes).toBeUndefined()
    expect(results(b).byDistribution).toBeUndefined()
    expect(results(b).visibleDistributions).toBeDefined()
  })

  it('row 1 does not fire for a DIFFERENT project', () => {
    const b = buildSnapshot(input({ isSimulatingProjectId: 'other' }))
    expect(results(b).status).toBe('fresh')
  })

  it('row 2: no record and the run is blocked names the blocking reason', () => {
    const b = buildSnapshot(input({
      record: null,
      storedInputs: { remainingBacklog: '', velocityMean: '', velocityStdDev: '' },
    }))
    expect(results(b).status).toBe('absent')
    expect(String(results(b).statusReason).length).toBeGreaterThan(10)
  })

  it('row 2: a backlog of "0" is blocked, not merely un-run', () => {
    // canRunForecast tests !!remainingBacklog on the RAW STRING, so "0" passes
    // every prerequisite while the handler bails on parsedBacklog <= 0. Left
    // to row 3 this would advise a run that silently does nothing forever.
    const b = buildSnapshot(input({
      record: null,
      storedInputs: { remainingBacklog: '0', velocityMean: '43', velocityStdDev: '5' },
    }))
    expect(results(b).status).toBe('absent')
    expect(String(results(b).statusReason)).toContain('usable remaining backlog')
  })

  it('row 3: no record but runnable advises running one', () => {
    const b = buildSnapshot(input({ record: null }))
    expect(results(b).status).toBe('absent')
    expect(String(results(b).statusReason)).toContain('open the Forecast tab and run one')
  })

  it('row 4: an in-period productivity adjustment change is stale', () => {
    const project: Project = {
      ...PROJECT,
      productivityAdjustments: [{
        id: 'a1', name: 'Holiday', startDate: '2026-06-01', endDate: '2026-06-14',
        factor: 0.5, enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }
    const b = buildSnapshot(input({ project }))
    expect(results(b).status).toBe('stale')
    expect(String(results(b).statusReason)).toContain('productivity adjustment')
  })

  it('row 5: an inclusion change is stale', () => {
    const b = buildSnapshot(input({
      allSprints: [...SPRINTS.slice(0, 5), sprint(6, 46, false)],
    }))
    expect(results(b).status).toBe('stale')
    expect(String(results(b).statusReason)).toContain('sprints included')
  })

  it('row 6: a milestone resize is stale', () => {
    const project: Project = {
      ...PROJECT,
      milestones: [{ id: 'm1', name: 'Alpha', backlogSize: 60, createdAt: '', updatedAt: '' }],
    }
    const b = buildSnapshot(input({ project }))
    expect(results(b).status).toBe('stale')
    expect(String(results(b).statusReason)).toContain('milestone')
  })

  it('row 7: a scalar change names the field, before, and after', () => {
    const b = buildSnapshot(input({
      storedInputs: { remainingBacklog: '250', velocityMean: '43', velocityStdDev: '5' },
    }))
    expect(results(b).status).toBe('stale')
    expect(String(results(b).statusReason)).toContain('remainingBacklog')
    expect(String(results(b).statusReason)).toContain('100')
    expect(String(results(b).statusReason)).toContain('250')
  })

  it('rows 4-7 advise a re-run — unless the run is blocked', () => {
    const runnable = buildSnapshot(input({
      storedInputs: { remainingBacklog: '250', velocityMean: '43', velocityStdDev: '5' },
    }))
    expect(String(results(runnable).statusReason)).toContain('open the Forecast tab to recompute')

    // Reachable with a record present: run a forecast, then set the backlog
    // to 0. canRunForecast tests the RAW STRING, and "0" is truthy, so
    // getRunForecastBlockedReason returns null — the fallback string is the
    // only thing that keeps this sentence from reading "...until null".
    const blocked = buildSnapshot(input({
      storedInputs: { remainingBacklog: '0', velocityMean: '43', velocityStdDev: '5' },
    }))
    expect(String(results(blocked).statusReason)).toContain('cannot be re-run until')
    expect(String(results(blocked).statusReason)).not.toContain('undefined')
    expect(String(results(blocked).statusReason)).not.toContain('null')
  })

  it('row 9: an unchanged record is fresh with no reason', () => {
    const b = buildSnapshot(input())
    expect(results(b).status).toBe('fresh')
    expect(results(b).statusReason).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// userSelections — the sixth instance of a recurring defect class.
// ═══════════════════════════════════════════════════════════════════════════

describe('userSelections carries what the selectors DISPLAY', () => {
  const sel = (b: Record<string, unknown>) => b.userSelections as Record<string, unknown>

  it('emits the EFFECTIVE distribution when the stored one is not offered', () => {
    // Enabling only Gamma in Settings puts "Gamma" on screen while the stored
    // cell still says lognormal. The <select> renders value={effectiveDistribution},
    // so lognormal on the wire would be false at the DOM level.
    const b = buildSnapshot(input({ distributionsEnabled: ['gamma'] }))
    expect(sel(b).summaryDistribution).toBe('gamma')
  })

  it('emits the stored distribution when it IS offered', () => {
    const b = buildSnapshot(input({ distributionsEnabled: ['lognormal', 'gamma'] }))
    expect(sel(b).summaryDistribution).toBe('lognormal')
  })

  it('falls back to null scope when the selected milestone completes', () => {
    // Setting a selected milestone's backlogSize to 0 — the app's completion
    // model — puts "Entire Project" on screen while the stored cell still
    // names the milestone.
    const project: Project = {
      ...PROJECT,
      milestones: [{ id: 'm1', name: 'Alpha', backlogSize: 0, createdAt: '', updatedAt: '' }],
    }
    const b = buildSnapshot(input({
      project,
      view: { ...VIEW, summaryScope: 'm1' },
    }))
    expect(sel(b).summaryScope).toBeNull()
  })

  it('emits a milestone INDEX, never the id or the sentinel', () => {
    const project: Project = {
      ...PROJECT,
      milestones: [
        { id: 'm1', name: 'Alpha', backlogSize: 40, createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Beta', backlogSize: 60, createdAt: '', updatedAt: '' },
      ],
    }
    const b = buildSnapshot(input({ project, view: { ...VIEW, summaryScope: 'm2' } }))
    expect(sel(b).summaryScope).toBe(1)
  })

  it('keeps a milestone with showOnChart:false selectable as a summary scope', () => {
    // ForecastSummary filters its scope options on !completed ALONE. Using
    // the two-filter chart helper here would drop this milestone and
    // reproduce the exact defect this reproduction exists to avoid.
    const project: Project = {
      ...PROJECT,
      milestones: [{
        id: 'm1', name: 'Hidden', backlogSize: 40, showOnChart: false,
        createdAt: '', updatedAt: '',
      }],
    }
    const b = buildSnapshot(input({ project, view: { ...VIEW, summaryScope: 'm1' } }))
    expect(sel(b).summaryScope).toBe(0)
  })

  it('emits summaryPercentile raw — the one selector that renders its cell', () => {
    const b = buildSnapshot(input({ view: { ...VIEW, summaryPercentile: 95 } }))
    expect(sel(b).summaryPercentile).toBe(95)
  })

  it('discloses that the headline percentage is not carried', () => {
    const b = buildSnapshot(input())
    const disclosures = (b.notVisibleToYou as string[]).join(' ')
    expect(disclosures).toContain('headline')
    expect(disclosures).toContain('summaryPercentile')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Percentiles, scopes, and the derived facts.
// ═══════════════════════════════════════════════════════════════════════════

describe('percentile grid', () => {
  it('covers the union of every selectable percentile source', () => {
    const b = buildSnapshot(input({
      view: { ...VIEW, selectedResultsPercentiles: [15, 55], customPercentile: 33, customPercentile2: 77, summaryPercentile: 95 },
    }))
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    const byDist = scopes[0].byDistribution as Record<string, { percentiles: Array<{ p: number }> }>
    const ps = byDist.lognormal.percentiles.map((x) => x.p)
    for (const expected of [15, 33, 50, 55, 60, 70, 77, 80, 90, 95]) {
      expect([expected, ps.includes(expected)]).toEqual([expected, true])
    }
  })

  it('reports absoluteSprint as the run-captured last sprint plus the offset', () => {
    const b = buildSnapshot(input())
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    const byDist = scopes[0].byDistribution as Record<string, { percentiles: Array<{ p: number; sprintsFromNow: number; absoluteSprint: number }> }>
    for (const row of byDist.lognormal.percentiles) {
      expect(row.absoluteSprint).toBe(6 + row.sprintsFromNow)
    }
  })

  it('counts saturated trials per DISTRIBUTION, not per scope', () => {
    const r = record()
    r.simData[0].lognormal = [1, 2, 1000, 1000]
    r.simData[0].gamma = [1, 2, 3, 4]
    const b = buildSnapshot(input({ record: r }))
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    const byDist = scopes[0].byDistribution as Record<string, { saturatedTrialCount: number }>
    expect(byDist.lognormal.saturatedTrialCount).toBe(2)
    expect(byDist.gamma.saturatedTrialCount).toBe(0)
  })

  it('computedDistributions comes from the run, never from the visible set', () => {
    const b = buildSnapshot(input({ distributionsEnabled: ['gamma'] }))
    const res = b.results as Record<string, unknown>
    expect(res.computedDistributions).toContain('lognormal')
    expect(res.visibleDistributions).toEqual(['gamma'])
  })

  it('flags modeExcludedDistributions and discloses them', () => {
    // uniform is computed always but is Subjective-mode only.
    const b = buildSnapshot(input())
    const res = b.results as Record<string, unknown>
    expect(res.modeExcludedDistributions).toContain('uniform')
    expect((b.notVisibleToYou as string[]).join(' ')).toContain('modeExcludedDistributions')
  })
})

describe('scopes and milestones', () => {
  const threeMilestones: Project = {
    ...PROJECT,
    milestones: [
      { id: 'm1', name: 'Alpha', backlogSize: 40, createdAt: '', updatedAt: '' },
      { id: 'm2', name: 'Beta', backlogSize: 30, showOnChart: false, createdAt: '', updatedAt: '' },
      { id: 'm3', name: 'Gamma', backlogSize: 30, createdAt: '', updatedAt: '' },
    ],
  }

  function milestoneRecord(): ForecastRunRecord {
    const base = record()
    return {
      ...base,
      runConfig: runConfig({ thresholdsDigest: '40|70|100' }),
      simData: [base.simData[0], base.simData[0], base.simData[0]],
      quadResults: [base.quadResults[0], base.quadResults[0], base.quadResults[0]],
      scopes: [
        { kind: 'milestone', milestoneIndex: 0, label: 'Alpha', cumulativeThreshold: 40, thresholdUnreachable: false },
        { kind: 'milestone', milestoneIndex: 1, label: 'Beta', cumulativeThreshold: 70, thresholdUnreachable: false },
        { kind: 'cumulative-final', milestoneIndex: 2, label: 'Gamma', cumulativeThreshold: 100, thresholdUnreachable: false },
      ],
    }
  }

  it('marks chartedAndIncomplete with the TWO-filter rule', () => {
    const b = buildSnapshot(input({ project: threeMilestones, record: milestoneRecord() }))
    const ms = b.milestones as Array<Record<string, unknown>>
    expect(ms.map((m) => m.chartedAndIncomplete)).toEqual([true, false, true])
    expect(ms.map((m) => m.showOnChart)).toEqual([true, false, true])
  })

  it('marks the SELECTED scope renderedOnScreen even when the chart hides it', () => {
    // The main results table renders the selected scope unconditionally, so
    // a hidden-but-selected milestone is exactly what the user is reading.
    const b = buildSnapshot(input({
      project: threeMilestones,
      record: milestoneRecord(),
      view: { ...VIEW, selectedMilestoneIndex: 1 },
    }))
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    expect(scopes.map((s) => s.renderedOnScreen)).toEqual([true, true, true])
  })

  it('discloses scopes the user is not looking at', () => {
    const b = buildSnapshot(input({
      project: threeMilestones,
      record: milestoneRecord(),
      view: { ...VIEW, selectedMilestoneIndex: 0 },
    }))
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    expect(scopes[1].renderedOnScreen).toBe(false)
    expect((b.notVisibleToYou as string[]).join(' ')).toContain('renderedOnScreen')
  })

  it('collapses to ONE scope when every milestone is complete', () => {
    const allDone: Project = {
      ...PROJECT,
      milestones: threeMilestones.milestones!.map((m) => ({ ...m, backlogSize: 0 })),
    }
    const r = milestoneRecord()
    r.runConfig = runConfig({ thresholdsDigest: '0|0|0' })
    const b = buildSnapshot(input({ project: allDone, record: r }))
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    expect(scopes).toHaveLength(1)
    // The record still holds THREE entries — the collapse is a builder
    // behaviour, so scopes is the only place the 1:1 alignment breaks.
    expect(r.scopes).toHaveLength(3)
    expect(scopes[0].milestoneIndex).toBeNull()
    expect(scopes[0].label).toBe('all milestones complete')
    // The selector's index has no emitted counterpart, so it is null too.
    expect((b.userSelections as Record<string, unknown>).selectedMilestoneIndex).toBeNull()
    expect((b.notVisibleToYou as string[]).join(' ')).toContain('complete')
  })

  it('reports finalScopeCoversBacklog and backlogDivergence together', () => {
    const short = milestoneRecord()
    short.scopes[2].cumulativeThreshold = 80
    short.runConfig = runConfig({ thresholdsDigest: '40|70|80' })
    const projectShort: Project = {
      ...threeMilestones,
      milestones: [
        { id: 'm1', name: 'Alpha', backlogSize: 40, createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Beta', backlogSize: 30, showOnChart: false, createdAt: '', updatedAt: '' },
        { id: 'm3', name: 'Gamma', backlogSize: 10, createdAt: '', updatedAt: '' },
      ],
    }
    const b = buildSnapshot(input({ project: projectShort, record: short }))
    const res = b.results as Record<string, unknown>
    expect(res.finalScopeCoversBacklog).toBe(false)
    expect(res.backlogDivergence).toEqual({
      finalMilestoneThreshold: 80,
      remainingBacklog: 100,
    })
  })
})

describe('productivity adjustments', () => {
  it('evaluates appliesToForecastPeriod for DISABLED ones too', () => {
    const project: Project = {
      ...PROJECT,
      productivityAdjustments: [
        {
          id: 'a1', name: 'Past', startDate: '2020-01-01', endDate: '2020-01-14',
          factor: 0.5, enabled: false,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'a2', name: 'Future', startDate: '2026-06-01', endDate: '2026-06-14',
          factor: 0.5, enabled: false,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    const b = buildSnapshot(input({ project }))
    const adj = b.productivityAdjustments as Array<Record<string, unknown>>
    expect(adj.map((a) => a.enabled)).toEqual([false, false])
    expect(adj.map((a) => a.appliesToForecastPeriod)).toEqual([false, true])
  })
})

describe('the deadline block', () => {
  it('is null with no target date', () => {
    expect(buildSnapshot(input()).deadlineProbability).toBeNull()
  })

  it('is flagged derivedIndependently and disclosed', () => {
    const b = buildSnapshot(input({ view: { ...VIEW, targetDate: '2027-01-31' } }))
    const dp = b.deadlineProbability as Record<string, unknown>
    expect(dp.derivedIndependently).toBe(true)
    expect(dp.targetDate).toBe('2027-01-31')
    expect((b.notVisibleToYou as string[]).join(' ')).toContain('Entire Project')
  })

  it('derives noForecastSprintFinishesByTarget from sprintCount === 0', () => {
    const b = buildSnapshot(input({ view: { ...VIEW, targetDate: '2020-01-01' } }))
    const dp = b.deadlineProbability as Record<string, unknown>
    expect(dp.sprintCount).toBe(0)
    expect(dp.noForecastSprintFinishesByTarget).toBe(true)
  })
})

describe('size reduction (§7.7)', () => {
  it('step 1 drops non-visible grids and sets bodyDegraded', () => {
    // Pick a budget between the full body and the reduced one, so step 1 is
    // enough and step 2 never runs. Measured rather than guessed: a hard-coded
    // budget that happens to fall below both steps would silently assert
    // step 2's behaviour under step 1's name.
    const full = JSON.stringify(
      buildSnapshot(input({ distributionsEnabled: ['lognormal'] }))
    ).length
    const reduced = JSON.stringify(
      buildSnapshot(input({ distributionsEnabled: ['lognormal'], byteBudget: 1 }))
    ).length
    expect(reduced).toBeLessThan(full)

    const b = buildSnapshot(input({
      distributionsEnabled: ['lognormal'],
      byteBudget: full - 1,
    }))
    expect(b.bodyDegraded).toBe(true)
    const scopes = (b.results as Record<string, unknown>).scopes as Array<Record<string, unknown>>
    expect(Object.keys(scopes[0].byDistribution as object)).toEqual(['lognormal'])
  })

  it('step 2 falls back to configuration only, and never skips the write', () => {
    const b = buildSnapshot(input({ byteBudget: 10 }))
    expect(b.bodyDegraded).toBe(true)
    expect((b.results as Record<string, unknown>).status).toBe('unavailable')
    expect(b.projectConfig).toBeDefined()
    expect(b.sprintHistory).toBeUndefined()
  })

  it('a normal project is nowhere near the real budget', () => {
    const bytes = JSON.stringify(buildSnapshot(input())).length
    expect(bytes).toBeLessThan(50_000)
    expect(b_degraded(buildSnapshot(input()))).toBe(false)
  })
})

function b_degraded(b: Record<string, unknown>): boolean {
  return b.bodyDegraded === true
}

describe('the snapshot is honest about what it is', () => {
  it('caps user-authored text', () => {
    const project: Project = { ...PROJECT, name: 'x'.repeat(500) }
    const b = buildSnapshot(input({ project }))
    expect(((b.projectConfig as Record<string, string>).name).length).toBe(200)
  })

  it('reports the app version from the single source', () => {
    const b = buildSnapshot(input())
    expect(b.app).toBe('forecaster')
    expect(typeof b.appVersion).toBe('string')
    expect(b.appVersion).not.toBe('')
  })
})
