// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The acceptance gates for the v0.36.0 forecast state lift.
//
// GATE 1 IS THE POINT OF THIS FILE. If the code that writes a record's
// runConfig and the code that builds the staleness comparand ever diverge on
// one field, isRecordStale() returns true for a record published a
// millisecond earlier; the auto-recalculate gate then sees a stale record on
// every mount and immediately after every publish, and — because
// autoRecalculate defaults to TRUE — the app runs the Monte Carlo worker in a
// continuous loop in its shipped default configuration.
//
// The obvious version of this test cannot detect that. Building one snapshot,
// publishing a record from it, and comparing the record against that same
// snapshot is a tautology: ForecastInputSnapshot and RunConfig are the same
// shape, so it passes under every implementation including the broken one.
// This gate instead publishes through handleRunForecast — the production
// path — and builds the comparand INDEPENDENTLY afterwards.

import { vi } from 'vitest'
vi.mock('./useSimulationWorker', () => ({ useSimulationWorker: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import { isRecordStale } from '@/shared/lib/forecast-staleness'
import { useSimulationWorker } from './useSimulationWorker'
import type { QuadForecastResult } from './useSimulationWorker'
import { useForecastState } from './useForecastState'

const PROJECT_ID = 'test-project'

const PERCENTILES = {
  p50: { percentile: 50, finishDate: '2026-02-02', sprintsRequired: 1 },
  p60: { percentile: 60, finishDate: '2026-02-16', sprintsRequired: 2 },
  p70: { percentile: 70, finishDate: '2026-02-16', sprintsRequired: 2 },
  p80: { percentile: 80, finishDate: '2026-03-02', sprintsRequired: 3 },
  p90: { percentile: 90, finishDate: '2026-03-02', sprintsRequired: 3 },
}

function fakeWorkerResult(): QuadForecastResult {
  const slot = { results: PERCENTILES, sprintsRequired: [1, 2, 3] }
  return {
    truncatedNormal: slot,
    lognormal: slot,
    gamma: slot,
    bootstrap: null,
    triangular: slot,
    uniform: slot,
  }
}

function seedStores() {
  useSettingsStore.setState({ autoRecalculate: false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [{
      id: PROJECT_ID,
      name: 'Test',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2 as const,
      firstSprintStartDate: '2026-01-05',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    sprints: [],
    viewingProjectId: PROJECT_ID,
    forecastInputs: {
      [PROJECT_ID]: { remainingBacklog: '10', velocityMean: '20', velocityStdDev: '4' },
    },
    burnUpConfigs: {},
  })
}

/**
 * Mock the worker to resolve immediately, with a circuit breaker.
 *
 * EVERY test here needs the breaker, not just the tripwire. A genuine
 * publish/comparand divergence makes the auto-recalculate effect re-fire
 * forever, and with an immediately-resolving worker that loop never yields to
 * a macrotask — so setTimeout and waitFor never get a turn and the whole
 * suite HANGS rather than reporting a failure. Flipping autoRecalculate off
 * after `limit` calls breaks the loop so the assertions run and name the real
 * count.
 */
function mockImmediateWorker(limit = 8) {
  let calls = 0
  const runSimulation = vi.fn().mockImplementation(async () => {
    calls++
    if (calls >= limit) useSettingsStore.setState({ autoRecalculate: false })
    return fakeWorkerResult()
  })
  const runMilestoneSimulation = vi.fn()
  vi.mocked(useSimulationWorker).mockReturnValue({ runSimulation, runMilestoneSimulation })
  return { runSimulation, runMilestoneSimulation, callCount: () => calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  seedStores()
})

describe('Gate 1 — a publish makes its own record fresh, through the real path', () => {
  it('is fresh against an independently-built comparand (scope growth ON)', async () => {
    // useScopeGrowthState initializes modelScopeGrowth: false, so the OFF case
    // below is the DEFAULT. This case must therefore turn it on explicitly, or
    // the two tests are the same test run twice.
    useForecastResultsStore.setState({
      viewState: {
        [PROJECT_ID]: {
          selectedMilestoneIndex: 0,
          customPercentile: 85,
          customPercentile2: 50,
          selectedResultsPercentiles: [10, 50, 90],
          targetDate: '',
          modelScopeGrowth: true,
          scopeGrowthMode: 'custom',
          customScopeGrowth: '3.5',
          summaryDistribution: 'lognormal',
          summaryPercentile: 80,
          summaryScope: '__project__',
        },
      },
    })
    mockImmediateWorker()

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    const record = useForecastResultsStore.getState().record
    expect(record).not.toBeNull()
    expect(record!.runConfig.scopeGrowthPerSprint).toBe(3.5)

    // Built independently, AFTER the publish, from store state alone.
    const comparand = readForecastInputSnapshot(
      useProjectStore.getState().projects[0]
    )
    expect(isRecordStale(record!.runConfig, comparand)).toBe(false)
  })

  it('is fresh with scope growth OFF — the undefined-vs-null case', async () => {
    // resolveScopeGrowthPerSprint returns `undefined` here while RunConfig
    // wants `number | null`. Under field-by-field comparison undefined !== null,
    // so without the single `?? null` normalization inside the builder this
    // record — in the app's most common configuration — is permanently stale.
    mockImmediateWorker()

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    const record = useForecastResultsStore.getState().record
    expect(record).not.toBeNull()
    expect(record!.runConfig.scopeGrowthPerSprint).toBeNull()

    const comparand = readForecastInputSnapshot(
      useProjectStore.getState().projects[0]
    )
    expect(isRecordStale(record!.runConfig, comparand)).toBe(false)
  })

  it('LOOP TRIPWIRE: autoRecalculate on invokes the worker at most once', async () => {
    // Gate 1 above proves ONE publish is self-consistent. This proves the
    // auto-recalculate gate actually closes: a divergence between the publish
    // path and the comparand path shows up here as an unbounded run count.
    useSettingsStore.setState({ autoRecalculate: true })
    const { callCount } = mockImmediateWorker()

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await waitFor(() => expect(useForecastResultsStore.getState().record).not.toBeNull())

    // Let any further effect passes settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 80)) })

    expect(callCount()).toBe(1)
  })

  it('a stale record DOES trigger exactly one re-run', async () => {
    useSettingsStore.setState({ autoRecalculate: true })
    const { callCount } = mockImmediateWorker()

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await waitFor(() => expect(useForecastResultsStore.getState().record).not.toBeNull())
    const firstCount = callCount()

    // Change an input the run config carries.
    act(() => {
      useProjectStore.setState({
        forecastInputs: {
          [PROJECT_ID]: { remainingBacklog: '40', velocityMean: '20', velocityStdDev: '4' },
        },
      })
    })
    await waitFor(
      () => expect(useForecastResultsStore.getState().record?.runConfig.remainingBacklog).toBe(40),
      { timeout: 2000 }
    )
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    expect(callCount()).toBe(firstCount + 1)
  })
})

describe('Gate 6 — a publish is SUPPRESSED when the resolved project changed', () => {
  it('never stamps another project id, and writes no record at all', async () => {
    let resolveRun!: (r: QuadForecastResult) => void
    const pending = new Promise<QuadForecastResult>((r) => { resolveRun = r })
    const runSimulation = vi.fn().mockReturnValue(pending)
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation,
      runMilestoneSimulation: vi.fn(),
    })

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))

    act(() => { void result.current.handleRunForecast() })
    expect(runSimulation).toHaveBeenCalledTimes(1)

    // A collaborator deletes the viewed project mid-run. selectViewingProject
    // falls back to projects[0], so the publish-time resolution now yields a
    // DIFFERENT project.
    act(() => {
      useProjectStore.setState({
        projects: [{
          id: 'other-project',
          name: 'Other',
          unitOfMeasure: 'points',
          sprintCadenceWeeks: 2 as const,
          firstSprintStartDate: '2026-01-05',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
        viewingProjectId: null,
      })
    })

    await act(async () => { resolveRun(fakeWorkerResult()) })

    // Suppressed, not merely un-misattributed: assert the record is ABSENT.
    expect(useForecastResultsStore.getState().record).toBeNull()
  })
})

describe('Gate 3 — isSimulating lifecycle', () => {
  it('is scoped to the running project and survives a switch to another', async () => {
    useForecastResultsStore.getState().setIsSimulating({ projectId: PROJECT_ID, runToken: 7 })
    const { result } = renderHook(() => useForecastState())
    expect(result.current.isSimulating).toBe(true)

    // A different project is not "recomputing" just because this one is.
    act(() => {
      useProjectStore.setState({
        projects: [
          ...useProjectStore.getState().projects,
          {
            id: 'p2',
            name: 'Second',
            unitOfMeasure: 'points',
            sprintCadenceWeeks: 2 as const,
            firstSprintStartDate: '2026-01-05',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        viewingProjectId: 'p2',
      })
    })
    await waitFor(() => expect(result.current.isSimulating).toBe(false))
  })

  it('a late callback from an aborted run cannot clear its replacement flag', () => {
    const store = useForecastResultsStore.getState()
    store.setIsSimulating({ projectId: PROJECT_ID, runToken: 1 })
    store.setIsSimulating({ projectId: PROJECT_ID, runToken: 2 })  // replacement
    store.clearIsSimulatingIfToken(1)                              // aborted run lands late
    expect(useForecastResultsStore.getState().isSimulating).toEqual({
      projectId: PROJECT_ID,
      runToken: 2,
    })
    store.clearIsSimulatingIfToken(2)
    expect(useForecastResultsStore.getState().isSimulating).toBeNull()
  })
})

describe('Trap 5 — changing the milestone index does not republish', () => {
  it('leaves runAt untouched', async () => {
    mockImmediateWorker()
    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    const before = useForecastResultsStore.getState().record!
    act(() => { result.current.handleMilestoneIndexChange(0) })
    const after = useForecastResultsStore.getState().record!

    expect(after.runAt).toBe(before.runAt)
    expect(after).toBe(before)
  })
})
