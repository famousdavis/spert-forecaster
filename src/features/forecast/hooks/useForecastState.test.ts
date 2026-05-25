// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Module-mock the simulation worker so tests control resolution timing.
// Specifier MUST match useForecastState.ts:25 exactly (same directory, relative).
import { vi } from 'vitest'
vi.mock('./useSimulationWorker', () => ({ useSimulationWorker: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { bumpSimulationGeneration } from '../lib/simulation-generation'
import { useSimulationWorker } from './useSimulationWorker'
import type { QuadForecastResult } from './useSimulationWorker'
import { useForecastState } from './useForecastState'

const PROJECT_ID = 'test-project'

beforeEach(() => {
  // autoRecalculate: false prevents the auto-recalc effect from consuming the
  // pending promise before the explicit handleRunForecast() call. We want
  // exactly ONE in-flight simulation under our control.
  useSettingsStore.setState({ autoRecalculate: false })

  // canRun prerequisites: sprintCadenceWeeks, firstSprintStartDate,
  // remainingBacklog parseable > 0, effectiveMean > 0.
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
      [PROJECT_ID]: {
        remainingBacklog: '10',  // parseable > 0
        velocityMean: '20',      // effectiveMean = 20 > 0
        velocityStdDev: '4',
      },
    },
    burnUpConfigs: {},
  })
})

describe('handleRunForecast — generation guard (G1)', () => {
  it('discards simulation results when generation is bumped while in flight', async () => {
    let resolveSimulation!: (r: QuadForecastResult) => void
    const pendingPromise = new Promise<QuadForecastResult>((resolve) => {
      resolveSimulation = resolve
    })
    const mockRunSimulation = vi.fn().mockReturnValue(pendingPromise)
    vi.mocked(useSimulationWorker).mockReturnValue({
      runSimulation: mockRunSimulation,
      runMilestoneSimulation: vi.fn(),
      isSimulating: false,
    })

    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.canRun).toBe(true))
    // No milestones in the test fixture — exercises runSimulation branch
    expect(result.current.hasMilestones).toBe(false)

    // Start the simulation without awaiting; the mock promise is suspended
    act(() => { void result.current.handleRunForecast() })

    // Sanity: verifies the await was actually reached (distinguishes "guard
    // discarded the result" from "handleRunForecast bailed before runSimulation")
    expect(mockRunSimulation).toHaveBeenCalledTimes(1)

    // Bump generation while the simulation is in flight (simulates sign-out)
    bumpSimulationGeneration()

    // Resolve the pending simulation; guard must discard the stale result
    await act(async () => {
      resolveSimulation({
        truncatedNormal: { results: {} as never, sprintsRequired: [] },
        lognormal: { results: {} as never, sprintsRequired: [] },
        gamma: { results: {} as never, sprintsRequired: [] },
        bootstrap: null,
        triangular: { results: {} as never, sprintsRequired: [] },
        uniform: { results: {} as never, sprintsRequired: [] },
      })
    })

    expect(result.current.results).toBeNull()
  })
})
