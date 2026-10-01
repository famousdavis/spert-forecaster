// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { buildSnapshot, type SnapshotInput } from './build-snapshot'
import { sanitizeForFirestore } from '@/shared/firebase/firestore-sanitize'
import type { Project, Sprint } from '@/shared/types'
import type { ForecastRunRecord, ForecastScope, ForecastViewState } from '@/shared/state/forecast-results-store'
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

/**
 * Two-week cadence from Monday 2026-01-05, finishing the Friday of week two.
 * The date fields are REQUIRED on Sprint and this factory used to omit them —
 * it was annotated `: Sprint` and returned something that was not one, which
 * neither `npm test` nor `next build` could see.
 */
function sprint(n: number, doneValue: number, included = true): Sprint {
  const dayOffset = (n - 1) * 14
  const iso = (d: number) => new Date(Date.UTC(2026, 0, 5 + d)).toISOString().slice(0, 10)
  return {
    id: `s${n}`,
    projectId: 'p1',
    sprintNumber: n,
    sprintStartDate: iso(dayOffset),
    sprintFinishDate: iso(dayOffset + 11),
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
      milestones: [{ id: 'm1', name: 'Alpha', backlogSize: 60, color: '#3b82f6', createdAt: '', updatedAt: '' }],
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
      milestones: [{ id: 'm1', name: 'Alpha', backlogSize: 0, color: '#10b981', createdAt: '', updatedAt: '' }],
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
        { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#f59e0b', createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Beta', backlogSize: 60, color: '#3b82f6', createdAt: '', updatedAt: '' },
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
        color: '#3b82f6',
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
      { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#10b981', createdAt: '', updatedAt: '' },
      { id: 'm2', name: 'Beta', backlogSize: 30, showOnChart: false, color: '#f59e0b', createdAt: '', updatedAt: '' },
      { id: 'm3', name: 'Gamma', backlogSize: 30, color: '#3b82f6', createdAt: '', updatedAt: '' },
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
        { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#10b981', createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Beta', backlogSize: 30, showOnChart: false, color: '#f59e0b', createdAt: '', updatedAt: '' },
        { id: 'm3', name: 'Gamma', backlogSize: 10, color: '#3b82f6', createdAt: '', updatedAt: '' },
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

// ═══════════════════════════════════════════════════════════════════════════
// The truncation disclosure.
//
// ⚠️ THIS SHIPS WITH THE FIX, NOT AFTER IT, AND THAT IS THE POINT.
// The old disclosure said "The velocity statistics cover all of them" while
// calculateVelocityStats filters on includedInForecast — so the statistics
// cover the INCLUDED subset. A test written against the previous behaviour
// would have pinned a false statement into notVisibleToYou, which is the array
// whose whole purpose is telling an AI the limits of its own information.
// The behaviour was established by investigation first; only then was it
// pinned.
//
// The fixture below is the reproduction: MORE than MAX_SNAPSHOT_SPRINTS
// sprints, AND some excluded. Both are required — with nothing excluded the
// old sentence was accidentally true.
// ═══════════════════════════════════════════════════════════════════════════

/** 70 sprints, every 5th excluded from the forecast → 56 included, 70 total. */
const TRUNCATION_SPRINTS: Sprint[] = Array.from({ length: 70 }, (_, i) =>
  sprint(i + 1, 40 + (i % 7), (i + 1) % 5 !== 0)
)

describe('truncation disclosure — the velocity-statistics denominator', () => {
  const b = buildSnapshot(input({ allSprints: TRUNCATION_SPRINTS }))
  const history = b.sprintHistory as Record<string, unknown>
  const disclosures = (b.notVisibleToYou as string[]).join(' ')

  it('the fixture actually truncates AND actually excludes — otherwise this suite proves nothing', () => {
    // Guard on the fixture itself. If MAX_SNAPSHOT_SPRINTS rises above 70 this
    // fails loudly rather than silently testing the untruncated path.
    expect(history.sprintsTruncated).not.toBeNull()
    expect(history.totalSprintCount).toBe(70)
    expect(history.includedSprintCount).toBe(56)
    expect(history.includedSprintCount).not.toBe(history.totalSprintCount)
  })

  it('⚠️ NEVER claims the velocity statistics cover every sprint — the defect this replaces', () => {
    expect(disclosures).not.toContain('cover all of them')
    expect(disclosures).not.toMatch(/statistics cover all/i)
  })

  it('states the denominator by NAMING the field rather than restating a number', () => {
    // The drift-proof property. Prose that restates a value can disagree with
    // that value; prose that names the field cannot. The old sentence
    // interpolated its own counts and drifted; this one points at the data.
    expect(disclosures).toContain('velocityStats.count')
    expect(disclosures).toContain('includedSprintCount')
    expect(disclosures).toContain('sprintsTruncated.shown')
    expect(disclosures).toContain('sprintsTruncated.total')
  })

  it('the field it names carries the true denominator, so the pointer resolves', () => {
    // Without this the disclosure could name a field that says something else
    // — the same class of error one indirection further out.
    const stats = history.velocityStats as Record<string, number>
    expect(stats.count).toBe(history.includedSprintCount)
    expect(stats.count).toBe(56)
  })

  it('sprintsTruncated carries numbers only — one owner per fact', () => {
    // The root cause was one fact stated twice in two fields, which then
    // drifted. Numbers live here; the prose lives in notVisibleToYou.
    expect(history.sprintsTruncated).toEqual({ shown: 60, total: 70 })
    expect(history.sprintsTruncated).not.toHaveProperty('note')
  })

  it('says nothing about truncation when nothing is truncated', () => {
    const small = buildSnapshot(input())
    expect((small.sprintHistory as Record<string, unknown>).sprintsTruncated).toBeNull()
    expect((small.notVisibleToYou as string[]).join(' ')).not.toContain('sprintsTruncated.shown')
  })
})

describe('every notVisibleToYou entry is a claim that could be checked', () => {
  it('makes no appeal to how the app has "always" behaved', () => {
    // ⚠️ A claim no mechanism can falsify does not belong in a trust channel.
    // "This is how the app has always behaved" named no version and no
    // pinnable behaviour: not shown false, and never showable true. The
    // checkable half — that the recomputation belongs to the forecast summary
    // rather than to this connection — is kept below.
    const disclosures = (buildSnapshot(input()).notVisibleToYou as string[]).join(' ')
    expect(disclosures).not.toMatch(/has always behaved|always been/i)
  })

  it('still locates the live-recompute behaviour, which is the checkable part', () => {
    const disclosures = (buildSnapshot(input()).notVisibleToYou as string[]).join(' ')
    expect(disclosures).toContain('recomputes some percentile dates live')
    expect(disclosures).toContain('not of this connection')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ THE TEST THE OTHERS CANNOT BE.
//
// Every assertion above pins the PRESENCE of a string. None can tell whether
// the string is TRUE — they would pass just as happily on a false sentence as
// a true one, because they catch deletion, not wrongness. That limit is real
// and it is why the first replacement sentence shipped false: it named every
// field correctly, satisfied every naming assertion, and still asserted a
// relation ("the velocity statistics are NOT computed over all of them") that
// is false whenever nothing is excluded.
//
// `sprintsTruncated` is a PURE COUNT TEST — `ordered.length > shown.length`,
// exclusions play no part. So truncation has two worlds, and the disclosure
// has to be true in both:
//
//   A. 61 sprints, ZERO excluded → includedSprintCount === totalSprintCount,
//      and the statistics DO cover every sprint. Exclusion is opt-in, so this
//      is arguably the default.
//   B. 61 sprints, some excluded → they do not.
//
// English truth is not mechanically checkable. What IS checkable: the sentence
// must be byte-identical across both worlds (a data-dependent claim could not
// be), and the numeric relations it points at must hold in whichever world is
// under test.
// ═══════════════════════════════════════════════════════════════════════════

describe('the truncation disclosure is true in BOTH worlds, not just the excluded one', () => {
  const noneExcluded: Sprint[] = Array.from({ length: 61 }, (_, i) =>
    sprint(i + 1, 40 + (i % 7), true)
  )
  const someExcluded: Sprint[] = Array.from({ length: 61 }, (_, i) =>
    sprint(i + 1, 40 + (i % 7), (i + 1) % 5 !== 0)
  )

  const worldA = buildSnapshot(input({ allSprints: noneExcluded }))
  const worldB = buildSnapshot(input({ allSprints: someExcluded }))
  const truncationLine = (b: Record<string, unknown>) =>
    (b.notVisibleToYou as string[]).find((s) => s.includes('sprintsTruncated.shown'))

  it('world A really is the zero-exclusion case, and still truncates', () => {
    const h = worldA.sprintHistory as Record<string, number | object | null>
    expect(h.sprintsTruncated).toEqual({ shown: 60, total: 61 })
    expect(h.includedSprintCount).toBe(61)
    expect(h.totalSprintCount).toBe(61)
    expect((h.velocityStats as Record<string, number>).count).toBe(61)
  })

  it('world B really does exclude some, and still truncates', () => {
    const h = worldB.sprintHistory as Record<string, number | object | null>
    expect(h.sprintsTruncated).toEqual({ shown: 60, total: 61 })
    expect(h.includedSprintCount).toBe(49)
    expect(h.totalSprintCount).toBe(61)
    expect((h.velocityStats as Record<string, number>).count).toBe(49)
  })

  it('⚠️ emits the SAME sentence in both — a data-dependent claim could not', () => {
    // The load-bearing assertion. A sentence whose truth depends on the
    // exclusion count would have to differ between these two snapshots to stay
    // true in both; one that is purely descriptive does not.
    expect(truncationLine(worldA)).toBe(truncationLine(worldB))
    expect(truncationLine(worldA)).toBeTruthy()
  })

  it('⚠️ never asserts that the statistics exclude anything, because sometimes they do not', () => {
    // World A is the counter-example the first replacement missed: with nothing
    // excluded, velocityStats.count === totalSprintCount and any claim to the
    // contrary is false.
    const a = worldA.notVisibleToYou as string[]
    const h = worldA.sprintHistory as Record<string, number>
    expect((h.velocityStats as unknown as Record<string, number>).count).toBe(h.totalSprintCount)
    expect(a.join(' ')).not.toMatch(/NOT computed over all|not computed over all/i)
    expect(a.join(' ')).not.toMatch(/cover all of them/i)
  })

  it('states only what is true by construction: count equals includedSprintCount', () => {
    // This relation holds in every world — calculateVelocityStats filters on
    // includedInForecast, so it is true by construction rather than by data.
    for (const b of [worldA, worldB]) {
      const h = b.sprintHistory as Record<string, number>
      expect((h.velocityStats as unknown as Record<string, number>).count).toBe(h.includedSprintCount)
    }
    expect(truncationLine(worldA)).toContain('equals')
    expect(truncationLine(worldA)).toContain('includedSprintCount')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// THE RUN-VERSUS-LIVE ANCHOR, AND THE TRUNCATION DIRECTION.
//
// Three behaviours that Item 4's perturbation pass found unpinned. Each is a
// deliberate design documented at its site; each was VERIFIED correct before
// being pinned, because one survivor in that pass turned out to be a defect and
// a test written against a wrong behaviour makes it permanent.
//
// What was verified, not assumed:
//   · the anchor must come from the RUN — dates derived from a different start
//     date mis-date every result in the snapshot;
//   · hasBootstrap must follow the RUN — a run below the 5-sprint threshold has
//     no bootstrap column, and live having since crossed it would advertise a
//     distribution the data does not contain;
//   · truncation must keep the NEWEST sprints — recent velocity is what a
//     forecast depends on, and the disclosure says "most recent".
//
// ⚠️ A fourth survivor from that pass, "truncation happens but is not
// disclosed", is already dead: three of the v0.39.1 disclosure tests fail on it.
// Closed as a side effect of fixing the defect beside it, not by this file.
// ═══════════════════════════════════════════════════════════════════════════

describe('the anchor is the run’s, not the live one', () => {
  // A date no live derivation could produce from PROJECT + SPRINTS, so the
  // assertion discriminates rather than coinciding.
  const RUN_START = '2027-03-15'

  it('reports the run’s start date when a record exists', () => {
    const b = buildSnapshot(input({ record: record({ runConfig: runConfig({ startDate: RUN_START }) }) }))
    const fc = b.forecastInputs as Record<string, unknown>
    expect(fc.forecastStartDate).toBe(RUN_START)
  })

  it('⚠️ labels the source truthfully — the label must match where the value came from', () => {
    // forecastStartDateSource is a CLAIM about provenance. If the anchor logic
    // changed and the label did not, the snapshot would say "run-captured" over
    // a live date — a false statement about its own data, the shape v0.39.1 was
    // about. Pin the pair, never the label alone.
    const withRun = buildSnapshot(input({ record: record({ runConfig: runConfig({ startDate: RUN_START }) }) }))
    const fcRun = withRun.forecastInputs as Record<string, unknown>
    expect(fcRun.forecastStartDateSource).toBe('run-captured')
    expect(fcRun.forecastStartDate).toBe(RUN_START)

    const noRun = buildSnapshot(input({ record: null }))
    const fcLive = noRun.forecastInputs as Record<string, unknown>
    expect(fcLive.forecastStartDateSource).toBe('live')
    // Whatever live is, it must NOT be the run's — otherwise the two branches
    // are indistinguishable and this test proves nothing.
    expect(fcLive.forecastStartDate).not.toBe(RUN_START)
  })
})

describe('hasBootstrap follows the run, not live sprint data', () => {
  const visible = (b: Record<string, unknown>) =>
    ((b.results as Record<string, unknown>).visibleDistributions as string[]) ?? []

  it('withholds bootstrap when the RUN was below the threshold, though live is above it', () => {
    // Live: 6 included sprints, comfortably over MIN_SPRINTS_FOR_BOOTSTRAP.
    // Run: 2. The run wins, so bootstrap is not offered.
    const b = buildSnapshot(input({ record: record({ runConfig: runConfig({ includedSprintCount: 2 }) }) }))
    expect(visible(b)).not.toContain('bootstrap')
  })

  it('offers bootstrap when the RUN was above the threshold, though live is below it', () => {
    // The converse, and it is what makes the pair prove "follows the run"
    // rather than merely "is not live in one direction".
    const twoSprints = [1, 2].map((n) => sprint(n, 40 + n))
    const b = buildSnapshot(
      input({
        allSprints: twoSprints,
        record: record({ runConfig: runConfig({ includedSprintCount: 6 }) }),
      })
    )
    expect(visible(b)).toContain('bootstrap')
  })
})

describe('truncation keeps the newest sprints, not the oldest', () => {
  it('carries the most recent MAX_SNAPSHOT_SPRINTS, and the disclosure says so truthfully', () => {
    // 70 sprints, cap 60 → numbers 11…70. Keeping the oldest would give 1…60,
    // and every velocity figure in the snapshot would describe ancient history
    // while the prose claimed "most recent".
    const many = Array.from({ length: 70 }, (_, i) => sprint(i + 1, 40 + (i % 7)))
    const b = buildSnapshot(input({ allSprints: many }))
    const history = b.sprintHistory as Record<string, unknown>
    const carried = history.sprints as Array<{ sprintNumber: number }>

    expect(carried).toHaveLength(60)
    expect(carried[0].sprintNumber).toBe(11)
    expect(carried[carried.length - 1].sprintNumber).toBe(70)
    expect(history.totalSprintCount).toBe(70)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// v0.44.1 — "Entire Project" reads the overall scope, and the divergence
// fields are facts about the MILESTONES.
// ═══════════════════════════════════════════════════════════════════════════

type ScopeSpec = { threshold: number; kind?: ForecastScope['kind'] }

/** A record whose scopes are given explicitly; the last may be a project scope. */
function scopedRecord(specs: ScopeSpec[], backlog: number): ForecastRunRecord {
  const base = record()
  const scopes: ForecastScope[] = specs.map((sp, i) => sp.kind === 'project'
    ? { kind: 'project', milestoneIndex: null, label: 'Mobile App Launch', cumulativeThreshold: sp.threshold, thresholdUnreachable: false }
    : { kind: sp.kind ?? 'milestone', milestoneIndex: i, label: `M${i}`, cumulativeThreshold: sp.threshold, thresholdUnreachable: false })
  return {
    ...base,
    runConfig: runConfig({ remainingBacklog: backlog }),
    simData: scopes.map(() => base.simData[0]),
    quadResults: scopes.map(() => base.quadResults[0]),
    scopes,
  }
}

function withMilestones(sizes: number[], hidden: number[] = []): Project {
  return {
    ...PROJECT,
    milestones: sizes.map((backlogSize, i) => ({
      id: `m${i}`, name: `M${i}`, backlogSize, color: '#10b981',
      showOnChart: !hidden.includes(i), createdAt: '', updatedAt: '',
    })),
  }
}

const resultsOf = (b: Record<string, unknown>) => b.results as Record<string, unknown>
const scopesOf = (b: Record<string, unknown>) => resultsOf(b).scopes as Array<Record<string, unknown>>
const disclosuresOf = (b: Record<string, unknown>) => (b.notVisibleToYou as string[]).join(' ')

describe('the divergence fields are facts about the milestones, through the shared allowance', () => {
  it('reads the MILESTONE scopes, never the last scope', () => {
    // When milestones fall short of the backlog, the last scope can be the
    // project's own, whose threshold IS the backlog. Reading the last scope
    // would then always report "covers" — and hide exactly the shortfall
    // these fields exist to report.
    const b = buildSnapshot(input({
      project: withMilestones([40, 20]),
      record: scopedRecord([{ threshold: 40 }, { threshold: 60 }, { threshold: 100, kind: 'project' }], 100),
    }))
    expect(resultsOf(b).finalScopeCoversBacklog).toBe(false)
    expect(resultsOf(b).backlogDivergence).toEqual({ finalMilestoneThreshold: 60, remainingBacklog: 100 })
  })

  it('Story Map rounding is not a divergence: 0.13 + 0.13 against 0.25', () => {
    const b = buildSnapshot(input({
      project: withMilestones([0.13, 0.13]),
      record: scopedRecord([{ threshold: 0.13 }, { threshold: 0.26, kind: 'cumulative-final' }], 0.25),
    }))
    expect(resultsOf(b).finalScopeCoversBacklog).toBe(true)
    expect(resultsOf(b).backlogDivergence).toBeNull()
  })

  it('float noise is not a divergence: 0.1 + 0.2 against 0.3', () => {
    const b = buildSnapshot(input({
      project: withMilestones([0.1, 0.2]),
      record: scopedRecord([{ threshold: 0.1 }, { threshold: 0.1 + 0.2, kind: 'cumulative-final' }], 0.3),
    }))
    expect(resultsOf(b).backlogDivergence).toBeNull()
  })

  it('milestones past the backlog still cover it, and still diverge from it', () => {
    const b = buildSnapshot(input({
      project: withMilestones([60, 80]),
      record: scopedRecord([{ threshold: 60 }, { threshold: 140, kind: 'cumulative-final' }], 100),
    }))
    expect(resultsOf(b).finalScopeCoversBacklog).toBe(true)
    expect(resultsOf(b).backlogDivergence).toEqual({ finalMilestoneThreshold: 140, remainingBacklog: 100 })
  })

  it('a run with no milestones covers its own backlog', () => {
    const b = buildSnapshot(input())
    expect(resultsOf(b).finalScopeCoversBacklog).toBe(true)
    expect(resultsOf(b).backlogDivergence).toBeNull()
  })
})

describe('renderedOnScreen follows what the screen reads', () => {
  const D20 = [{ threshold: 40 }, { threshold: 70 }, { threshold: 100, kind: 'cumulative-final' as const }]

  it('the overall scope is rendered whenever the summary shows Entire Project', () => {
    // Last milestone hidden from charts and not selected: before v0.44.1 that
    // marked the scope the forecast summary shows as not on screen.
    const b = buildSnapshot(input({
      project: withMilestones([40, 30, 30], [2]),
      record: scopedRecord(D20, 100),
      view: { ...VIEW, selectedMilestoneIndex: 0, summaryScope: '__project__' },
    }))
    expect(scopesOf(b)[2].renderedOnScreen).toBe(true)
  })

  it('a hidden milestone the summary is set to is rendered', () => {
    const b = buildSnapshot(input({
      project: withMilestones([40, 30, 30], [1]),
      record: scopedRecord(D20, 100),
      view: { ...VIEW, selectedMilestoneIndex: 0, summaryScope: 'm1' },
    }))
    expect(scopesOf(b)[1].renderedOnScreen).toBe(true)
  })

  it('with every milestone hidden, the results table shows the overall scope', () => {
    const b = buildSnapshot(input({
      project: withMilestones([40, 30, 30], [0, 1, 2]),
      record: scopedRecord(D20, 100),
      view: { ...VIEW, selectedMilestoneIndex: 1, summaryScope: 'm0' },
    }))
    expect(scopesOf(b).map((sc) => sc.renderedOnScreen)).toEqual([true, true, true])
  })

  it('a scope nothing shows is still marked off screen', () => {
    const b = buildSnapshot(input({
      project: withMilestones([40, 30, 30], [1]),
      record: scopedRecord(D20, 100),
      view: { ...VIEW, selectedMilestoneIndex: 0, summaryScope: '__project__' },
    }))
    expect(scopesOf(b)[1].renderedOnScreen).toBe(false)
  })
})

describe('notVisibleToYou says nothing the v0.44.1 screen makes false', () => {
  it('the deadline note no longer claims the panel receives a swapped series', () => {
    const b = buildSnapshot(input({ view: { ...VIEW, targetDate: '2027-01-31' } }))
    expect(disclosuresOf(b)).not.toMatch(/swapped/)
    // Still names the scope the block describes.
    expect(disclosuresOf(b)).toContain('Entire Project')
  })

  it('the all-complete note does not promise sprint 1', () => {
    // A zero threshold is reached once delivered work has kept pace with any
    // modelled scope growth — sprint 1 only when growth is not modelled.
    const b = buildSnapshot(input({
      project: withMilestones([0, 0]),
      record: scopedRecord([{ threshold: 0 }, { threshold: 0, kind: 'cumulative-final' }], 100),
    }))
    expect(scopesOf(b)).toHaveLength(1)
    expect(disclosuresOf(b)).not.toMatch(/resolve at the first sprint/)
    expect(disclosuresOf(b)).toMatch(/scope growth/)
  })
})
