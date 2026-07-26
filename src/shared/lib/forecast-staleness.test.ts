// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  buildForecastInputSnapshot,
  isRecordStale,
  firstChangedScalar,
  type ForecastSnapshotSource,
} from './forecast-staleness'
import type { Project, Sprint, ProductivityAdjustment } from '@/shared/types'

const BASE_PROJECT: Project = {
  id: 'p1',
  name: 'Test',
  unitOfMeasure: 'points',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function adjustment(over: Partial<ProductivityAdjustment> = {}): ProductivityAdjustment {
  return {
    id: 'a1',
    name: 'Holiday',
    startDate: '2026-06-01',
    endDate: '2026-06-14',
    factor: 0.5,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function source(over: Partial<ForecastSnapshotSource> = {}): ForecastSnapshotSource {
  return {
    project: BASE_PROJECT,
    allSprints: [sprint(1, 20), sprint(2, 22), sprint(3, 18)],
    storedInputs: { remainingBacklog: '100', velocityMean: '', velocityStdDev: '' },
    trialCount: 10000,
    scopeGrowth: { modelScopeGrowth: false, scopeGrowthMode: 'calculated', customScopeGrowth: '' },
    ...over,
  }
}

describe('buildForecastInputSnapshot — the single normalization point', () => {
  it('normalizes an absent scope growth to null, never undefined', () => {
    const snap = buildForecastInputSnapshot(source())
    expect(snap.scopeGrowthPerSprint).toBeNull()
    // The distinction matters: `undefined` is what resolveScopeGrowthPerSprint
    // returns, and undefined !== null under field-by-field comparison.
    expect(Object.hasOwn(snap, 'scopeGrowthPerSprint')).toBe(true)
  })

  it('carries a custom scope growth through unchanged', () => {
    const snap = buildForecastInputSnapshot(
      source({
        scopeGrowth: { modelScopeGrowth: true, scopeGrowthMode: 'custom', customScopeGrowth: '4.25' },
      })
    )
    expect(snap.scopeGrowthPerSprint).toBe(4.25)
  })
})

describe('sentinels for un-runnable states — never NaN', () => {
  // NaN !== NaN, so a NaN anywhere in RunConfig makes the scalar ladder fire
  // on every comparison forever and renders "changed from 240 to NaN" into a
  // user-facing status reason.
  it('an unparseable backlog yields 0, not NaN', () => {
    const snap = buildForecastInputSnapshot(
      source({ storedInputs: { remainingBacklog: 'abc', velocityMean: '', velocityStdDev: '' } })
    )
    expect(snap.remainingBacklog).toBe(0)
    expect(Number.isNaN(snap.remainingBacklog)).toBe(false)
  })

  it('an unparseable velocity override yields 0, not NaN', () => {
    const snap = buildForecastInputSnapshot(
      source({ storedInputs: { remainingBacklog: '10', velocityMean: 'xyz', velocityStdDev: 'xyz' } })
    )
    expect(snap.velocityMean).toBe(0)
    expect(snap.velocityStdDev).toBe(0)
  })

  it('a project with no cadence yields 0, and every field stays comparable', () => {
    const noCadence = { ...BASE_PROJECT, sprintCadenceWeeks: undefined }
    const snap = buildForecastInputSnapshot(source({ project: noCadence as Project }))
    expect(snap.sprintCadenceWeeks).toBe(0)
    // Self-comparison must hold — this is what stops the absent path from
    // reporting a spurious change.
    expect(isRecordStale(snap, buildForecastInputSnapshot(source({ project: noCadence as Project })))).toBe(false)
  })

  it('no project at all still produces a comparable snapshot', () => {
    // readForecastSnapshotSource passes storedInputs: undefined when there is
    // no project to key them by, so mirror that here.
    const snap = buildForecastInputSnapshot(
      source({ project: undefined, allSprints: [], storedInputs: undefined })
    )
    expect(snap.remainingBacklog).toBe(0)
    expect(snap.lastSprintNumber).toBe(0)
    expect(snap.productivityDigest).toBeNull()
  })
})

describe('Gate 2 — the three digests', () => {
  it('productivityDigest reacts to add, edit, and remove', () => {
    const none = buildForecastInputSnapshot(source())
    expect(none.productivityDigest).toBeNull()

    const added = buildForecastInputSnapshot(
      source({ project: { ...BASE_PROJECT, productivityAdjustments: [adjustment()] } })
    )
    expect(added.productivityDigest).not.toBeNull()
    expect(isRecordStale(none, added)).toBe(true)

    const edited = buildForecastInputSnapshot(
      source({ project: { ...BASE_PROJECT, productivityAdjustments: [adjustment({ factor: 0.6 })] } })
    )
    expect(isRecordStale(added, edited)).toBe(true)

    // Removal returns to the empty digest.
    expect(isRecordStale(added, none)).toBe(true)
  })

  it('a DISABLED adjustment is not in the digest', () => {
    const disabled = buildForecastInputSnapshot(
      source({ project: { ...BASE_PROJECT, productivityAdjustments: [adjustment({ enabled: false })] } })
    )
    expect(disabled.productivityDigest).toBeNull()
  })

  it('an adjustment ending BEFORE the forecast start is not in the digest', () => {
    // D18's filter. Such an adjustment cannot affect any forecast sprint, so
    // editing it must not invalidate a record. The forecast anchor here is
    // well after 2020.
    const past = buildForecastInputSnapshot(
      source({
        project: {
          ...BASE_PROJECT,
          productivityAdjustments: [adjustment({ startDate: '2020-01-01', endDate: '2020-01-14' })],
        },
      })
    )
    expect(past.productivityDigest).toBeNull()
  })

  it('includedVelocitiesDigest reacts to an inclusion change under a manual override', () => {
    // With a manual velocity override the effective mean/SD do NOT move when a
    // sprint is excluded, so this digest is the only thing that notices.
    const overridden = { remainingBacklog: '100', velocityMean: '20', velocityStdDev: '4' }
    const all = buildForecastInputSnapshot(source({ storedInputs: overridden }))
    const oneExcluded = buildForecastInputSnapshot(
      source({
        storedInputs: overridden,
        allSprints: [sprint(1, 20), sprint(2, 22), sprint(3, 18, false)],
      })
    )
    expect(all.velocityMean).toBe(oneExcluded.velocityMean)  // the override masks it
    expect(isRecordStale(all, oneExcluded)).toBe(true)       // the digest does not
  })

  it('thresholdsDigest reacts to a milestone backlogSize change', () => {
    const withMs = (size: number) =>
      buildForecastInputSnapshot(
        source({
          project: {
            ...BASE_PROJECT,
            milestones: [
              { id: 'm1', name: 'Alpha', backlogSize: 40, createdAt: '', updatedAt: '' },
              { id: 'm2', name: 'Beta', backlogSize: size, createdAt: '', updatedAt: '' },
            ],
          },
        })
      )
    expect(isRecordStale(withMs(60), withMs(80))).toBe(true)
  })
})

describe('isRecordStale', () => {
  it('a null record is always stale', () => {
    expect(isRecordStale(null, buildForecastInputSnapshot(source()))).toBe(true)
  })

  it('an unchanged snapshot is not stale', () => {
    expect(isRecordStale(buildForecastInputSnapshot(source()), buildForecastInputSnapshot(source()))).toBe(false)
  })

  it('names the first changed scalar for the status reason', () => {
    const before = buildForecastInputSnapshot(source())
    const after = buildForecastInputSnapshot(
      source({ storedInputs: { remainingBacklog: '250', velocityMean: '', velocityStdDev: '' } })
    )
    expect(firstChangedScalar(before, after)).toEqual({
      field: 'remainingBacklog',
      before: 100,
      after: 250,
    })
  })

  it('returns null from firstChangedScalar when only a digest moved', () => {
    const before = buildForecastInputSnapshot(source())
    const after = buildForecastInputSnapshot(
      source({ project: { ...BASE_PROJECT, productivityAdjustments: [adjustment()] } })
    )
    expect(isRecordStale(before, after)).toBe(true)
    expect(firstChangedScalar(before, after)).toBeNull()
  })
})
