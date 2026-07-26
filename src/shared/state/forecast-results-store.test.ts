// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useForecastResultsStore,
  makeViewState,
  selectRecordFor,
  VIEW_STATE_LITERAL_SEEDS,
  type ForecastRunRecord,
} from './forecast-results-store'
import { useProjectStore } from './project-store'
import type { Project, Sprint } from '@/shared/types'
import type { RunConfig } from '@/shared/lib/forecast-staleness'

const SEED = { customPercentile: 85, customPercentile2: 50, selectedResultsPercentiles: [10, 50, 90] }

const RUN_CONFIG: RunConfig = {
  remainingBacklog: 100,
  velocityMean: 20,
  velocityStdDev: 4,
  startDate: '2026-01-05',
  trialCount: 10000,
  sprintCadenceWeeks: 2,
  forecastMode: 'history',
  lastSprintNumber: 3,
  scopeGrowthPerSprint: null,
  includedSprintCount: 3,
  productivityDigest: null,
  includedVelocitiesDigest: '20|22|18',
  thresholdsDigest: '',
}

function record(projectId: string, scopeCount = 1): ForecastRunRecord {
  return {
    projectId,
    runAt: '2026-02-01T10:00:00.000Z',
    runConfig: RUN_CONFIG,
    simData: Array.from({ length: scopeCount }, () => ({
      truncatedNormal: [1, 2, 3], lognormal: [1, 2, 3], gamma: [1, 2, 3],
      bootstrap: null, triangular: [1, 2, 3], uniform: [1, 2, 3],
    })),
    quadResults: Array.from({ length: scopeCount }, () => ({} as never)),
    scopes: Array.from({ length: scopeCount }, (_, i) => ({
      kind: 'milestone' as const,
      milestoneIndex: i,
      label: `M${i}`,
      cumulativeThreshold: 10 * (i + 1),
      thresholdUnreachable: false,
    })),
  }
}

function project(id: string): Project {
  return {
    id,
    name: id,
    unitOfMeasure: 'points',
    sprintCadenceWeeks: 2,
    firstSprintStartDate: '2026-01-05',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [], sprints: [], viewingProjectId: null,
    forecastInputs: {}, burnUpConfigs: {}, _changeLog: [],
  })
})

describe('the record store is NOT persisted', () => {
  it('holds raw trial arrays that must never reach localStorage', () => {
    useForecastResultsStore.getState().publishRecord(record('p1'))
    // Gate 7: no localStorage key holds a runConfig-shaped object. The store
    // is created without `persist`, so nothing it holds can be serialized —
    // which is what keeps the raw sorted trial arrays (D17) off disk.
    const keys = Object.keys(localStorage)
    for (const k of keys) {
      const value = localStorage.getItem(k) ?? ''
      expect(value).not.toContain('includedVelocitiesDigest')
      expect(value).not.toContain('thresholdsDigest')
    }
  })
})

describe('view-state seeds match the former useState initializers', () => {
  it('uses lognormal / 80 / PROJECT_SCOPE', () => {
    // These three MUST equal ForecastSummary's pre-lift initializers, or the
    // byte-identity gate fails on the very first render.
    expect(VIEW_STATE_LITERAL_SEEDS.summaryDistribution).toBe('lognormal')
    expect(VIEW_STATE_LITERAL_SEEDS.summaryPercentile).toBe(80)
    expect(VIEW_STATE_LITERAL_SEEDS.summaryScope).toBe('__project__')
  })

  it('takes the settings-derived cells from the caller-supplied seed', () => {
    const vs = makeViewState(SEED)
    expect(vs.customPercentile).toBe(85)
    expect(vs.customPercentile2).toBe(50)
    expect(vs.selectedResultsPercentiles).toEqual([10, 50, 90])
  })
})

describe('D13 — the record is read only for the resolved project', () => {
  it('returns null for a different project id, and for none', () => {
    useForecastResultsStore.getState().publishRecord(record('p1'))
    const state = useForecastResultsStore.getState()
    expect(selectRecordFor(state, 'p1')).not.toBeNull()
    expect(selectRecordFor(state, 'p2')).toBeNull()
    expect(selectRecordFor(state, undefined)).toBeNull()
  })
})

describe('selectedMilestoneIndex is clamped on write', () => {
  it('never exceeds the live record scope count', () => {
    const store = useForecastResultsStore.getState()
    store.publishRecord(record('p1', 3))
    store.ensureViewState('p1', SEED)

    store.setSelectedMilestoneIndex('p1', 2)
    expect(useForecastResultsStore.getState().viewState.p1.selectedMilestoneIndex).toBe(2)

    // Deleting milestones and re-running shrinks the record; a stale index
    // must not overrun the array it indexes.
    store.publishRecord(record('p1', 2))
    useForecastResultsStore.getState().setSelectedMilestoneIndex('p1', 7)
    expect(useForecastResultsStore.getState().viewState.p1.selectedMilestoneIndex).toBe(1)

    useForecastResultsStore.getState().setSelectedMilestoneIndex('p1', -4)
    expect(useForecastResultsStore.getState().viewState.p1.selectedMilestoneIndex).toBe(0)
  })
})

