// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Forecast tab with a bad STORED sprint date (Brief 38 PR C). It must
 * render, and refuse to forecast when — and only when — a date the forecast
 * uses is bad (D12, D14): a refused custom finish date, a refused first-sprint
 * date, or resolved dates past 9999-12-31. While refused nothing shows or
 * exports a forecast, not even a record that is still fresh.
 *
 * ⚠️ Imports only modules that existed before PR C (see the fixture), so these
 * rows also run against the earlier tree and go red there per assertion.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { runSpy } = vi.hoisted(() => ({ runSpy: vi.fn() }))
vi.mock('@/features/forecast/hooks/useSimulationWorker', () => ({
  useSimulationWorker: () => ({ runSimulation: runSpy, runMilestoneSimulation: vi.fn() }),
}))

import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { ForecastTab } from './ForecastTab'
import { SprintHistoryTab } from '@/features/sprint-history/components/SprintHistoryTab'
import { useProjectStore } from '@/shared/state/project-store'
import { useForecastResultsStore, type ForecastRunRecord } from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import { isRecordStale } from '@/shared/lib/forecast-staleness'
import { calculatePercentileResult } from '../lib/monte-carlo'
import type { Project } from '@/shared/types'
import { SEEDS, T, seedStores, type SeedName } from '@/shared/state/fixtures/bad-sprint-dates'

const renderTab = (onTabChange?: (tab: string) => void) =>
  render(<TooltipProvider><ErrorBoundary><ForecastTab onTabChange={onTabChange} /></ErrorBoundary></TooltipProvider>)
const setup = (name: SeedName, opts: { project?: Partial<Project>; autoRecalculate?: boolean } = {}) => {
  seedStores(name, opts)
  renderTab()
}
const crashed = () => screen.queryByText('Something went wrong') !== null
const runButton = () => screen.getByRole('button', { name: /Run Forecast/ }) as HTMLButtonElement
/**
 * The Start Date shown, as the value ATTRIBUTE: a date input's value property
 * sanitizes "+010000-…" to "" by itself, which would make an "empty" check pass
 * on the tree that forecasts from that date.
 */
const shownStartDate = () => document.getElementById('startDate')?.getAttribute('value') ?? ''
const SUMMARY = /Using the .* distribution/

beforeEach(() => { runSpy.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('P13 (iv) the Forecast tab renders, and never forecasts from a bad date', () => {
  it.each([
    ['a3', 'Sprint 3\'s finish date needs fixing first.'],
    ['c3', 'Sprint 3\'s finish date needs fixing first.'],
    ['y9999_mid', 'Sprint 3\'s finish date needs to be earlier first.'],
    ['y9999_last', 'Sprint 8\'s finish date needs to be earlier first.'],
  ] as const)('%s, auto-recalculate on: refused with a reason naming the sprint; Run disabled; no Start Date; no worker call', (name, reason) => {
    setup(name, { autoRecalculate: true })
    expect(crashed()).toBe(false)
    expect(screen.getByText(reason)).toBeTruthy()
    expect(runButton().disabled).toBe(true)
    expect(shownStartDate()).toBe('')
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('f31_5: saved fields the forecast never reads do not refuse it (D12); it starts from 2026-04-27', () => {
    setup('f31_5')
    fireEvent.click(runButton())
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(runSpy.mock.calls[0][0].config.startDate).toBe('2026-04-27')
  })

  it('a state the Update merge produced (own undefined keys) forecasts normally', () => {
    setup('merge')
    fireEvent.click(runButton())
    expect(runSpy).toHaveBeenCalledTimes(1)
  })

  it('the notice offers Go to Sprint History, which switches tabs', () => {
    seedStores('a3')
    const onTabChange = vi.fn()
    renderTab(onTabChange)
    fireEvent.click(screen.getByRole('button', { name: 'Go to Sprint History' }))
    expect(onTabChange).toHaveBeenCalledWith('sprint-history')
  })
})

describe('P13 (iv-2) a still-fresh record, then a date goes bad: the tab shows no result', () => {
  it('a8 after a run on the valid control: the record stays fresh, yet nothing shows or exports', () => {
    seedStores('control')
    const runConfig = readForecastInputSnapshot(useProjectStore.getState().projects[0])
    const sorted = Array.from({ length: 100 }, (_, i) => 8 + Math.floor(i / 10))
    const pct = (p: number) => calculatePercentileResult(sorted, p, runConfig.startDate, 2)
    const results = { p50: pct(50), p60: pct(60), p70: pct(70), p80: pct(80), p90: pct(90) }
    const sim = { truncatedNormal: sorted, lognormal: sorted, gamma: sorted, bootstrap: null, triangular: sorted, uniform: sorted }
    const quad = { truncatedNormal: results, lognormal: results, gamma: results, bootstrap: null, triangular: results, uniform: results }
    const record = {
      projectId: 'p1', runAt: T, runConfig, simData: [sim], quadResults: [quad],
      scopes: [{ kind: 'project', milestoneIndex: null, label: 'Beta', cumulativeThreshold: 120, thresholdUnreachable: false }],
    } as unknown as ForecastRunRecord
    useForecastResultsStore.setState({ record })
    renderTab()
    expect(screen.queryByText(SUMMARY)).not.toBeNull() // the control shows its results
    cleanup()

    act(() => { useProjectStore.setState({ sprints: SEEDS.a8() }) })
    // Pinned: the record is still fresh, so only the date block can hide it.
    expect(isRecordStale(record.runConfig, readForecastInputSnapshot(useProjectStore.getState().projects[0]))).toBe(false)
    renderTab()
    expect(screen.queryByText(SUMMARY)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export simulation data to CSV' })).toBeNull()
    expect(screen.getByText(/can't be forecast until sprint 8's finish date is fixed/)).toBeTruthy()
  })
})

describe('the first sprint date (D14), and no schedule (A1)', () => {
  it('a refused first date: the Forecast tab says why, and Sprint History renders', () => {
    setup('control', { project: { firstSprintStartDate: '20276-01-05' } })
    expect(crashed()).toBe(false)
    expect(screen.getByText('The first sprint start date isn\'t a valid date.')).toBeTruthy()
    expect(runButton().disabled).toBe(true)
    cleanup()
    render(<TooltipProvider><ErrorBoundary><SprintHistoryTab /></ErrorBoundary></TooltipProvider>)
    expect(crashed()).toBe(false)
  })

  it('NS-2: no first date — the missing-schedule reason speaks, and there is no date notice', () => {
    setup('a3', { project: { firstSprintStartDate: undefined } })
    expect(screen.getByText('Set the first sprint start date on the Sprint History tab.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Go to Sprint History' })).toBeNull()
  })
})
