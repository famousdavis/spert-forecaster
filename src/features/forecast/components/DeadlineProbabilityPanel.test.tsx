// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { DeadlineProbabilityPanel } from './DeadlineProbabilityPanel'
import { useSettingsStore } from '@/shared/state/settings-store'
import type { Milestone } from '@/shared/types'
import type { QuadSimulationData } from '../lib/monte-carlo'
import type { MilestoneResults } from '../hooks/useForecastState'
import type { MilestoneCompletionInfo } from '../lib/milestones'
import {
  calculateSprintStartDate,
  calculateSprintFinishDate,
} from '@/shared/lib/dates'

// ---------- Fixtures ----------
//
// All sprint math here uses a 2-week cadence (matches the seeded sample
// project). completedSprintCount = 7 so sprint 1 displays as "Sprint 8".
const FORECAST_START = '2026-05-18'
const CADENCE = 2
const COMPLETED = 7

function finishOf(n: number): string {
  return calculateSprintFinishDate(
    calculateSprintStartDate(FORECAST_START, n, CADENCE),
    CADENCE,
  )
}

/** A sortedSprintsRequired array of length 100 where K values are ≤ N. With K
 *  values landing at exactly N, the CDF at N is K%. */
function simArrayWithKLessOrEqual(n: number, k: number): number[] {
  const ks = Array.from({ length: k }, () => n)
  const rest = Array.from({ length: 100 - k }, () => n + 50)
  return [...ks, ...rest].sort((a, b) => a - b)
}

function makeSimulationData(arr: number[]): QuadSimulationData {
  return {
    truncatedNormal: arr,
    lognormal: arr,
    gamma: arr,
    bootstrap: null,
    triangular: arr,
    uniform: arr,
  }
}

const SAMPLE_MILESTONES: Milestone[] = [
  {
    id: 'ms-alpha',
    name: 'Alpha Release',
    backlogSize: 100,
    color: '#10b981',
    createdAt: 't',
    updatedAt: 't',
  },
  {
    id: 'ms-beta',
    name: 'Beta Release',
    backlogSize: 150,
    color: '#3b82f6',
    createdAt: 't',
    updatedAt: 't',
  },
]
const SAMPLE_COMPLETION: MilestoneCompletionInfo[] = [
  { completed: false },
  { completed: false },
]

function makeMilestoneResults(arr: number[]): MilestoneResults {
  // Same shape for both milestones — tests only need *something*.
  return {
    milestoneResults: [
      {} as MilestoneResults['milestoneResults'][number],
      {} as MilestoneResults['milestoneResults'][number],
    ],
    milestoneSimulationData: [makeSimulationData(arr), makeSimulationData(arr)],
  }
}

// Render helper — supplies sensible defaults; tests override as needed.
type Props = Parameters<typeof DeadlineProbabilityPanel>[0]
function renderPanel(overrides: Partial<Props> = {}) {
  const defaults: Props = {
    targetDate: '',
    onTargetDateChange: () => {},
    simulationData: makeSimulationData(simArrayWithKLessOrEqual(3, 50)),
    milestoneResultsState: null,
    milestones: [],
    milestoneCompletionInfo: [],
    forecastStartDate: FORECAST_START,
    sprintCadenceWeeks: CADENCE,
    completedSprintCount: COMPLETED,
    unitOfMeasure: 'points',
    projectName: 'Test Project',
    remainingBacklog: 250,
    forecastMode: 'history',
  }
  return render(<DeadlineProbabilityPanel {...defaults} {...overrides} />)
}

// Click the panel header to expand it (default state is collapsed).
function expandPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Deadline Probability/i }))
}

beforeEach(() => {
  // Reset distributionsEnabled to default before each test — some tests will
  // narrow this to a single distribution to exercise single-column rendering.
  useSettingsStore.setState({ distributionsEnabled: ['lognormal'] })
})

