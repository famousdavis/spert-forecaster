// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.53.0, the FRAME26 clean-up pass (contract §3, §7; stylesheet v3), on the real AppShell where it can be:
 * - W: the Projects tab with no projects shows the frame's Welcome panel, hooked `data-sf="empty"` itself.
 * - L: the toolbar's Load Sample, the Welcome panel's and the Forecast tab's empty card call ONE handler, which adds
 *   the sample, views it and opens it on Forecast; a second load is "(2)". The toast says the contract's sentence.
 * - A: "Show archived (N)" is the frame's filter row, hooked `data-sf="filters"`, 16 px below the heading row.
 * - F6: a grid that fails leaves the Projects heading row and its toolbar.
 * - The Forecast tab's empty card keeps its look; its note's dark colour is readable (3.71 → 6.89:1).
 * The scaffold is frame-pages.test.tsx's.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/' as string | null, push: vi.fn(), mode: 'local' as 'local' | 'cloud', crashGrid: false }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: nav.mode, setMode: vi.fn() }) }))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
// jsdom has no Worker: the Forecast tab's simulation, stubbed as the Forecast tests stub it.
vi.mock('@/features/forecast/hooks/useSimulationWorker', () => ({
  useSimulationWorker: () => ({ runSimulation: vi.fn(), runMilestoneSimulation: vi.fn() }),
}))
// F6: the grid, made to fail on demand, as a corrupt record or a bug in a tile would.
vi.mock('@/features/projects/components/ProjectList', async (orig) => {
  const real = await orig<typeof import('@/features/projects/components/ProjectList')>()
  return { ...real, ProjectList: (props: Parameters<typeof real.ProjectList>[0]) => {
    if (nav.crashGrid) throw new Error('a grid that cannot render')
    return real.ProjectList(props)
  } }
})

import { AppShell } from './AppShell'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const ALPHA: Project = { id: 'p1', name: 'Alpha release', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }
const SAMPLE = 'Sample: Mobile App Launch'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  nav.pathname = '/'
  nav.push.mockReset()
  nav.mode = 'local'
  nav.crashGrid = false
  localStorage.clear()
  useProjectStore.setState({ projects: [], sprints: [], viewingProjectId: null, cloudDataLoaded: false })
})
afterEach(() => cleanup())

const current = () => [...document.querySelectorAll<HTMLElement>('[data-sf="nav"] [aria-current="page"]')].map((e) => e.textContent?.trim())
const h1 = () => [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim())
const navTo = (label: string) => fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: label }))
const sampleId = (name: string) => useProjectStore.getState().projects.find((p) => p.name === name)?.id

describe('W: the Welcome panel', () => {
  it('stands in the grid\'s place, hooked empty itself, titled with the brand\'s ® in .sf-mark, its parts the frame\'s', () => {
    render(<AppShell />)
    const panel = document.querySelector<HTMLElement>('[data-sf="empty"]')!
    expect(document.querySelectorAll('[data-sf="empty"]')).toHaveLength(1)
    expect([panel.className, panel.getAttribute('role')]).toEqual(['sf-empty', 'region'])
    const title = within(panel).getByRole('heading', { level: 2 })
    expect([title.className, title.innerHTML]).toEqual(['sf-empty-title', 'Welcome to SPERT<span class="sf-mark">®</span> Forecaster'])
    expect(screen.getByRole('region', { name: 'Welcome to SPERT® Forecaster' })).toBe(panel)
    expect([...panel.querySelectorAll('p')].map((p) => p.className)).toEqual(['sf-empty-text', 'sf-empty-note'])
    const buttons = [...panel.querySelectorAll('.sf-empty-actions > button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Create New Project', 'Load Sample Project'])
    expect(buttons.every((b) => b.classList.contains('sf-btn'))).toBe(true)
    // The old card's classes are gone, the dark transparent secondary with them (the ground is the page's now).
    expect(panel.outerHTML).not.toMatch(/bg-card|border-dashed|rounded-lg|dark:bg-transparent|max-w-prose/)
    // Directly in the tab's root after the heading row: no wrapper holds the hook any more.
    expect(panel.previousElementSibling?.getAttribute('data-sf')).toBe('headrow')
  })
})

