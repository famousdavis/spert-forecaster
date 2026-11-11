// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The archive-aware viewed project (v0.50.0, D30): `viewingProjectId` if unarchived, else the
// first unarchived, else none, and `viewingProjectId` itself never rewritten. A mounted reader
// re-renders when the MAP changes, not only the projects: the must-differ is the project-store-
// only selector, which stays stale. Then both pickers and their all-archived message.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { runSpy } = vi.hoisted(() => ({ runSpy: vi.fn() }))
vi.mock('@/features/forecast/hooks/useSimulationWorker', () => ({
  useSimulationWorker: () => ({ runSimulation: runSpy, runMilestoneSimulation: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { render, screen, cleanup, act, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useProjectStore, selectViewingProjectIgnoringArchive } from './project-store'
import { useSettingsStore } from './settings-store'
import { getViewedProject, resolveViewedProject, useUnarchivedProjects, useViewedProject } from './viewed-project'
import { SprintHistoryTab } from '@/features/sprint-history/components/SprintHistoryTab'
import { ForecastTab } from '@/features/forecast/components/ForecastTab'
import { seedProject, seedStores } from './fixtures/bad-sprint-dates'
import { useStorageModeStore } from './storage-mode-store'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string): Project => ({ id, name: `Project ${id}`, unitOfMeasure: 'pts', createdAt: T, updatedAt: T })
const ABC = [project('a'), project('b'), project('c')]

beforeEach(() => {
  useProjectStore.setState({ projects: ABC, sprints: [], viewingProjectId: null })
  useSettingsStore.setState({ projectPrefs: {} })
})
afterEach(() => cleanup())

describe('resolveViewedProject', () => {
  it.each([
    { viewing: 'b', archived: [], expected: 'b', label: 'the viewed project, unarchived' },
    { viewing: 'b', archived: ['b'], expected: 'a', label: 'the viewed project archived: the first unarchived' },
    { viewing: 'a', archived: ['a'], expected: 'b', label: 'the first archived too: the next' },
    { viewing: null, archived: ['a'], expected: 'b', label: 'nothing selected: the first unarchived' },
    { viewing: 'gone', archived: ['a', 'b'], expected: 'c', label: 'a stale selection: the first unarchived' },
    { viewing: 'a', archived: ['a', 'b', 'c'], expected: undefined, label: 'every project archived: none' },
  ])('$label', ({ viewing, archived, expected }) => {
    const prefs = Object.fromEntries(archived.map((id) => [id, { archived: true as const }]))
    expect(resolveViewedProject({ projects: ABC, viewingProjectId: viewing }, prefs)?.id).toBe(expected)
  })

  it('a colour alone changes nothing', () => {
    expect(resolveViewedProject({ projects: ABC, viewingProjectId: 'b' }, { b: { color: 'teal' } })?.id).toBe('b')
  })

  it('getViewedProject reads both stores now', () => {
    useProjectStore.setState({ viewingProjectId: 'b' })
    useSettingsStore.setState({ projectPrefs: { b: { archived: true } } })
    expect(getViewedProject()?.id).toBe('a')
  })
})

describe('a mounted reader re-renders when the map changes', () => {
  function Reader() {
    return <p data-testid="viewed">{useViewedProject()?.id ?? 'none'}</p>
  }
  /** The must-differ: the project-store-only selector, wired as the 12 readers were. */
  function StaleReader() {
    return <p data-testid="stale">{useProjectStore(selectViewingProjectIgnoringArchive)?.id ?? 'none'}</p>
  }

  it('archiving the viewed project changes what useViewedProject reads; unarchiving brings it back', () => {
    useProjectStore.setState({ viewingProjectId: 'b' })
    render(<><Reader /><StaleReader /></>)
    expect(screen.getByTestId('viewed').textContent).toBe('b')
    act(() => {
      useSettingsStore.getState().setProjectArchived('b', true)
    })
    expect(screen.getByTestId('viewed').textContent).toBe('a')
    // MUST-DIFFER: the project-store-only selector stays on the archived project.
    expect(screen.getByTestId('stale').textContent).toBe('b')
    act(() => {
      useSettingsStore.getState().setProjectArchived('b', false)
    })
    expect(screen.getByTestId('viewed').textContent).toBe('b')
    expect(useProjectStore.getState().viewingProjectId).toBe('b') // never rewritten
  })

  it('useUnarchivedProjects lists the unarchived in order, and follows the map', () => {
    function List() {
      return <p data-testid="list">{useUnarchivedProjects().map((p) => p.id).join(',')}</p>
    }
    render(<List />)
    expect(screen.getByTestId('list').textContent).toBe('a,b,c')
    act(() => {
      useSettingsStore.getState().setProjectArchived('a', true)
    })
    expect(screen.getByTestId('list').textContent).toBe('b,c')
  })
})

describe('the Sprint History and Forecast pickers (D30)', () => {
  const ALL_ARCHIVED = 'All projects are archived. Unarchive one on the Projects tab to see it here.'
  function seedThree(viewing: string, archived: string[]) {
    seedStores('control')
    useStorageModeStore.setState({ mode: 'local' })
    useProjectStore.setState({
      projects: [seedProject(), seedProject({ id: 'p2', name: 'Gamma' }), seedProject({ id: 'p3', name: 'Delta' })],
      viewingProjectId: viewing,
      cloudDataLoaded: false,
      projectRoles: {},
    })
    useSettingsStore.setState({ projectPrefs: Object.fromEntries(archived.map((id) => [id, { archived: true as const }])) })
  }
  const picker = () => screen.getByRole('combobox', { name: 'Project' }) as HTMLSelectElement
  const options = () => within(picker()).getAllByRole('option').map((o) => o.textContent)

  describe.each([
    ['Sprint History', () => render(<TooltipProvider><SprintHistoryTab /></TooltipProvider>)],
    ['Forecast', () => render(<TooltipProvider><ForecastTab /></TooltipProvider>)],
  ])('%s', (_tab, mount) => {
    it('lists every project with none archived (control)', () => {
      seedThree('p1', [])
      mount()
      expect(options()).toHaveLength(3)
    })

    it('leaves an archived project out of the picker', () => {
      seedThree('p1', ['p2'])
      mount()
      expect(options()).not.toContain('Gamma')
      expect(options()).toHaveLength(2)
      expect(picker().value).toBe('p1')
    })

    it('with the viewed project archived, shows the first unarchived, and keeps viewingProjectId', () => {
      seedThree('p1', ['p1'])
      mount()
      expect(picker().value).toBe('p2')
      expect(options()).toEqual(['Gamma', 'Delta'])
      expect(useProjectStore.getState().viewingProjectId).toBe('p1')
    })

    it('with every project archived, says so in GanttApp\'s words, and shows no picker', () => {
      seedThree('p1', ['p1', 'p2', 'p3'])
      mount()
      expect(screen.getByText(ALL_ARCHIVED)).not.toBeNull()
      expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull()
    })

    it('with no projects at all, keeps its own empty state, not the archived message', () => {
      seedThree('p1', [])
      useProjectStore.setState({ projects: [], viewingProjectId: null })
      mount()
      expect(screen.queryByText(ALL_ARCHIVED)).toBeNull()
    })
  })
})
