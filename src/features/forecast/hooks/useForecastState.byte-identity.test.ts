// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// THE BYTE-IDENTITY GATE for the v0.36.0 forecast state lift.
//
// Release 2 is a refactor: it must change nothing a user sees. The four
// rendered artifacts that carry the numbers are the percentile table, the
// ForecastSummary hero sentence, the milestone scope list, and the burn-up
// series.
//
// Rather than re-deriving four strings and hoping the fixtures match, this
// gate proves the stronger and simpler claim that makes all four hold at
// once: the record retains the WORKER'S OWN objects, and the hook hands those
// same objects — by reference, not by copy — to the render path. Everything
// downstream is a pure function of them, so identity of inputs gives
// byte-identity of output for free.
//
// This is why D29 keeps quadResults on the record instead of recomputing
// percentiles from the raw arrays: recomputation would need an anchor
// decision, and a wrong anchor is exactly how a "pure refactor" changes a
// date on screen.

import { vi } from 'vitest'
vi.mock('./useSimulationWorker', () => ({ useSimulationWorker: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import { useSimulationWorker } from './useSimulationWorker'
import type { QuadForecastResult } from './useSimulationWorker'
import { useForecastState, extractQuadData, extractMilestoneData } from './useForecastState'
import type { QuadMilestoneForecastResult } from '../lib/monte-carlo'

const PROJECT_ID = 'byte-identity-project'

const PERCENTILES = {
  p50: { percentile: 50, finishDate: '2026-02-02', sprintsRequired: 1 },
  p60: { percentile: 60, finishDate: '2026-02-16', sprintsRequired: 2 },
  p70: { percentile: 70, finishDate: '2026-02-16', sprintsRequired: 2 },
  p80: { percentile: 80, finishDate: '2026-03-02', sprintsRequired: 3 },
  p90: { percentile: 90, finishDate: '2026-03-16', sprintsRequired: 4 },
}

function workerResult(): QuadForecastResult {
  // Distinct array instances per distribution so a reference assertion below
  // cannot pass by accident on a shared literal.
  return {
    truncatedNormal: { results: PERCENTILES, sprintsRequired: [1, 2, 3] },
    lognormal: { results: PERCENTILES, sprintsRequired: [1, 2, 3] },
    gamma: { results: PERCENTILES, sprintsRequired: [1, 2, 3] },
    bootstrap: null,
    triangular: { results: PERCENTILES, sprintsRequired: [1, 2, 3] },
    uniform: { results: PERCENTILES, sprintsRequired: [1, 2, 3] },
  }
}

function milestoneWorkerResult(count: number): QuadMilestoneForecastResult {
  const slot = () => ({
    milestoneResults: Array.from({ length: count }, () => ({
      results: PERCENTILES,
      sprintsRequired: [1, 2, 3],
    })),
  })
  return {
    truncatedNormal: slot(), lognormal: slot(), gamma: slot(),
    bootstrap: null, triangular: slot(), uniform: slot(),
  } as unknown as QuadMilestoneForecastResult
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ autoRecalculate: false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [{
      id: PROJECT_ID,
      name: 'Byte Identity',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2 as const,
      firstSprintStartDate: '2026-01-05',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    sprints: [],
    viewingProjectId: PROJECT_ID,
    forecastInputs: {
      [PROJECT_ID]: { remainingBacklog: '100', velocityMean: '20', velocityStdDev: '4' },
    },
    burnUpConfigs: {},
  })
})

describe('the record round-trip is lossless (project scope)', () => {
  it('hands the render path the worker`s own objects, by reference', async () => {
    const raw = workerResult()
    const expected = extractQuadData(raw)
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation: vi.fn().mockResolvedValue(raw),
      runMilestoneSimulation: vi.fn(),
    })

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    // Percentile table + hero sentence read `results`; both are pure
    // functions of it, so reference identity settles both.
    expect(result.current.results).toEqual(expected.results)
    expect(result.current.results!.lognormal).toBe(raw.lognormal.results)
    expect(result.current.results!.truncatedNormal).toBe(raw.truncatedNormal.results)

    // The custom-percentile columns and the CDF read `simulationData`.
    expect(result.current.simulationData!.lognormal).toBe(raw.lognormal.sprintsRequired)

    // The burn-up series reads `overallSimulationData`, which for a project
    // scope run is the same single scope.
    expect(result.current.overallSimulationData).toBe(result.current.simulationData)

    // No milestones ⇒ no per-milestone slice, exactly as before the lift.
    expect(result.current.milestoneResultsState).toBeNull()
    expect(result.current.selectedMilestoneIndex).toBe(0)
  })
})

