// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Forecast tab's read-only banner (Brief 39 PR B, T1/T1b): shown once, for the
 * project the tab shows, when the user can only view it or no cloud view for
 * this account contains it. Running a forecast stays available.
 */
import { vi, describe, it, expect, afterEach } from 'vitest'

const { runSpy } = vi.hoisted(() => ({ runSpy: vi.fn() }))
vi.mock('@/features/forecast/hooks/useSimulationWorker', () => ({
  useSimulationWorker: () => ({ runSimulation: runSpy, runMilestoneSimulation: vi.fn() }),
}))

import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ForecastTab } from './ForecastTab'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import type { ProjectAccess } from '@/shared/state/project-access'
import { PID, seedProject, seedStores } from '@/shared/state/fixtures/bad-sprint-dates'
import { NOT_IN_CLOUD_BANNER, VIEW_ONLY_BANNER } from '@/features/auth/lib/access-texts'

type Seed = ProjectAccess | 'local'

function setup(s: Seed) {
  seedStores('control')
  useStorageModeStore.setState({ mode: s === 'local' ? 'local' : 'cloud' })
  useProjectStore.setState({ cloudDataLoaded: s !== 'local', projectRoles: s === 'local' ? {} : { [PID]: s } })
  render(<TooltipProvider><ForecastTab /></TooltipProvider>)
}
const banners = () => screen.queryAllByRole('note').map((n) => n.textContent)

afterEach(() => {
  cleanup()
  runSpy.mockReset()
  useProjectStore.setState({ projectRoles: {}, cloudDataLoaded: false })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('the Forecast tab banner (T1/T1b)', () => {
  it.each([
    ['viewer', VIEW_ONLY_BANNER],
    ['not-in-cloud', NOT_IN_CLOUD_BANNER],
    ['editor', null],
    ['owner', null],
    ['local', null],
  ] as const)('%s → %j (known-bads: no banner; banner for an editor; wrong text)', (s, text) => {
    setup(s)
    expect(banners()).toEqual(text === null ? [] : [text])
  })

  it('follows the project shown: switching to an editable project removes it (known-bad: banner read from the wrong project)', () => {
    seedStores('control')
    useStorageModeStore.setState({ mode: 'cloud' })
    useProjectStore.setState({
      projects: [seedProject(), seedProject({ id: 'p2', name: 'Gamma' })],
      cloudDataLoaded: true,
      projectRoles: { [PID]: 'viewer', p2: 'editor' },
    })
    render(<TooltipProvider><ForecastTab /></TooltipProvider>)
    expect(banners()).toEqual([VIEW_ONLY_BANNER])
    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), { target: { value: 'p2' } })
    expect(banners()).toEqual([])
  })

  it('appears when the role drops while the tab is open, and a viewer can still run a forecast (known-bad: banner not reactive; Run disabled for viewers)', () => {
    setup('editor')
    expect(banners()).toEqual([])
    act(() => { useProjectStore.setState({ projectRoles: { [PID]: 'viewer' } }) })
    expect(banners()).toEqual([VIEW_ONLY_BANNER])
    fireEvent.click(screen.getByRole('button', { name: /Run Forecast/ }))
    expect(runSpy).toHaveBeenCalledTimes(1)
  })
})