describe('DeadlineProbabilityPanel', () => {
  it('renders collapsed by default with the section title visible', () => {
    renderPanel()
    expect(screen.getByText('Deadline Probability')).toBeTruthy()
    // Form controls hidden when collapsed:
    expect(screen.queryByLabelText('Target Date')).toBeNull()
  })

  it('shows helper text when expanded with empty targetDate', () => {
    renderPanel()
    expandPanel()
    expect(
      screen.getByText(/Enter a target date to see the probability/i),
    ).toBeTruthy()
    // No table should render:
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders the case-2 (normal) project-scope narrative for a target inside the forecast window', () => {
    // sortedSprintsRequired: 50 of length 100 ≤ sprint 3 → 50% CDF at sprint 3.
    // Pick a target between sprint-3 finish and sprint-4 finish (case 2).
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    // Strictly after sprint 3 finish, before sprint 4 finish.
    const sprint3Finish = finishOf(3)
    const sprint4Finish = finishOf(4)
    const targetBetween = sprint4Finish // could be tricky if exact match
    // Use a date strictly between sprint 3 and sprint 4 finish:
    const between =
      sprint3Finish < '2026-07-05' && '2026-07-05' < sprint4Finish
        ? '2026-07-05'
        : targetBetween
    renderPanel({
      simulationData: sim,
      targetDate: between,
      remainingBacklog: 250,
      unitOfMeasure: 'points',
      projectName: 'Acme',
    })
    expandPanel()
    // Narrative includes scope name + backlog + unit + "before your ... target"
    expect(screen.getByText(/Acme/)).toBeTruthy()
    expect(screen.getByText(/250 points backlog/)).toBeTruthy()
    expect(screen.getByText(/which is before your/)).toBeTruthy()
    // Table column header for lognormal present (the default-enabled dist):
    expect(screen.getByRole('columnheader', { name: /Lognormal/i })).toBeTruthy()
  })

  it('renders the case-1 (exact match) narrative WITHOUT the "before your ... target" qualifier', () => {
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    const sprint3Finish = finishOf(3)
    renderPanel({ simulationData: sim, targetDate: sprint3Finish })
    expandPanel()
    expect(screen.queryByText(/which is before your/)).toBeNull()
    // Sprint number appears (Sprint 10 = 3 + 7) in both the narrative and the
    // sprint-boundary footnote — getAllByText accepts the multi-match.
    expect(screen.getAllByText(/Sprint 10/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the milestone-scope case-2 narrative with "will be reached by"', () => {
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    const milestoneResults = makeMilestoneResults(simArrayWithKLessOrEqual(3, 50))
    const between = '2026-07-05' // between sprint 3 and 4 finishes for this fixture
    renderPanel({
      simulationData: sim,
      milestoneResultsState: milestoneResults,
      milestones: SAMPLE_MILESTONES,
      milestoneCompletionInfo: SAMPLE_COMPLETION,
      targetDate: between,
    })
    expandPanel()
    // Switch scope to Alpha Release.
    const scopeSelect = screen.getByLabelText('Scope') as HTMLSelectElement
    fireEvent.change(scopeSelect, { target: { value: 'ms-alpha' } })
    expect(screen.getByText(/will be reached by/)).toBeTruthy()
    // Milestone narrative does NOT mention backlog/unit clauses:
    expect(screen.queryByText(/backlog/)).toBeNull()
  })

  it('renders the case-3 narrative when targetDate is before forecastStartDate', () => {
    renderPanel({ targetDate: '2025-01-01' })
    expandPanel()
    expect(screen.getByText(/falls before the forecast window begins/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders the case-4 narrative when targetDate is inside the first forecast sprint', () => {
    // Target = forecast start date itself — sprint 1 has not finished yet.
    renderPanel({ targetDate: FORECAST_START })
    expandPanel()
    // Sprint 8 = 1 + completedSprintCount (7)
    expect(
      screen.getByText(/falls within Sprint 8 \(the first forecast sprint\)/),
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders a single-column table when only one distribution is enabled', () => {
    useSettingsStore.setState({ distributionsEnabled: ['gamma'] })
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    renderPanel({ simulationData: sim, targetDate: '2026-07-05' })
    expandPanel()
    // Only Gamma column header:
    expect(screen.getByRole('columnheader', { name: /Gamma/i })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /Lognormal/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /T-Normal/i })).toBeNull()
  })

  it('falls back to Entire Project when the selected milestone is removed', () => {
    // Render with two milestones, then re-render with one removed (matching ids drift).
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    const ms = makeMilestoneResults(simArrayWithKLessOrEqual(3, 50))
    const { rerender } = renderPanel({
      simulationData: sim,
      milestoneResultsState: ms,
      milestones: SAMPLE_MILESTONES,
      milestoneCompletionInfo: SAMPLE_COMPLETION,
      targetDate: '2026-07-05',
    })
    expandPanel()
    const scopeSelect = screen.getByLabelText('Scope') as HTMLSelectElement
    fireEvent.change(scopeSelect, { target: { value: 'ms-alpha' } })
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('ms-alpha')

    // Now re-render with ms-alpha gone — selectedScope still references it,
    // effectiveScope must fall back to project. The select displays the project
    // sentinel.
    rerender(
      <DeadlineProbabilityPanel
        targetDate="2026-07-05"
        onTargetDateChange={() => {}}
        simulationData={sim}
        milestoneResultsState={ms}
        milestones={[SAMPLE_MILESTONES[1]]}
        milestoneCompletionInfo={[{ completed: false }]}
        forecastStartDate={FORECAST_START}
        sprintCadenceWeeks={CADENCE}
        completedSprintCount={COMPLETED}
        unitOfMeasure="points"
        projectName="Test Project"
        remainingBacklog={250}
        forecastMode="history"
      />,
    )
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('__project__')
  })

  it('falls through to empty when milestone scope is selected but milestoneResultsState is null', () => {
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    renderPanel({
      simulationData: sim,
      milestoneResultsState: null,
      milestones: SAMPLE_MILESTONES,
      milestoneCompletionInfo: SAMPLE_COMPLETION,
      targetDate: '2026-07-05',
    })
    expandPanel()
    const scopeSelect = screen.getByLabelText('Scope') as HTMLSelectElement
    fireEvent.change(scopeSelect, { target: { value: 'ms-alpha' } })
    // No table for case-1/case-2, no narrative for project scope, helper-text
    // empty state instead:
    expect(
      screen.getByText(/Enter a target date to see the probability/i),
    ).toBeTruthy()
  })

  it('shows the cap footnote when ANY enabled distribution caps at 99%', () => {
    // 100% CDF at the target sprint → wasCapped: true for the active dist.
    useSettingsStore.setState({ distributionsEnabled: ['lognormal'] })
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 100))
    renderPanel({ simulationData: sim, targetDate: '2026-07-05' })
    expandPanel()
    expect(
      screen.getByText(/Forecast caps probability at 99%/i),
    ).toBeTruthy()
  })

  it('does NOT show the cap footnote when no enabled distribution caps', () => {
    useSettingsStore.setState({ distributionsEnabled: ['lognormal'] })
    const sim = makeSimulationData(simArrayWithKLessOrEqual(3, 50))
    renderPanel({ simulationData: sim, targetDate: '2026-07-05' })
    expandPanel()
    expect(screen.queryByText(/Forecast caps probability at 99%/i)).toBeNull()
  })

  it('shows the cap footnote when a NON-selected distribution caps (anyWasCapped logic)', () => {
    // Two distributions enabled; only one caps; selected is the non-capping one.
    // Note: anyWasCapped looks at perDistributionProbabilities, which only
    // includes visibleDistributions, so disabling other distributions does NOT
    // hide the cap if any visible one capped.
    useSettingsStore.setState({ distributionsEnabled: ['lognormal', 'gamma'] })
    const sim: QuadSimulationData = {
      truncatedNormal: simArrayWithKLessOrEqual(3, 50),
      lognormal: simArrayWithKLessOrEqual(3, 50), // 50%, no cap
      gamma: simArrayWithKLessOrEqual(3, 100), // 100%, will cap
      bootstrap: null,
      triangular: simArrayWithKLessOrEqual(3, 50),
      uniform: simArrayWithKLessOrEqual(3, 50),
    }
    renderPanel({ simulationData: sim, targetDate: '2026-07-05' })
    expandPanel()
    // The cap footnote appears because gamma capped, even though lognormal
    // (the default-selected) didn't.
    expect(
      screen.getByText(/Forecast caps probability at 99%/i),
    ).toBeTruthy()
  })

  it('renders empty state without throwing when forecastStartDate is invalid', () => {
    renderPanel({ forecastStartDate: '', targetDate: '2026-07-05' })
    expandPanel()
    expect(
      screen.getByText(/Enter a target date to see the probability/i),
    ).toBeTruthy()
  })
})
