// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The export check, at all three entry points: Export All, the project row's
 * download, and Settings → Export Projects. Each SAVES (the anchor click is
 * captured), then shows the one persistent warning with the approved text.
 *
 * ⚠️ Every refusal is seeded as STORED STATE with setState — never through the
 * forms or cloneProject, which a later release changes. Names are matched as
 * whole list items, so "Alpha 2" can never pass for "Alpha".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: 'local', setMode: vi.fn() }) }))
vi.mock('@/shared/firebase/firestore-driver', () => ({ loadOwnedProjectIds: vi.fn().mockResolvedValue(new Set()) }))
vi.mock('@/shared/firebase/config', () => ({ auth: null }))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/shared/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks')>('@/shared/hooks')
  return { ...actual, useIsClient: () => true }
})

import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { ExportProjectsSection } from '@/features/settings/components/ExportProjectsSection'
import { ExportCheckWarning } from '@/shell/components/ExportCheckWarning'
import { useProjectStore } from '@/shared/state/project-store'
import { useExportCheckStore } from '@/shared/state/export-check-store'
import { MILESTONE_CEILING } from '@/shared/state/import-limits'
import type { Project, Sprint } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const ms = (n: number, backlogSize = 1) =>
  Array.from({ length: n }, (_, k) => ({ id: `m${k}`, name: `M${k + 1}`, backlogSize, color: '#000', showOnChart: true, createdAt: T, updatedAt: T }))
