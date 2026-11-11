// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The mode on screen and the mode a run records are ONE value (v0.50.7).
//
// useForecastState used to resolve the forecast mode with its own copy of the sprint-count
// rule, while the run's recorded config, the staleness comparand and the AI snapshot used
// resolveForecastMode. Both copies agreed until the rule learnt about a standard deviation of
// 0; with two copies, a fix to one would show one mode and record another. These run the
// real hook, the real derivations and the real snapshot builder, with only the worker mocked.

import { vi } from 'vitest'
vi.mock('./useSimulationWorker', () => ({ useSimulationWorker: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import { useSimulationWorker } from './useSimulationWorker'
import type { QuadForecastResult } from './useSimulationWorker'
import { useForecastState } from './useForecastState'
import type { ForecastInputs, Sprint } from '@/shared/types'

const PID = 'mode-project'
const T = '2026-01-01T00:00:00.000Z'

// Two-week sprints from the first sprint start date, Monday to Friday of the second week.
const DATES = [
  ['2026-01-05', '2026-01-16'], ['2026-01-19', '2026-01-30'], ['2026-02-02', '2026-02-13'],
  ['2026-02-16', '2026-02-27'], ['2026-03-02', '2026-03-13'],
] as const

function sprints(velocities: number[]): Sprint[] {
  return velocities.map((doneValue, i) => ({
    id: `s${i + 1}`,
    projectId: PID,
    sprintNumber: i + 1,
    sprintStartDate: DATES[i][0],
    sprintFinishDate: DATES[i][1],
    doneValue,
    includedInForecast: true,
    createdAt: T,
    updatedAt: T,
  }))
}

function seed(velocities: number[], stored: Partial<ForecastInputs> = {}) {
  useSettingsStore.setState({ autoRecalculate: false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [{
      id: PID,
      name: 'Mode',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2 as const,
      firstSprintStartDate: '2026-01-05',
      createdAt: T,
      updatedAt: T,
    }],
    sprints: sprints(velocities),
    viewingProjectId: PID,
    forecastInputs: { [PID]: { remainingBacklog: '100', ...stored } as ForecastInputs },
    burnUpConfigs: {},
  })
}

const slot = {
  results: {
    p50: { percentile: 50, finishDate: '2026-06-01', sprintsRequired: 5 },
    p60: { percentile: 60, finishDate: '2026-06-01', sprintsRequired: 5 },
    p70: { percentile: 70, finishDate: '2026-06-15', sprintsRequired: 6 },
    p80: { percentile: 80, finishDate: '2026-06-15', sprintsRequired: 6 },
    p90: { percentile: 90, finishDate: '2026-06-29', sprintsRequired: 7 },
  },
  sprintsRequired: [5, 6, 7],
}
const workerResult: QuadForecastResult = {
  truncatedNormal: slot, lognormal: slot, gamma: slot, bootstrap: null, triangular: slot, uniform: slot,
}

beforeEach(() => {
  vi.clearAllMocks()
  const runSimulation = vi.fn().mockResolvedValue(workerResult)
  vi.mocked(useSimulationWorker).mockReturnValue({ runSimulation, runMilestoneSimulation: vi.fn() })
})

const snapshotMode = () => readForecastInputSnapshot(useProjectStore.getState().projects[0]).forecastMode

describe('the forecast mode: on screen, and in the snapshot a run records', () => {
  it('5 identical velocities, no stored mode: Subjective in both (known-bads: History on screen; screen and record differ)', () => {
    seed([20, 20, 20, 20, 20])
    const { result } = renderHook(() => useForecastState())
    expect([result.current.forecastMode, snapshotMode()]).toEqual(['subjective', 'subjective'])
  })

  it('5 velocities that vary, no stored mode: History in both (control)', () => {
    seed([18, 20, 22, 19, 21])
    const { result } = renderHook(() => useForecastState())
    expect([result.current.forecastMode, snapshotMode()]).toEqual(['history', 'history'])
  })

  it('a stored History choice is kept at SD 0, in both (control)', () => {
    seed([20, 20, 20, 20, 20], { forecastMode: 'history' })
    const { result } = renderHook(() => useForecastState())
    expect([result.current.forecastMode, snapshotMode()]).toEqual(['history', 'history'])
  })

  it('auto-recalculate runs once, recording Subjective at the mean × the default CV (known-bad: SD 0 recorded)', async () => {
    seed([20, 20, 20, 20, 20])
    useSettingsStore.setState({ autoRecalculate: true })
    renderHook(() => useForecastState())
    await waitFor(() => expect(useForecastResultsStore.getState().record).not.toBeNull())
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    const { runConfig } = useForecastResultsStore.getState().record!
    const { runSimulation } = vi.mocked(useSimulationWorker).mock.results[0].value
    expect([runConfig.forecastMode, runConfig.velocityMean, runConfig.velocityStdDev, runSimulation.mock.calls.length])
      .toEqual(['subjective', 20, 7, 1])
  })
})