describe('Gate 5 — per-project view state is isolated', () => {
  it("project A's selections are not visible under project B", () => {
    const store = useForecastResultsStore.getState()
    store.ensureViewState('A', SEED)
    store.ensureViewState('B', SEED)
    store.patchViewState('A', { targetDate: '2027-01-31', summaryPercentile: 95 })

    const vs = useForecastResultsStore.getState().viewState
    expect(vs.A.targetDate).toBe('2027-01-31')
    expect(vs.B.targetDate).toBe('')
    expect(vs.B.summaryPercentile).toBe(80)
  })

  it("survives a collaborator deleting A — B's entry is untouched", () => {
    const store = useForecastResultsStore.getState()
    store.ensureViewState('A', SEED)
    store.ensureViewState('B', SEED)
    store.patchViewState('B', { targetDate: '2027-06-30' })
    store.publishRecord(record('A'))

    store.clearForProject('A')

    const after = useForecastResultsStore.getState()
    expect(after.viewState.A).toBeUndefined()
    expect(after.viewState.B.targetDate).toBe('2027-06-30')
    expect(after.record).toBeNull()
  })

  it('clearForProject keeps a record belonging to a different project', () => {
    const store = useForecastResultsStore.getState()
    store.publishRecord(record('B'))
    store.ensureViewState('A', SEED)
    store.clearForProject('A')
    expect(useForecastResultsStore.getState().record?.projectId).toBe('B')
  })
})

describe('Gate 4 — the five purge sites', () => {
  function seedBoth() {
    useForecastResultsStore.getState().publishRecord(record('p1'))
    useForecastResultsStore.getState().ensureViewState('p1', SEED)
    useForecastResultsStore.getState().patchViewState('p1', { targetDate: '2027-01-31' })
  }

  function expectPurged() {
    const s = useForecastResultsStore.getState()
    expect(s.record).toBeNull()
    expect(s.viewState).toEqual({})
  }

  it('clearProjectsOnSignOut purges BOTH the record and the view-state map', () => {
    // Sign-out and both cloud→local switches all route through this action.
    // The map holds a previous user's target dates and percentile selections
    // on a shared device — the same residue forecastInputs is cleared for.
    seedBoth()
    useProjectStore.setState({ projects: [project('p1')] })
    useProjectStore.getState().clearProjectsOnSignOut()
    expectPurged()
  })

  it('deleteProject purges that project', () => {
    seedBoth()
    useProjectStore.setState({ projects: [project('p1')], viewingProjectId: 'p1' })
    useProjectStore.getState().deleteProject('p1')
    expectPurged()
  })

  it('a full import purges everything', () => {
    seedBoth()
    useProjectStore.getState().importDataAndSelectFirst(
      { version: 1, exportedAt: new Date().toISOString(), projects: [project('new')], sprints: [] as Sprint[] } as never,
      'new'
    )
    expectPurged()
  })

  it('does NOT purge on replaceProjectsFromCloud', () => {
    // A cloud snapshot delivery is not a data-ownership change; wiping a
    // fresh record here would make every snapshot delivery re-run the worker.
    seedBoth()
    useProjectStore.getState().replaceProjectsFromCloud([project('p1')], [])
    const s = useForecastResultsStore.getState()
    expect(s.record).not.toBeNull()
    expect(s.viewState.p1.targetDate).toBe('2027-01-31')
  })

  it('does NOT purge when a consumer merely unmounts', () => {
    seedBoth()
    // Nothing to call — unmount touches no store action. Asserted explicitly
    // because "results survive a tab switch" is the whole point of the lift.
    const s = useForecastResultsStore.getState()
    expect(s.record).not.toBeNull()
    expect(s.viewState.p1).toBeDefined()
  })
})

describe('the store emits nothing to the sync bus', () => {
  it('publishing a record triggers no cloud write', async () => {
    const { syncBus } = await import('@/shared/firebase/sync-bus')
    const listener = vi.fn()
    const unsubscribe = syncBus.subscribe(listener)
    useForecastResultsStore.getState().publishRecord(record('p1'))
    useForecastResultsStore.getState().ensureViewState('p1', SEED)
    useForecastResultsStore.getState().patchViewState('p1', { targetDate: '2027-01-31' })
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