const project = (id: string, name: string, extra: Partial<Project> = {}): Project =>
  ({ id, name, unitOfMeasure: 'pts', sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-05', milestones: [], productivityAdjustments: [], createdAt: T, updatedAt: T, ...extra })
const sprint = (id: string, projectId: string, extra: Partial<Sprint> = {}): Sprint =>
  ({ id, projectId, sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 5, includedInForecast: true, createdAt: T, updatedAt: T, ...extra })

const LONG = 'L'.repeat(245)
const CLONE = `${'C'.repeat(190)} - Copy (1)`
const BAD_UNIT = { unitOfMeasure: 'u'.repeat(201) }

/** Every refusal at once, plus a valid 13-milestone bystander and a valid prefix twin. */
function seedBadWorkspace(): void {
  useProjectStore.setState({
    projects: [
      project('fine', 'Fine'),
      project('long', LONG),
      project('unit', 'Unit', BAD_UNIT),
      project('fig', 'Figure', { milestones: ms(1, 1_200_000) }),
      project('clone', CLONE),
      project('beta', 'Beta'),
      project('gamma', 'Gamma', { milestones: ms(MILESTONE_CEILING + 1) }),
      project('thirteen', 'Thirteen', { milestones: ms(13) }),
      project('t1', 'Twin', BAD_UNIT),
      project('t2', 'Twin', BAD_UNIT),
      project('alpha', 'Alpha'),
      project('alpha2', 'Alpha 2', BAD_UNIT),
      project('dupA', 'Dup A'),
      project('dupB', 'Dup B'),
    ],
    sprints: [
      // sprints[0] belongs to Beta, though projects[0] is Fine: a positional mapping names the wrong project.
      sprint('b3', 'beta', { sprintNumber: 3, sprintFinishDate: '20276-09-04', customFinishDate: '20276-09-04' }),
      sprint('f1', 'fine'),
      sprint('tw1', 't1'), sprint('tw2', 't2'), sprint('tw3', 't2', { sprintNumber: 2 }),
      sprint('s-dup', 'dupA'), sprint('s-dup', 'dupB'),
    ],
    _originRef: 'origin-token', _changeLog: [],
  })
}

const EXPECTED_ALL = [
  `${'L'.repeat(80)}… — Project name is 245 characters; the most allowed is 200.`,
  'Unit — Unit of measure is 201 characters; the most allowed is 200.',
  'Figure — Remaining Work for milestone "M1" is 1,200,000; the most allowed is 999,999.',
  `${'C'.repeat(80)}… — Project name is 201 characters; the most allowed is 200.`,
  'Beta, sprint 3 — Finish Date "20276-09-04" is not a valid date.',
  'Gamma — 101 milestones; a file from this app holds at most 100.',
  'Twin · 1 sprint — Unit of measure is 201 characters; the most allowed is 200.',
  'Twin · 2 sprints — Unit of measure is 201 characters; the most allowed is 200.',
  'Alpha 2 — Unit of measure is 201 characters; the most allowed is 200.',
  'The file as a whole — two sprints share the ID "s-dup".',
]

let saved: string[] = []
beforeEach(() => {
  saved = []
  useExportCheckStore.setState({ items: null })
  localStorage.clear()
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download) })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function renderProjects() {
  function Harness() {
    const importState = useImportState()
    return (<><ExportCheckWarning /><ProjectsTab importState={importState} /></>)
  }
  return render(<Harness />)
}

const warningItems = () => screen.queryByRole('alert')?.querySelectorAll('li') ?? []
const itemTexts = () => [...warningItems()].map((li) => li.textContent)

function expectApprovedWarning(items: string[]): void {
  const alert = screen.getByRole('alert')
  expect(alert.textContent).toContain('Your file was saved, but it will not restore.')
  expect(alert.textContent).toContain('Importing is all-or-nothing, so the whole file — every project in it — will be refused until these are fixed:')
  expect(alert.textContent).toContain('Fix the named field in each project. If you can\'t edit a project, ask its owner. To back up your other projects now, select them in Settings → Export Projects.')
  expect(itemTexts()).toEqual(items)
}

describe('Export All', () => {
  it('saves the file, then warns, naming every failing project as its own item', () => {
    seedBadWorkspace()
    renderProjects()
    fireEvent.click(screen.getByRole('button', { name: 'Export all projects as JSON' }))
    expect(saved).toEqual([expect.stringMatching(/^spert-forecaster-\d{4}-\d{2}-\d{2}\.json$/)])
    expectApprovedWarning(EXPECTED_ALL)
    expect(itemTexts().some((t) => t?.startsWith('Alpha —')), '"Alpha" itself is valid').toBe(false)
    expect(itemTexts().some((t) => t?.startsWith('Thirteen')), 'a valid 13-milestone bystander is not named').toBe(false)
  })

  it('stays until Dismiss — past every toast duration — and a clean export clears it', () => {
    seedBadWorkspace()
    renderProjects()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Export all projects as JSON' }))
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })
    expect(itemTexts()).toHaveLength(EXPECTED_ALL.length)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the project row\'s download', () => {
  it('saves that project, then warns about it alone', () => {
    seedBadWorkspace()
    renderProjects()
    fireEvent.click(screen.getByRole('button', { name: 'Export Gamma' }))
    expect(saved).toEqual([expect.stringMatching(/^spert-forecaster-gamma-/)])
    expectApprovedWarning(['Gamma — 101 milestones; a file from this app holds at most 100.'])
  })
})

describe('Settings → Export Projects', () => {
  it('saves the selection, then shows the same warning', () => {
    seedBadWorkspace()
    render(<><ExportCheckWarning /><ExportProjectsSection /></>)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: /^Export \(14\)$/ }))
    expect(saved).toEqual(['spert-forecaster-projects-' + new Date().toLocaleDateString('en-CA') + '.json'])
    expectApprovedWarning(EXPECTED_ALL)
  })
})

describe('a clean workspace warns at no entry point', () => {
  function seedClean(): void {
    useProjectStore.setState({
      projects: [project('a', 'Thirteen', { milestones: ms(13) }), project('b', 'Hundred', { milestones: ms(MILESTONE_CEILING) })],
      sprints: [sprint('s1', 'a')], _originRef: 'origin-token', _changeLog: [],
    })
  }

  it('Export All and the row download', () => {
    seedClean()
    renderProjects()
    fireEvent.click(screen.getByRole('button', { name: 'Export all projects as JSON' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export Hundred' }))
    expect(saved).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Settings → Export Projects', () => {
    seedClean()
    render(<><ExportCheckWarning /><ExportProjectsSection /></>)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: /^Export \(2\)$/ }))
    expect(saved).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
