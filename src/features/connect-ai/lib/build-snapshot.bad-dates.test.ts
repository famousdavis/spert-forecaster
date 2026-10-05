// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The AI snapshot with a bad STORED sprint date (Brief 38 PR C, D13). While a
 * date the forecast uses is bad, the snapshot carries no results, record or
 * not: status "absent", a reason naming what to fix, and no run-captured facts.
 *
 * ⚠️ Imports only modules that existed before PR C (see the fixture), so these
 * rows also run against the earlier tree and go red there per assertion.
 */
import { describe, it, expect } from 'vitest'
import { buildSnapshot } from './build-snapshot'
import { useProjectStore } from '@/shared/state/project-store'
import { useForecastResultsStore, selectRecordFor, type ForecastRunRecord } from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import type { Project } from '@/shared/types'
import { PID, SEEDS, T, seedStores, type SeedName } from '@/shared/state/fixtures/bad-sprint-dates'

type Body = Record<string, Record<string, unknown>>

function snapshot(): Body {
  const { projects, sprints, forecastInputs } = useProjectStore.getState()
  const results = useForecastResultsStore.getState()
  const project = projects[0]
  return buildSnapshot({
    project, allSprints: sprints, record: selectRecordFor(results, PID), view: results.viewState[PID],
    comparand: readForecastInputSnapshot(project), storedInputs: forecastInputs[PID],
    isSimulatingProjectId: null, distributionsEnabled: undefined, capturedAt: T,
  }) as Body
}

const seed = (name: SeedName, project?: Partial<Project>) => seedStores(name, { project })

describe('P13 (iv-4) no results while refused, record or not (D13)', () => {
  it.each([false, true])('a3, a record from a run on valid dates present = %s', (withRecord) => {
    seed('control')
    if (withRecord) {
      const runConfig = readForecastInputSnapshot(useProjectStore.getState().projects[0])
      useForecastResultsStore.setState({
        record: { projectId: PID, runAt: T, runConfig, simData: [], quadResults: [], scopes: [] } as unknown as ForecastRunRecord,
      })
    }
    useProjectStore.setState({ sprints: SEEDS.a3() })
    const body = snapshot()
    expect(body.results.status).toBe('absent')
    expect(body.results.statusReason).toMatch(/^Sprint 3's saved finish date, "20276-09-04", isn't a valid date/)
    expect(body.results.statusReason).toMatch(/No forecast results are carried while this lasts, even if an earlier forecast exists\.$/)
    expect(body.results.scopes).toBeUndefined()
    expect(body.results.runAt).toBeNull()
    expect(body.results.anchorSource).toBeNull()
    expect(body.forecastInputs.forecastStartDate).toBeNull()
    expect(body.forecastInputs.forecastStartDateSource).toBeNull()
  })

  it('a3: each sprint carries its raw finish date, and the refused fields are listed', () => {
    seed('a3')
    const history = snapshot().sprintHistory as { sprints: Array<{ sprintNumber: number; finishDate: unknown }>; invalidSprintDates: unknown }
    expect(history.sprints.find((s) => s.sprintNumber === 3)?.finishDate).toBe('20276-09-04')
    expect(history.invalidSprintDates).toEqual([
      { sprintNumber: 3, field: 'sprintFinishDate', value: '20276-09-04' },
      { sprintNumber: 3, field: 'customFinishDate', value: '20276-09-04' },
    ])
  })
})

describe('the first sprint date (D14), and no schedule (A1)', () => {
  it('a refused first date: the snapshot is built, absent, and says why', () => {
    seed('control', { firstSprintStartDate: '20276-01-05' })
    const body = snapshot()
    expect(body.results.status).toBe('absent')
    expect(body.results.statusReason).toMatch(/^The project's first sprint start date, "20276-01-05", isn't a valid date/)
  })

  it('NS-2: no first date — the existing missing-schedule reason, not a date block', () => {
    seed('a3', { firstSprintStartDate: undefined })
    const body = snapshot()
    expect(body.results.status).toBe('absent')
    expect(body.results.statusReason).toBe('Set the first sprint start date on the Sprint History tab.')
  })
})