describe('the record round-trip is lossless (milestone scopes)', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [{
        ...useProjectStore.getState().projects[0],
        milestones: [
          { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#3b82f6', createdAt: '', updatedAt: '' },
          { id: 'm2', name: 'Beta', backlogSize: 30, color: '#10b981', createdAt: '', updatedAt: '' },
          { id: 'm3', name: 'Gamma', backlogSize: 30, color: '#f59e0b', createdAt: '', updatedAt: '' },
        ],
      }],
    })
  })

  it('preserves the per-milestone slices and selects the final scope', async () => {
    const raw = milestoneWorkerResult(3)
    const expected = extractMilestoneData(raw, 3)
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation: vi.fn(),
      runMilestoneSimulation: vi.fn().mockResolvedValue(raw),
    })

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    const ms = result.current.milestoneResultsState!
    expect(ms.milestoneResults).toHaveLength(3)
    expect(ms.milestoneResults).toEqual(expected.perMilestoneResults)
    expect(ms.milestoneSimulationData).toEqual(expected.perMilestoneSimData)

    // A run selects the LAST scope, as it did before the lift.
    expect(result.current.selectedMilestoneIndex).toBe(2)
    expect(result.current.results).toBe(ms.milestoneResults[2])
    expect(result.current.simulationData).toBe(ms.milestoneSimulationData[2])

    // The burn-up series is anchored on the overall (last) scope and does NOT
    // follow the milestone dropdown.
    expect(result.current.overallSimulationData).toBe(ms.milestoneSimulationData[2])
    act(() => { result.current.handleMilestoneIndexChange(0) })
    expect(result.current.overallSimulationData).toBe(ms.milestoneSimulationData[2])
    expect(result.current.simulationData).toBe(ms.milestoneSimulationData[0])
  })

  it('builds the milestone scope list D20 describes: N milestones, N scopes', async () => {
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation: vi.fn(),
      runMilestoneSimulation: vi.fn().mockResolvedValue(milestoneWorkerResult(3)),
    })

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    const scopes = useForecastResultsStore.getState().record!.scopes
    expect(scopes).toHaveLength(3)
    // cumulative-final REPLACES the last milestone entry.
    expect(scopes.map((s) => s.kind)).toEqual(['milestone', 'milestone', 'cumulative-final'])
    expect(scopes.map((s) => s.label)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(scopes.map((s) => s.cumulativeThreshold)).toEqual([40, 70, 100])
    expect(scopes.map((s) => s.milestoneIndex)).toEqual([0, 1, 2])
  })

  it('marks a threshold above the backlog unreachable — and nothing else', async () => {
    // Backlog is 100; make the milestones sum past it.
    useProjectStore.setState({
      projects: [{
        ...useProjectStore.getState().projects[0],
        milestones: [
          { id: 'm1', name: 'Alpha', backlogSize: 60, color: '#3b82f6', createdAt: '', updatedAt: '' },
          { id: 'm2', name: 'Beta', backlogSize: 80, color: '#10b981', createdAt: '', updatedAt: '' },
        ],
      }],
    })
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation: vi.fn(),
      runMilestoneSimulation: vi.fn().mockResolvedValue(milestoneWorkerResult(2)),
    })

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    await act(async () => { await result.current.handleRunForecast() })

    const scopes = useForecastResultsStore.getState().record!.scopes
    expect(scopes.map((s) => s.cumulativeThreshold)).toEqual([60, 140])
    // 60 <= 100 is reachable; 140 > 100 is not. Scope growth plays no part —
    // a trial that exits by completion has crossed every threshold <= backlog
    // regardless of growth rate.
    expect(scopes.map((s) => s.thresholdUnreachable)).toEqual([false, true])
  })
})

describe('results survive an unmount — the reason this release exists', () => {
  it('a remount reads the same record without re-running', async () => {
    const raw = workerResult()
    const runSimulation = vi.fn().mockResolvedValue(raw)
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation,
      runMilestoneSimulation: vi.fn(),
    })

    const first = renderHook(() => useForecastState())
    await waitFor(() => expect(first.result.current.canRun).toBe(true))
    await act(async () => { await first.result.current.handleRunForecast() })
    expect(first.result.current.results).not.toBeNull()

    // Leaving the Forecast tab unmounts the whole subtree. Before the lift
    // this destroyed every result and terminated the worker.
    first.unmount()

    const second = renderHook(() => useForecastState())
    await waitFor(() => expect(second.result.current.results).not.toBeNull())
    expect(second.result.current.results!.lognormal).toBe(raw.lognormal.results)
    // autoRecalculate is off in this fixture, but assert it anyway: a fresh
    // record must render without a re-run.
    expect(runSimulation).toHaveBeenCalledTimes(1)
  })
})
