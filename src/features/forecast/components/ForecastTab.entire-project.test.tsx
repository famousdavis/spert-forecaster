// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// "ENTIRE PROJECT" MUST NOT FOLLOW THE CHART DROPDOWNS (v0.44.1).
//
// Until v0.44.1, ForecastTab handed the forecast summary, the Deadline
// Probability panel and the results table the SELECTED scope — the one the
// CDF, Histogram and Custom Percentile "Milestone:" dropdowns write — and each
// rendered it as "Entire Project". Picking "Beta Release" in the CDF chart
// re-dated the whole project to Beta's date, under the words "the project will
// finish by". Picking a completed milestone in the Custom Percentile panel
// made a 460-point project finish next sprint.
//
// ⚠️ WHY THIS RENDERS THE WHOLE TAB. The defect was in the WIRING — which
// scope ForecastTab passes down — not in any component. A test that renders
// ForecastSummary with props of its own choosing passes against the broken
// wiring, because it supplies the right props itself. Only the tab can show
// what the tab passes. So the scopes below hold DISTINCT numbers, the
// selection is moved through every index, and the Entire-Project text must not
// move with it.

import { vi } from 'vitest'
vi.mock('../hooks/useSimulationWorker', () => ({
  useSimulationWorker: () => ({ runSimulation: vi.fn(), runMilestoneSimulation: vi.fn() }),
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ForecastTab } from './ForecastTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import {
  useForecastResultsStore,
  type ForecastRunRecord,
  type ForecastScope,
} from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import { calculatePercentileResult } from '../lib/monte-carlo'
import type { QuadResults, QuadSimulationData } from '@/shared/types/forecast-results'
import type { Milestone } from '@/shared/types'
import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
  formatDateLong,
} from '@/shared/lib/dates'

const PID = 'entire-project'
const START = '2026-01-05'
const CADENCE = 2

/** 100 trials spread evenly over [lo, hi] — distinct per scope, so every scope dates differently. */
function spread(lo: number, hi: number): number[] {
  return Array.from({ length: 100 }, (_, i) => lo + Math.floor((i * (hi - lo + 1)) / 100))
}

function scopeData(sorted: number[]): { sim: QuadSimulationData; quad: QuadResults } {
  const pct = (p: number) => calculatePercentileResult(sorted, p, START, CADENCE)
  const results = { p50: pct(50), p60: pct(60), p70: pct(70), p80: pct(80), p90: pct(90) }
  return {
    sim: {
      truncatedNormal: sorted, lognormal: sorted, gamma: sorted,
      bootstrap: null, triangular: sorted, uniform: sorted,
    },
    quad: {
      truncatedNormal: results, lognormal: results, gamma: results,
      bootstrap: null, triangular: results, uniform: results,
    },
  }
}

// Scope 2 is the overall scope (D20's cumulative-final). Scopes 0 and 1 finish
// far earlier, so any leak of the selection into "Entire Project" shows.
const SCOPE_SPRINTS: Array<[number, number]> = [[2, 4], [5, 7], [8, 12]]

function milestones(showOnChart: boolean): Milestone[] {
  return [
    { id: 'm1', name: 'Alpha', backlogSize: 40, color: '#10b981', showOnChart, createdAt: '', updatedAt: '' },
    { id: 'm2', name: 'Beta', backlogSize: 30, color: '#3b82f6', showOnChart, createdAt: '', updatedAt: '' },
    { id: 'm3', name: 'Gamma', backlogSize: 30, color: '#f59e0b', showOnChart, createdAt: '', updatedAt: '' },
  ]
}