describe('L: one Load Sample handler, opening the sample on Forecast', () => {
  it('the toolbar\'s Load Sample: adds the sample, views it, opens Forecast, and says so', async () => {
    render(<AppShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }))
    expect(current()).toEqual(['Forecast'])
    expect(useProjectStore.getState().viewingProjectId).toBe(sampleId(SAMPLE))
    expect(h1()).toEqual([SAMPLE])
    expect(await screen.findByText('Added “Sample: Mobile App Launch” to your projects and opened it.')).toBeTruthy()
  })

  it('the Welcome panel\'s Load Sample Project does the same', () => {
    render(<AppShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample Project' }))
    expect([current(), useProjectStore.getState().viewingProjectId]).toEqual([['Forecast'], sampleId(SAMPLE)])
  })

  it('the Forecast tab\'s empty card\'s Load Sample Project does the same', () => {
    render(<AppShell />)
    navTo('Forecast')
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample Project' }))
    expect([current(), useProjectStore.getState().viewingProjectId, h1()]).toEqual([['Forecast'], sampleId(SAMPLE), [SAMPLE]])
  })

  it('a second load, back on Projects: "(2)", viewed and opened on Forecast', async () => {
    render(<AppShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }))
    navTo('Projects')
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }))
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual([SAMPLE, `${SAMPLE} (2)`])
    expect([current(), useProjectStore.getState().viewingProjectId, h1()]).toEqual([['Forecast'], sampleId(`${SAMPLE} (2)`), [`${SAMPLE} (2)`]])
    expect(await screen.findByText('Added “Sample: Mobile App Launch (2)” to your projects and opened it.')).toBeTruthy()
  })
})

describe('A: the filter row', () => {
  it('"Show archived (N)" is the frame\'s filter row: hooked, 16 px below the heading row (sf-below), 16 above the grid', () => {
    useProjectStore.setState({ projects: [ALPHA, { ...ALPHA, id: 'p2', name: 'Beta' }] })
    useSettingsStore.getState().setProjectArchived('p2', true)
    render(<AppShell />)
    const row = document.querySelector<HTMLElement>('[data-sf="filters"]')!
    expect(row.textContent).toBe('Show archived (1)')
    expect(row.className.split(' ')).toEqual(['sf-below', 'mb-4', 'leading-[normal]'])
    expect(row.previousElementSibling?.getAttribute('data-sf')).toBe('headrow')
  })
})

describe('F6: a grid that fails', () => {
  it('leaves the Projects heading row, its h1 and the four toolbar buttons, with the view\'s error in place of the body', () => {
    useProjectStore.setState({ projects: [ALPHA] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    nav.crashGrid = true
    render(<AppShell />)
    expect(h1()).toEqual(['Projects'])
    const row = document.querySelector('[data-sf="headrow"]')!
    expect(within(row as HTMLElement).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Export All', 'Import', 'Load Sample', 'New Project'])
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    vi.mocked(console.error).mockRestore()
  })

  it('control: the same tab with a grid that renders shows no error', () => {
    useProjectStore.setState({ projects: [ALPHA] })
    render(<AppShell />)
    expect(screen.queryByText('Something went wrong')).toBeNull()
    expect(screen.getByText('Alpha release')).toBeTruthy()
  })
})

describe('the Forecast tab\'s empty card (kept, contract §10)', () => {
  it('keeps its card and its own words; its note is gray-400 in dark (6.89:1 on #171717; gray-500 was 3.71)', () => {
    render(<AppShell />)
    navTo('Forecast')
    const card = screen.getByRole('region', { name: "You'll need a project to forecast" })
    expect(card.className).toContain('bg-card')
    const note = [...card.querySelectorAll('p')].pop()!
    expect(note.textContent).toMatch(/^The sample project is a working example with eight sprints of history\./)
    expect(note.className.split(' ')).toEqual(expect.arrayContaining(['dark:text-gray-400']))
    expect(note.className).not.toContain('dark:text-gray-500')
  })
})
