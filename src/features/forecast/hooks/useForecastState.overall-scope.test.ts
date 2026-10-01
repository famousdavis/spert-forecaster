// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The CSV export's main sections describe the WHOLE project (v0.44.1).
//
// Section 1 of the CSV states the remaining backlog; sections 2-4 (percentile
// results, frequency distribution, raw trials) are that backlog's forecast.
// Until v0.44.1 they were built from the SELECTED scope — whatever the CDF,
// Histogram or Custom Percentile "Milestone:" dropdown last pointed at — so
// the same file could pair a 100-point backlog with Alpha's 40 points of
// dates. ForecastTab.entire-project.test.tsx guards the same defect on screen.

import { vi } from 'vitest'
vi.mock('./useSimulationWorker', () => ({
  useSimulationWorker: () => ({ runSimulation: vi.fn(), runMilestoneSimulation: vi.fn() }),
}))
vi.mock('../lib/export-csv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/export-csv')>()
  return { ...actual, generateForecastCsv: vi.fn(() => 'csv'), downloadCsv: vi.fn() }
})

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useForecastState } from './useForecastState'
import { generateForecastCsv } from '../lib/export-csv'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import {
  useForecastResultsStore,
  type ForecastRunRecord,
} from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import type { QuadResults, QuadSimulationData } from '@/shared/types/forecast-results'

const PID = 'overall-scope'

/** One scope's data, every array and object distinct by identity AND by value. */
function scope(n: number): { sim: QuadSimulationData; quad: QuadResults } {
  const arr = () => [n, n + 1, n + 2]
  const r = { percentile: 50, finishDate: `2026-0${n}-01`, sprintsRequired: n }
  const pr = () => ({ p50: r, p60: r, p70: r, p80: r, p90: r })
  return {
    sim: { truncatedNormal: arr(), lognormal: arr(), gamma: arr(), bootstrap: null, triangular: arr(), uniform: arr() },
    quad: { truncatedNormal: pr(), lognormal: pr(), gamma: pr(), bootstrap: null, triangular: pr(), uniform: pr() },
  }
}

beforeEach(() => {
  vi.mocked(generateForecastCsv).mockClear()
  useSettingsStore.setState({ autoRecalculate: false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [{
      id: PID,
      name: 'Overall Scope',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2,
      firstSprintStartDate: '2026-01-05',
      milestones: [
        { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#10b981', createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Beta', backlogSize: 60, color: '#3b82f6', createdAt: '', updatedAt: '' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    sprints: [],
    viewingProjectId: PID,
    forecastInputs: { [PID]: { remainingBacklog: '100', velocityMean: '20', velocityStdDev: '4' } },
    burnUpConfigs: {},
  })
})

describe('CSV sections 2-4 export the overall scope, whatever is selected', () => {
  it('passes the LAST scope\'s results and trials at every index', async () => {
    const data = [scope(1), scope(4)]
    const record: ForecastRunRecord = {
      projectId: PID,
      runAt: '2026-01-02T00:00:00.000Z',
      runConfig: readForecastInputSnapshot(useProjectStore.getState().projects[0]),
      simData: data.map((d) => d.sim),
      quadResults: data.map((d) => d.quad),
      scopes: [
        { kind: 'milestone', milestoneIndex: 0, label: 'Alpha', cumulativeThreshold: 40, thresholdUnreachable: false },
        { kind: 'cumulative-final', milestoneIndex: 1, label: 'Beta', cumulativeThreshold: 100, thresholdUnreachable: false },
      ],
    }
    useForecastResultsStore.setState({ record })
    const { result } = renderHook(() => useForecastState())
    await waitFor(() => expect(result.current.results).not.toBeNull())

    for (const index of [1, 0]) {
      act(() => { result.current.handleMilestoneIndexChange(index) })
      expect(result.current.selectedMilestoneIndex).toBe(index)
      act(() => { result.current.handleExportCsv() })
      const arg = vi.mocked(generateForecastCsv).mock.calls.at(-1)![0]
      // By reference: the record's own objects for the overall (last) scope.
      expect(arg.lognormalResults, `results at index ${index}`).toBe(data[1].quad.lognormal)
      expect(arg.lognormalSprintsRequired, `trials at index ${index}`).toBe(data[1].sim.lognormal)
      expect(arg.truncatedNormalSprintsRequired).toBe(data[1].sim.truncatedNormal)
    }
    expect(vi.mocked(generateForecastCsv)).toHaveBeenCalledTimes(2)
  })
})
