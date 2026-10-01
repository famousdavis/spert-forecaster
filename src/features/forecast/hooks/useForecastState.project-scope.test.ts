// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Entire Project scope (v0.45.0).
//
// With milestones present, a run dated one scope per milestone and called the
// last one the whole project (D20's cumulative-final). That is right only when
// the milestones add up to the backlog. Since Story Map v0.53.8 sends each
// release's REMAINING work, any project with work outside every release sums
// to less — and its "Entire Project" date was the milestones' date, early by
// exactly the unallocated work. Now, when the milestones fall short of the
// backlog by more than rounding, the same run also dates the backlog itself,
// as a trailing scope of kind 'project'.
//
// Every case below goes through handleRunForecast, with the worker answering
// for however many thresholds it is actually sent — so a missing or extra
// threshold shows up as a wrong scope count, not as a mock that hid it.

import { vi } from 'vitest'
vi.mock('./useSimulationWorker', () => ({ useSimulationWorker: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import { useSimulationWorker } from './useSimulationWorker'
import { useForecastState } from './useForecastState'
import type { QuadMilestoneForecastResult } from '../lib/monte-carlo'

const PID = 'project-scope'

const P = { percentile: 50, finishDate: '2026-02-02', sprintsRequired: 1 }
const PCT = { p50: P, p60: P, p70: P, p80: P, p90: P }

/** A worker result with one entry per threshold it was given. */
function workerResult(count: number): QuadMilestoneForecastResult {
  const slot = () => ({
    milestoneResults: Array.from({ length: count }, () => ({ results: PCT, sprintsRequired: [1, 2, 3] })),
  })
  return {
    truncatedNormal: slot(), lognormal: slot(), gamma: slot(),
    bootstrap: null, triangular: slot(), uniform: slot(),
  } as unknown as QuadMilestoneForecastResult
}

const runMilestoneSimulation = vi.fn(async (input: { milestoneThresholds: number[] }) =>
  workerResult(input.milestoneThresholds.length))

beforeEach(() => {
  runMilestoneSimulation.mockClear()
  vi.mocked(useSimulationWorker).mockReturnValue({
    runSimulation: vi.fn(),
    runMilestoneSimulation: runMilestoneSimulation as never,
  })
  useSettingsStore.setState({ autoRecalculate: false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
})

/** Seed a project with these milestone figures and backlog, run once, and report what happened. */
async function run(sizes: number[], backlog: string) {
  useProjectStore.setState({
    projects: [{
      id: PID,
      name: 'Project Scope',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2,
      firstSprintStartDate: '2026-01-05',
      milestones: sizes.map((backlogSize, i) => ({
        id: `m${i}`, name: `M${i}`, backlogSize, color: '#10b981', createdAt: '', updatedAt: '',
      })),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    sprints: [],
    viewingProjectId: PID,
    forecastInputs: { [PID]: { remainingBacklog: backlog, velocityMean: '20', velocityStdDev: '4' } },
    burnUpConfigs: {},
  })
  const hook = renderHook(() => useForecastState())
  await waitFor(() => expect(hook.result.current.canRun).toBe(true))
  await act(async () => { await hook.result.current.handleRunForecast() })
  const sent = runMilestoneSimulation.mock.calls.at(-1)![0].milestoneThresholds
  const scopes = useForecastResultsStore.getState().record!.scopes
  return { hook, sent, scopes }
}

describe('milestones that fall short of the backlog get an Entire Project scope', () => {
  it('appends the backlog to the SAME run and records a project scope at exactly B', async () => {
    const { sent, scopes, hook } = await run([40, 20], '100')
    expect(runMilestoneSimulation).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([40, 60, 100])
    expect(scopes.map((s) => s.kind)).toEqual(['milestone', 'milestone', 'project'])
    expect(scopes.map((s) => s.cumulativeThreshold)).toEqual([40, 60, 100])
    expect(scopes[2]).toMatchObject({ milestoneIndex: null, label: 'Project Scope', thresholdUnreachable: false })
    // The charts default to it after a run.
    expect(hook.result.current.selectedMilestoneIndex).toBe(2)
    expect(hook.result.current.projectScopeIndex).toBe(2)
  })

  it('every milestone complete, work remaining: the project scope dates the remaining work', async () => {
    const { sent, scopes } = await run([0, 0, 0], '100')
    expect(sent).toEqual([0, 0, 0, 100])
    expect(scopes.map((s) => s.kind)).toEqual(['milestone', 'milestone', 'milestone', 'project'])
  })

  it('just past the rounding allowance adds the scope (k = 2, short by 0.016)', async () => {
    const { scopes } = await run([4, 5.984], '10')
    expect(scopes).toHaveLength(3)
    expect(scopes[2]).toMatchObject({ kind: 'project', cumulativeThreshold: 10 })
  })
})

describe('milestones that cover the backlog behave exactly as before (D20)', () => {
  it('an exact match adds nothing: N milestones, N scopes, the last cumulative-final', async () => {
    const { sent, scopes, hook } = await run([40, 60], '100')
    expect(sent).toEqual([40, 100])
    expect(scopes.map((s) => s.kind)).toEqual(['milestone', 'cumulative-final'])
    expect(hook.result.current.projectScopeIndex).toBeNull()
  })

  it('Story Map rounding UNDER the backlog adds nothing (0.12 + 0.12 against 0.25)', async () => {
    const { sent, scopes } = await run([0.12, 0.12], '0.25')
    expect(sent).toHaveLength(2)
    expect(scopes).toHaveLength(2)
    expect(scopes[1].kind).toBe('cumulative-final')
  })

  it('just inside the rounding allowance adds nothing (k = 2, short by 0.014)', async () => {
    const { scopes } = await run([4, 5.986], '10')
    expect(scopes).toHaveLength(2)
  })

  it('milestones PAST the backlog add nothing either, and the ones past it are flagged', async () => {
    const { sent, scopes } = await run([60, 50, 20], '70')
    expect(sent).toEqual([60, 110, 130])
    expect(scopes.map((s) => s.kind)).toEqual(['milestone', 'milestone', 'cumulative-final'])
    expect(scopes.map((s) => s.thresholdUnreachable)).toEqual([false, true, true])
  })
})

describe('milestones past the backlog are reported for the on-screen notice', () => {
  it('reports the milestone total and the backlog when the total is past it by more than rounding', async () => {
    const { hook } = await run([60, 50, 20], '70')
    expect(hook.result.current.milestonesPastBacklog).toEqual({ milestoneTotal: 130, backlog: 70 })
  })

  it('reports nothing for rounding past the backlog (0.13 + 0.13 against 0.25)', async () => {
    const { hook } = await run([0.13, 0.13], '0.25')
    expect(hook.result.current.milestonesPastBacklog).toBeNull()
  })

  it('reports nothing when the milestones match or fall short', async () => {
    expect((await run([40, 60], '100')).hook.result.current.milestonesPastBacklog).toBeNull()
    expect((await run([40, 20], '100')).hook.result.current.milestonesPastBacklog).toBeNull()
  })
})