function seed(showOnChart: boolean) {
  useSettingsStore.setState({ autoRecalculate: false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [{
      id: PID,
      name: 'Entire Project Fixture',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: CADENCE,
      firstSprintStartDate: START,
      milestones: milestones(showOnChart),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    sprints: [],
    viewingProjectId: PID,
    forecastInputs: { [PID]: { remainingBacklog: '100', velocityMean: '20', velocityStdDev: '4' } },
    burnUpConfigs: {},
  })
  const project = useProjectStore.getState().projects[0]
  const data = SCOPE_SPRINTS.map(([lo, hi]) => scopeData(spread(lo, hi)))
  const scopes: ForecastScope[] = [
    { kind: 'milestone', milestoneIndex: 0, label: 'Alpha', cumulativeThreshold: 40, thresholdUnreachable: false },
    { kind: 'milestone', milestoneIndex: 1, label: 'Beta', cumulativeThreshold: 70, thresholdUnreachable: false },
    { kind: 'cumulative-final', milestoneIndex: 2, label: 'Gamma', cumulativeThreshold: 100, thresholdUnreachable: false },
  ]
  const record: ForecastRunRecord = {
    projectId: PID,
    runAt: '2026-01-02T00:00:00.000Z',
    runConfig: readForecastInputSnapshot(project),
    simData: data.map((d) => d.sim),
    quadResults: data.map((d) => d.quad),
    scopes,
  }
  useForecastResultsStore.setState({ record })
  return { overall: data[2] }
}

/** AppShell supplies the provider in the app; HelpTooltip throws without one. */
function renderTab() {
  return render(<TooltipProvider><ForecastTab /></TooltipProvider>)
}

function select(index: number) {
  act(() => { useForecastResultsStore.getState().setSelectedMilestoneIndex(PID, index) })
}

const hero = () => document.getElementById('forecast-hero-heading')!.nextElementSibling!.textContent
const sentence = () => screen.getByText(/^Using the /).textContent
const deadline = () => document.querySelector('p[aria-live]')?.textContent ?? null

/** The P80 date of the overall scope — what "Entire Project" must say whatever is selected. */
function overallP80Date(): string {
  const sorted = spread(...SCOPE_SPRINTS[2])
  return formatDateLong(calculatePercentileResult(sorted, 80, START, CADENCE).finishDate)
}

describe('"Entire Project" is independent of the chart selection', () => {
  beforeEach(() => { seed(true) })

  it('the hero, the summary sentence and the deadline panel read the overall scope at every index', () => {
    renderTab()
    // A target date inside the overall scope's spread, so its probability is
    // neither 0 nor capped — and differs from both earlier scopes'.
    const target = calculateSprintFinishDate(calculateSprintStartDate(START, 10, CADENCE), CADENCE)
    act(() => { useForecastResultsStore.getState().patchViewState(PID, { targetDate: target }) })
    fireEvent.click(screen.getByRole('button', { name: /Deadline Probability/ }))

    const seen = [2, 0, 1, 2].map((i) => {
      select(i)
      return { i, hero: hero(), sentence: sentence(), deadline: deadline() }
    })

    // The overall scope's own date, not merely "the same text every time":
    // identical-but-wrong would otherwise pass.
    expect(seen[0].hero).toContain(overallP80Date())
    expect(seen[0].deadline).toMatch(/finish the 100 points backlog/)
    // Soft, so each surface reports on its own: the hero failing first must
    // not hide whether the sentence and the deadline panel were wired too.
    for (const s of seen) {
      expect.soft(s.hero, `hero at index ${s.i}`).toBe(seen[0].hero)
      expect.soft(s.sentence, `sentence at index ${s.i}`).toBe(seen[0].sentence)
      expect.soft(s.deadline, `deadline at index ${s.i}`).toBe(seen[0].deadline)
    }
  })
})

describe('the results table fallback reads the overall scope', () => {
  // With every milestone hidden from charts, ForecastResults has no
  // per-milestone tables to show and falls back to one table — the overall
  // scope, never the selected one.
  beforeEach(() => { seed(false) })

  it('shows the same rows at every index', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Forecast Results/ }))
    const table = () => document.querySelector('table')!.textContent

    const seen = [2, 0, 1].map((i) => {
      select(i)
      return { i, table: table() }
    })
    for (const s of seen) expect(s.table, `table at index ${s.i}`).toBe(seen[0].table)
  })
})
