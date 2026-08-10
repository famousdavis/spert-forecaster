// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// ORACLE — a pinned, behaviour-preserving contract for generateForecastCsv.
//
// WHY THIS EXISTS
// `generateForecastCsv` is cc 50 and is about to be decomposed along its seven
// author-declared `// Section N:` seams. The existing export-csv.test.ts proves
// the tests are strong (93.1% branch coverage); this proves the OUTPUT IS
// UNCHANGED, byte for byte, across a fixture matrix that reaches every section.
//
// It lands BEFORE the refactor so it survives a revert and the regression pass
// stays unconditional either way.
//
// ⚠️ DELIBERATELY NOT A VITEST SNAPSHOT. `vitest -u` regenerates snapshots
// wholesale, which during the refactor would silently absorb the exact
// behaviour change this file exists to catch. Regenerating here is an explicit
// act:
//
//     ORACLE_WRITE=1 npx vitest run src/features/forecast/lib/export-csv-oracle.test.ts
//
// and the resulting diff must be reviewed. If the decomposition makes this file
// need regenerating, the decomposition is wrong.
//
// ⚠️ AN ORACLE PROVES ONLY WHAT IT WAS FALSIFIED AGAINST. Scheduler's Gantt
// parity oracle passed 9 of 9 while pinning NONE of its calendar-dependent
// geometry, and looked fine by inspection the whole time. Every one of the seven
// sections below was perturbed by hand and confirmed to break this oracle before
// the refactor was allowed to start; the fixture that catches each is named in
// the campaign record.
//
// ⚠️ MUST STAY OUT OF `vitest.stryker.config.ts`. That include list is the
// standing mutation scope; adding a file after baseline v3 was recorded would
// give a later comparison more killing power than its own baseline.
//
// Every fixture is fully deterministic: fixed dates, fixed counts, no RNG.
// ===========================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateForecastCsv } from './export-csv'
import type { PercentileResults } from './monte-carlo'

const ORACLE_PATH = resolve(process.cwd(), 'src/features/forecast/lib/export-csv-oracle.json')

function pr(base: number): PercentileResults {
  return {
    p50: { percentile: 50, sprintsRequired: base, finishDate: '2024-03-01' },
    p60: { percentile: 60, sprintsRequired: base + 1, finishDate: '2024-03-15' },
    p70: { percentile: 70, sprintsRequired: base + 2, finishDate: '2024-03-29' },
    p80: { percentile: 80, sprintsRequired: base + 3, finishDate: '2024-04-12' },
    p90: { percentile: 90, sprintsRequired: base + 4, finishDate: '2024-04-26' },
  }
}

const TRIALS = [4, 5, 5, 6, 7, 5, 8, 4, 6, 5]

/** Base config; every fixture overrides from here so drift is visible in one place. */
function baseConfig() {
  return {
    projectName: 'Oracle "Quoted" Project',
    remainingBacklog: 100,
    velocityMean: 20,
    velocityStdDev: 5,
    startDate: '2024-01-01',
    sprintCadenceWeeks: 2,
    trialCount: TRIALS.length,
  }
}

function baseData() {
  return {
    config: baseConfig(),
    truncatedNormalResults: pr(5),
    lognormalResults: pr(6),
    gammaResults: pr(7),
    bootstrapResults: null,
    triangularResults: pr(8),
    uniformResults: pr(9),
    truncatedNormalSprintsRequired: TRIALS,
    lognormalSprintsRequired: TRIALS.map((t) => t + 1),
    gammaSprintsRequired: TRIALS.map((t) => t + 2),
    bootstrapSprintsRequired: null,
    triangularSprintsRequired: TRIALS.map((t) => t + 3),
    uniformSprintsRequired: TRIALS.map((t) => t + 4),
  }
}

const MILESTONES = [
  { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#3b82f6', createdAt: '', updatedAt: '' },
  { id: 'm2', name: 'Beta, "quoted"', backlogSize: 60, color: '#10b981', createdAt: '', updatedAt: '' },
]

function milestoneData(withBootstrap: boolean) {
  return {
    milestones: [
      { name: 'Alpha', backlogSize: 40, cumulativeBacklog: 40 },
      { name: 'Beta, "quoted"', backlogSize: 60, cumulativeBacklog: 100 },
    ],
    distributions: {
      truncatedNormal: [pr(2), pr(5)],
      lognormal: [pr(3), pr(6)],
      gamma: [pr(4), pr(7)],
      bootstrap: withBootstrap ? [pr(1), pr(4)] : null,
      triangular: [pr(5), pr(8)],
      uniform: [pr(6), pr(9)],
    },
  }
}

// ── The fixture matrix ─────────────────────────────────────────────────────
// Each entry names the sections it is the PRIMARY witness for. Section letters
// match the seam costing in the campaign record:
//   A Parameters · B Adjustments · C Milestones · D Percentiles
//   E Per-milestone · F Frequency · G Raw Trials
type Fixture = Parameters<typeof generateForecastCsv>[0]
const CASES: Record<string, Fixture> = {
  // A(history branch) · B(empty) · C(absent) · D(no bootstrap) · F · G
  'minimal history mode': baseData(),

  // A(subjective branch — every optional config field present)
  'subjective mode with all optional config': {
    ...baseData(),
    config: {
      ...baseConfig(),
      forecastMode: 'subjective',
      velocityEstimate: 18,
      selectedCV: 0.25,
      volatilityMultiplier: 1.5,
      scopeGrowthPerSprint: 3,
    },
  },

  // B(populated, with and without a reason; comma and quote in the name)
  'productivity adjustments present': {
    ...baseData(),
    config: {
      ...baseConfig(),
      productivityAdjustments: [
        { id: 'a1', name: 'Holiday, winter', startDate: '2024-02-01', endDate: '2024-02-05', factor: 0.5, reason: 'Company "shutdown"', enabled: true, createdAt: '', updatedAt: '' },
        { id: 'a2', name: 'Onboarding', startDate: '2024-03-01', endDate: '2024-03-10', factor: 0.75, enabled: true, createdAt: '', updatedAt: '' },
      ],
    },
  },

  // C(populated) but NO milestoneData — proves C and E are independent
  'config milestones without per-milestone results': {
    ...baseData(),
    config: { ...baseConfig(), milestones: MILESTONES },
  },

  // D · F · G bootstrap branches, plus E with bootstrap
  'full with bootstrap and per-milestone results': {
    ...baseData(),
    config: { ...baseConfig(), milestones: MILESTONES },
    bootstrapResults: pr(4),
    bootstrapSprintsRequired: TRIALS.map((t) => t - 1),
    milestoneData: milestoneData(true),
  },

  // E without bootstrap — the `hasBootstrap && bsResults` branch, other side
  'per-milestone results without bootstrap': {
    ...baseData(),
    config: { ...baseConfig(), milestones: MILESTONES },
    milestoneData: milestoneData(false),
  },
}

describe('generateForecastCsv — pinned output oracle', () => {
  const actual: Record<string, string> = {}
  for (const [name, data] of Object.entries(CASES)) actual[name] = generateForecastCsv(data)

  if (process.env.ORACLE_WRITE === '1') {
    writeFileSync(ORACLE_PATH, JSON.stringify(actual, null, 2) + '\n')
  }

  it('the oracle file exists and covers every fixture', () => {
    expect(existsSync(ORACLE_PATH)).toBe(true)
    const expected = JSON.parse(readFileSync(ORACLE_PATH, 'utf8')) as Record<string, string>
    // Guards against a fixture being added without regenerating, and against one
    // being silently dropped — either would quietly shrink the contract.
    expect(Object.keys(expected).sort()).toEqual(Object.keys(actual).sort())
  })

  it('the matrix is the expected size', () => {
    // Tripwire on the fixture set itself: if this number changes, the change was
    // either deliberate (update it) or an accident (find out why).
    expect(Object.keys(CASES).length).toBe(6)
  })

  it('every fixture produces non-trivial output', () => {
    // ⚠️ Without this, a generateForecastCsv that returned '' would be pinned as
    // '' and the oracle would agree with itself forever.
    for (const [name, csv] of Object.entries(actual)) {
      expect(csv.length, name).toBeGreaterThan(400)
    }
  })

  const expected = JSON.parse(readFileSync(ORACLE_PATH, 'utf8')) as Record<string, string>
  for (const name of Object.keys(CASES)) {
    it(`matches the pinned output: ${name}`, () => {
      expect(actual[name]).toBe(expected[name])
    })
  }
})
