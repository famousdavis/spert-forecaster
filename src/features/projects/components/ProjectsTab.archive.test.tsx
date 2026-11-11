// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Archive and tile colour on the real Projects tab (v0.50.0), mounted as AppShell mounts it (the
// real useImportState): "Show archived (N)", the all-archived line, focus after Archive, Unarchive
// and Delete (hidden neighbours included), the announcements, an archived tile's click, Clone and
// Delete on the map, D31 for every role, the archived look's classes, the reveal hook, and Escape
// in the popover with an import waiting. Fixtures vary colour × archive × role × storage mode and
// the number and position of hidden projects (CHAR-REPORT §E, class 1).
//
// jsdom does no hit-testing and loads no CSS: the classes are pinned here, the rendering is the
// release's browser check.

import { describe, it, expect, afterEach, vi } from 'vitest'

const mockUser = vi.hoisted(() => ({ current: null as { uid: string } | null }))
const toastSpy = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: mockUser.current }) }))
vi.mock('sonner', () => ({ toast: toastSpy }))
vi.mock('@/features/auth/components/SharingSection', () => ({ SharingSection: () => <p>sharing</p> }))
vi.mock('@/shared/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks')>('@/shared/hooks')
  return { ...actual, useIsClient: () => true }
})

import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import { buildProjectSubsetExport } from '../lib/export-project'
import type { ProjectAccess } from '@/shared/state/project-access'
import type { ProjectColor, ProjectPrefs } from '@/shared/lib/project-prefs'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string, name = id): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: T, updatedAt: T })

/** Projects named by their ids, with these archived and coloured. */
function seed(names: string[], archived: string[] = [], colors: Record<string, ProjectColor> = {}): ProjectPrefs {
  const prefs: ProjectPrefs = {}
  for (const n of names) {
    const entry = { ...(colors[n] && { color: colors[n] }), ...(archived.includes(n) && { archived: true as const }) }
    if (Object.keys(entry).length > 0) prefs[n] = entry
  }
  return prefs
}

let importState: ReturnType<typeof useImportState> | null = null
function renderTab(
  projects: Project[],
  prefs: ProjectPrefs,
  opts: { onViewHistory?: (id: string) => void; mode?: 'local' | 'cloud'; roles?: Record<string, ProjectAccess> } = {},
) {
  useStorageModeStore.setState({ mode: opts.mode ?? 'local' })
  useProjectStore.setState({ projects, sprints: [], cloudDataLoaded: true, projectRoles: opts.roles ?? {} })
  useSettingsStore.setState({ projectPrefs: prefs, _isCloudUpdate: false })
  function Harness() {
    importState = useImportState()
    return <ProjectsTab onViewHistory={opts.onViewHistory} importState={importState} />
  }
  return render(<Harness />)
}

const shownNames = () => Array.from(document.querySelectorAll('[data-tile="true"] h3 button')).map((b) => b.textContent)
const tileOf = (id: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-tile="true"]')).find((t) => t.dataset.projectId === id)!
const byLabel = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => b.getAttribute('aria-label') === label) ?? null
const click = (label: string) => fireEvent.click(byLabel(label)!)
const filter = () => screen.queryByRole('checkbox', { name: /^Show archived/ }) as HTMLInputElement | null
const status = () => document.querySelector('p.sr-only[aria-live="polite"]')?.textContent
const focusedLabel = () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent
const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const prefs = () => useSettingsStore.getState().projectPrefs

afterEach(() => {
  cleanup()
  importState = null
  mockUser.current = null
  toastSpy.success.mockClear()
  useProjectStore.setState({ projects: [], sprints: [], projectRoles: {}, cloudDataLoaded: false, shouldFocusNewProjectForm: false })
  useSettingsStore.setState({ projectPrefs: {} })
  useStorageModeStore.setState({ mode: 'local' })
})

describe('"Show archived (N)"', () => {
  it('is not shown with nothing archived; a colour alone is not archived', () => {
    renderTab(['A', 'B'].map((n) => project(n)), seed(['A', 'B'], [], { A: 'blue' }))
    expect(filter()).toBeNull()
    expect(shownNames()).toEqual(['A', 'B'])
  })

  it.each([
    { archived: ['B'], n: 1, shown: ['A', 'C', 'D'] },
    { archived: ['A', 'D'], n: 2, shown: ['B', 'C'] },
    { archived: ['A', 'B', 'D'], n: 3, shown: ['C'] },
  ])('with $n archived: off, named, and the archived hidden', ({ archived, n, shown }) => {
    renderTab(['A', 'B', 'C', 'D'].map((x) => project(x)), seed(['A', 'B', 'C', 'D'], archived))
    const box = filter()!
    expect([box.checked, box.getAttribute('name'), box.closest('label')?.textContent]).toEqual([false, 'showArchived', `Show archived (${n})`])
    expect(shownNames()).toEqual(shown)
  })

  it('counts archived PROJECTS, not entries left in the map by projects no longer held', () => {
    renderTab([project('A'), project('B')], { B: { archived: true }, gone: { archived: true }, other: { archived: true } })
    expect(filter()?.closest('label')?.textContent).toBe('Show archived (1)')
  })

  it('lists archived projects in their places when ticked, and hides them again', () => {
    renderTab(['A', 'B', 'C', 'D'].map((x) => project(x)), seed(['A', 'B', 'C', 'D'], ['A', 'C']))
    fireEvent.click(filter()!)
    expect(shownNames()).toEqual(['A', 'B', 'C', 'D'])
    fireEvent.click(filter()!)
    expect(shownNames()).toEqual(['B', 'D'])
  })

  it('is not saved: ticking it writes nothing, and a remount starts it off', () => {
    const { unmount } = renderTab([project('A'), project('B')], seed(['A', 'B'], ['B']))
    const before = JSON.stringify(prefs())
    fireEvent.click(filter()!)
    expect(JSON.stringify(prefs())).toBe(before)
    unmount()
    renderTab([project('A'), project('B')], seed(['A', 'B'], ['B']))
    expect(filter()!.checked).toBe(false)
  })

  it.each([
    { archived: ['B'], label: 'one archived' },
    { archived: ['A', 'B'], label: 'two archived' },
  ])('turns itself OFF when N returns to 0, and comes back off: $label', ({ archived }) => {
    renderTab(['A', 'B', 'C'].map((x) => project(x)), seed(['A', 'B', 'C'], archived))
    fireEvent.click(filter()!)
    for (const n of archived) click(`Unarchive ${n}`)
    expect(filter()).toBeNull()
    click('Archive A')
    expect(filter()!.checked).toBe(false)
    expect(shownNames()).toEqual(['B', 'C'])
  })
})

describe('every project archived', () => {
  it.each([{ n: 1 }, { n: 3 }])('filter off ($n): GanttApp\'s line, no welcome panel, no grid, not a note', ({ n }) => {
    const names = ['A', 'B', 'C'].slice(0, n)
    renderTab(names.map((x) => project(x)), seed(names, names))
    expect(screen.getByText(`All projects are archived. Select "Show archived (${n})" to see them.`)).not.toBeNull()
    expect(screen.queryByText(/Welcome to SPERT/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull()
    expect(screen.queryAllByRole('note')).toHaveLength(0)
  })

  it('filter on: the tiles, and no line', () => {
    renderTab([project('A'), project('B')], seed(['A', 'B'], ['A', 'B']))
    fireEvent.click(filter()!)
    expect(shownNames()).toEqual(['A', 'B'])
    expect(screen.queryByText(/All projects are archived/)).toBeNull()
  })

  it('no projects at all: the welcome panel, and no line', () => {
    renderTab([], {})
    expect(screen.getByText(/Welcome to SPERT/)).not.toBeNull()
    expect(screen.queryByText(/All projects are archived/)).toBeNull()
  })
})

describe('Archive, with "Show archived" off', () => {
  it.each([
    { names: ['A', 'B', 'C'], archived: [], target: 'A', focus: 'B', label: 'first: the next tile' },
    { names: ['A', 'B', 'C'], archived: [], target: 'B', focus: 'C', label: 'middle: the next tile' },
    { names: ['A', 'B', 'C'], archived: [], target: 'C', focus: 'B', label: 'last: the previous tile' },
    { names: ['A', 'B', 'C'], archived: ['B'], target: 'A', focus: 'C', label: 'past a hidden next project' },
    { names: ['A', 'B', 'C'], archived: ['B'], target: 'C', focus: 'A', label: 'past a hidden previous project' },
    { names: ['A', 'B', 'C', 'D'], archived: ['B', 'C'], target: 'A', focus: 'D', label: 'past two hidden projects' },
  ])('moves focus to a shown tile: $label', ({ names, archived, target, focus }) => {
    renderTab(names.map((x) => project(x)), seed(names, archived))
    click(`Archive ${target}`)
    expect(focusedLabel()).toBe(`View history for ${focus}`)
    expect(shownNames()).not.toContain(target)
    expect(prefs()[target]).toEqual({ archived: true })
  })

  it.each([
    { names: ['A'], archived: [], target: 'A', label: 'the only project' },
    { names: ['A', 'B', 'C'], archived: ['A', 'C'], target: 'B', label: 'the only one shown' },
  ])('moves focus to New Project: $label', ({ names, archived, target }) => {
    renderTab(names.map((x) => project(x)), seed(names, archived))
    click(`Archive ${target}`)
    expect(document.activeElement?.textContent).toMatch(/New Project/)
    expect(screen.getByText(/^All projects are archived\. Select/)).not.toBeNull()
  })

  it.each([
    { archived: [], n: 1 },
    { archived: ['B'], n: 2 },
    { archived: ['B', 'C'], n: 3 },
  ])('says where to find it, counting $n archived', ({ archived, n }) => {
    renderTab(['A', 'B', 'C', 'D'].map((x) => project(x)), seed(['A', 'B', 'C', 'D'], archived))
    click('Archive A')
    expect(status()).toBe(`Archived "A". Show archived (${n}) lists it.`)
  })

  it('keeps the project in the store, and its colour', () => {
    renderTab(['A', 'B', 'C'].map((x) => project(x)), seed(['A', 'B', 'C'], [], { B: 'purple' }))
    click('Archive B')
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['A', 'B', 'C'])
    expect(prefs()).toEqual({ B: { color: 'purple', archived: true } })
  })
})

describe('Archive with "Show archived" on, and Unarchive', () => {
  it('Archive keeps the tile, now archived, with focus on its UNARCHIVE (not the open button)', () => {
    renderTab(['A', 'B', 'C'].map((x) => project(x)), seed(['A', 'B', 'C'], ['C']))
    fireEvent.click(filter()!)
    click('Archive A')
    expect(shownNames()).toEqual(['A', 'B', 'C'])
    expect(tileOf('A').dataset.archived).toBe('true')
    expect(focusedLabel()).toBe('Unarchive A')
    expect(status()).toBe('Archived "A".')
    expect(filter()!.checked).toBe(true)
  })

  it.each([
    { archived: ['A'], left: undefined },
    { archived: ['A', 'C'], left: 'Show archived (1)' },
  ])('Unarchive moves focus to that tile\'s Archive and says so (left: $left)', ({ archived, left }) => {
    renderTab(['A', 'B', 'C'].map((x) => project(x)), seed(['A', 'B', 'C'], archived, { A: 'pink' }))
    fireEvent.click(filter()!)
    click('Unarchive A')
    expect(focusedLabel()).toBe('Archive A')
    expect(status()).toBe('Unarchived "A".')
    expect(prefs().A).toEqual({ color: 'pink' })
    expect(filter()?.closest('label')?.textContent).toBe(left)
  })
})

describe('names holding " and \\ (every lookup compares text, never builds a selector)', () => {
  const NAMES = ['Q"uote', 'Back\\slash', 'x"]\\[y']
  it.each(NAMES)('%j: Archive with the filter on focuses its Unarchive; Unarchive focuses its Archive; Archive off focuses the next', (name) => {
    renderTab([project('p1', name), project('p2', `${name} 2`), project('p3', 'Other')], { p3: { archived: true } })
    fireEvent.click(filter()!)
    click(`Archive ${name}`)
    expect(focusedLabel()).toBe(`Unarchive ${name}`)
    click(`Unarchive ${name}`)
    expect(focusedLabel()).toBe(`Archive ${name}`)
    fireEvent.click(filter()!)
    click(`Archive ${name}`)
    expect(focusedLabel()).toBe(`View history for ${name} 2`)
  })

  it.each(NAMES)('%j: a delete focuses the next shown tile', async (name) => {
    renderTab([project('p1', name), project('p2', `${name} 2`)], {})
    click(`Delete ${name}`)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })))
    expect(focusedLabel()).toBe(`View history for ${name} 2`)
  })
})

describe('Delete next to a hidden archived tile', () => {
  it.each([
    { names: ['A', 'B', 'C'], hidden: ['B'], target: 'A', focus: 'View history for C' },
    { names: ['A', 'B', 'C'], hidden: ['C'], target: 'B', focus: 'View history for A' },
    { names: ['A', 'B', 'C', 'D'], hidden: ['B', 'C'], target: 'A', focus: 'View history for D' },
  ])('focus goes to the next SHOWN tile ($target, hidden $hidden), and the entry goes with the project', async ({ names, hidden, target, focus }) => {
    renderTab(names.map((x) => project(x)), seed(names, hidden, { [target]: 'teal' }))
    click(`Delete ${target}`)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })))
    expect(focusedLabel()).toBe(focus)
    expect(prefs()[target]).toBeUndefined()
    for (const h of hidden) expect(prefs()[h]).toEqual({ archived: true })
  })
})

describe('a click on an archived tile (D30)', () => {
  it('unarchives it, opens Sprint History for it, and says so in a toast', () => {
    const onViewHistory = vi.fn()
    renderTab(['A', 'B', 'C'].map((x) => project(x)), seed(['A', 'B', 'C'], ['B'], { B: 'teal' }), { onViewHistory })
    fireEvent.click(filter()!)
    click('Unarchive and view history for B')
    expect(onViewHistory.mock.calls).toEqual([['B']])
    expect(prefs()).toEqual({ B: { color: 'teal' } })
    expect(toastSpy.success.mock.calls).toEqual([['Unarchived "B" and opened its sprint history.']])
  })

  it('a click on a tile that is not archived opens it, unarchives nothing and says nothing', () => {
    const onViewHistory = vi.fn()
    renderTab(['A', 'B', 'C'].map((x) => project(x)), seed(['A', 'B', 'C'], ['B']), { onViewHistory })
    fireEvent.click(filter()!)
    click('View history for C')
    expect(onViewHistory.mock.calls).toEqual([['C']])
    expect(prefs()).toEqual({ B: { archived: true } })
    expect(toastSpy.success).not.toHaveBeenCalled()
  })

  it('a click on Unarchive itself does only its job: no navigation, no toast', () => {
    const onViewHistory = vi.fn()
    renderTab([project('A'), project('B')], seed(['A', 'B'], ['B']), { onViewHistory })
    fireEvent.click(filter()!)
    click('Unarchive B')
    expect(onViewHistory).not.toHaveBeenCalled()
    expect(toastSpy.success).not.toHaveBeenCalled()
  })
})

describe('Clone, Load Sample and colouring an archived tile', () => {
  it('Clone copies the colour to the copy, never the archive', async () => {
    renderTab([project('A', 'Alpha')], { A: { color: 'purple', archived: true } })
    fireEvent.click(filter()!)
    click('Clone Alpha')
    const copy = useProjectStore.getState().projects.find((p) => p.name !== 'Alpha')!
    expect(prefs()[copy.id]).toEqual({ color: 'purple' })
  })

  it('Load Sample adds an uncoloured, unarchived project', () => {
    renderTab([project('A')], { A: { color: 'teal' } })
    fireEvent.click(screen.getByRole('button', { name: /Load Sample/ }))
    const sample = useProjectStore.getState().projects.find((p) => p.id !== 'A')!
    expect(prefs()[sample.id]).toBeUndefined()
  })

  it('colouring an archived tile keeps it archived, and clearing the colour too (known-bad G1)', () => {
    renderTab([project('A'), project('B')], seed(['A', 'B'], ['A']))
    fireEvent.click(filter()!)
    click('Tile color for A: No color')
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }))
    expect([tileOf('A').dataset.archived, prefs().A]).toEqual(['true', { color: 'teal', archived: true }])
    fireEvent.click(screen.getByRole('radio', { name: 'No color' }))
    expect([tileOf('A').dataset.archived, prefs().A]).toEqual(['true', { archived: true }])
  })
})

describe('D31: Archive, Unarchive and Tile color for every role and access state', () => {
  it.each([
    ['local', 'local', {}],
    ['cloud owner', 'cloud', { A: 'owner', B: 'owner' }],
    ['cloud editor', 'cloud', { A: 'editor', B: 'editor' }],
    ['cloud viewer', 'cloud', { A: 'viewer', B: 'viewer' }],
    ['not in cloud', 'cloud', { A: 'not-in-cloud', B: 'not-in-cloud' }],
  ] as const)('%s: all three render and change this person\'s settings; Delete stays as it is', (_label, mode, roles) => {
    mockUser.current = mode === 'cloud' ? { uid: 'u1' } : null
    renderTab([project('A'), project('B')], { B: { archived: true } }, { mode, roles: roles as Record<string, ProjectAccess> })
    fireEvent.click(filter()!)
    expect(byLabel('Archive A')).not.toBeNull()
    expect(byLabel('Unarchive B')).not.toBeNull()
    click('Archive A')
    expect(prefs().A).toEqual({ archived: true })
    click('Unarchive B')
    expect(prefs().B).toBeUndefined()
    const colorButton = Array.from(tileOf('A').querySelectorAll('button')).find((b) => b.getAttribute('aria-label')?.startsWith('Tile color for A'))!
    fireEvent.click(colorButton)
    fireEvent.click(screen.getByRole('radio', { name: 'Pink' }))
    expect(prefs().A).toEqual({ color: 'pink', archived: true })
    const del = Array.from(tileOf('A').querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Delete A') as HTMLButtonElement
    const roleA = (roles as Record<string, ProjectAccess>).A
    expect(del.disabled).toBe(roleA === 'viewer' || roleA === 'not-in-cloud' || roleA === 'editor')
  })
})

describe('the archived look and the tints (class strings; the browser check measures the paint)', () => {
  it.each([
    ['none', 'bg-[#f9f9f9]', 'dark:bg-[#16213e]'],
    ['blue', 'bg-[#e0ebfe]', 'dark:bg-[#1e3667]'],
    ['teal', 'bg-[#d9f4f1]', 'dark:bg-[#164255]'],
    ['slate', 'bg-[#e6e9ec]', 'dark:bg-[#27334f]'],
    ['purple', 'bg-[#f1e4fe]', 'dark:bg-[#362c67]'],
    ['pink', 'bg-[#fce2ef]', 'dark:bg-[#452a52]'],
  ] as const)('%s tint on the tile root, replacing the untinted background', (color, light, dark) => {
    renderTab([project('A')], color === 'none' ? {} : { A: { color } })
    const c = classes(tileOf('A'))
    expect(c).toEqual(expect.arrayContaining([light, dark]))
    expect(c.filter((x) => /^(dark:)?bg-/.test(x))).toHaveLength(2)
  })

  it('archived: half the tint, dashed border, the meta colour for the name, and the badge after the access badge', () => {
    mockUser.current = { uid: 'u1' }
    renderTab([project('A'), project('B')], { A: { color: 'blue', archived: true } }, { mode: 'cloud', roles: { A: 'viewer', B: 'viewer' } })
    fireEvent.click(filter()!)
    const tile = tileOf('A')
    expect(classes(tile)).toEqual(
      expect.arrayContaining(['bg-[color-mix(in_srgb,#e0ebfe_50%,#f9f9f9)]', 'border-dashed', 'border-[#ddd]', 'dark:border-[#4a5568]']),
    )
    expect(classes(tile)).not.toContain('border-[#eee]')
    expect(classes(tile.querySelector('h3'))).toEqual(expect.arrayContaining(['text-[#666]', 'dark:text-[#a0aec0]']))
    const badges = Array.from(tile.querySelectorAll('h3 ~ span')).map((s) => s.textContent).filter((t) => t === 'View only' || t === 'Archived')
    expect(badges).toEqual(['View only', 'Archived'])
    expect(tile.querySelector('h3 button')?.getAttribute('aria-label')).toBe('Unarchive and view history for A (View only)')
    // An unarchived tile beside it has none of it.
    expect(classes(tileOf('B'))).not.toContain('border-dashed')
    expect(within(tileOf('B')).queryByText('Archived')).toBeNull()
  })

  it('Unarchive is outside the revealed row, in its own group raised above the name button; Archive is not shown', () => {
    renderTab([project('A'), project('B')], { A: { archived: true } })
    fireEvent.click(filter()!)
    const unarchive = byLabel('Unarchive A')!
    expect(unarchive.closest('[class*="group-hover/tile:opacity-100"]')).toBeNull()
    expect(classes(unarchive.parentElement)).toEqual(expect.arrayContaining(['relative', 'z-[1]']))
    expect(byLabel('Archive A')).toBeNull()
    expect(byLabel('Tile color for A: No color')!.closest('[class*="group-hover/tile:opacity-100"]')).not.toBeNull()
  })
})

describe('the reveal hook (GanttApp parity): data-popopen with the group-data class', () => {
  it('while the popover is open the tile carries data-popopen="true", which the revealed row reads; closed, it does not', () => {
    renderTab([project('A'), project('B')], {})
    const row = byLabel('Export A')!.parentElement!
    expect(classes(row)).toContain('group-data-[popopen=true]/tile:opacity-100')
    expect(row.parentElement!.closest('.group\\/tile')).toBe(tileOf('A'))
    expect(tileOf('A').dataset.popopen).toBeUndefined()
    click('Tile color for A: No color')
    expect(tileOf('A').dataset.popopen).toBe('true')
    expect(tileOf('B').dataset.popopen).toBeUndefined()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(tileOf('A').dataset.popopen).toBeUndefined()
  })

  it('the popover sits beside the revealed row, not inside it: its containing block is the tile', () => {
    renderTab([project('A')], {})
    click('Tile color for A: No color')
    const pop = screen.getByRole('dialog', { name: 'Tile color' })
    const row = byLabel('Export A')!.parentElement!
    expect(row.contains(pop)).toBe(false)
    expect(classes(pop.parentElement)).not.toContain('relative')
    expect(pop.parentElement!.parentElement).toBe(tileOf('A'))
    expect(classes(pop)).toEqual(expect.arrayContaining(['absolute', 'z-20', 'right-1.5', 'top-[calc(100%-6px)]']))
  })

  it('the popover does not come back with its tile: archived away and back, it stays closed', () => {
    renderTab([project('A'), project('B')], {})
    click('Tile color for A: No color')
    expect(screen.queryByRole('dialog', { name: 'Tile color' })).not.toBeNull()
    act(() => {
      useSettingsStore.getState().setProjectArchived('A', true) // the tile leaves the grid (filter off)
    })
    act(() => {
      useSettingsStore.getState().setProjectArchived('A', false)
    })
    expect(tileOf('A')).toBeDefined()
    expect(screen.queryByRole('dialog', { name: 'Tile color' })).toBeNull()
  })

  it('the popover does not come back after a dialog took over the tab', () => {
    renderTab([project('A'), project('B')], {})
    click('Tile color for A: No color')
    act(() => {
      useProjectStore.setState({ shouldFocusNewProjectForm: true }) // the New Project dialog opens
    })
    expect(screen.getByRole('dialog', { name: 'New Project' })).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Tile color' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'New Project' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Tile color' })).toBeNull()
  })

  it('Delete closes an open popover before its dialog opens', () => {
    renderTab([project('A'), project('B')], {})
    click('Tile color for A: No color')
    click('Delete A')
    expect(screen.queryByRole('dialog', { name: 'Tile color' })).toBeNull()
  })
})

describe('Escape in the popover with an import preview waiting', () => {
  // ⚠️ In jsdom the React root is a div, so the popover's stopPropagation alone would make the
  // first case pass. The guards are the popover's own defaultPrevented test
  // (ProjectColorControl.test.tsx) and the release's real Escape in a browser; this case proves
  // the wiring on the tab, not the mechanism.
  async function withPreview() {
    renderTab([project('A', 'Alpha'), project('B', 'Bravo')], {})
    const file = JSON.stringify(
      buildProjectSubsetExport(['A'], { projects: [project('A', 'Alpha')], sprints: [], originRef: 'o', storageRef: 's', changeLog: [] }),
    )
    await act(async () => {
      await importState!.ingestPayload(file, 'file')
    })
    expect(screen.getByRole('region', { name: /Review import/i })).not.toBeNull()
  }

  it('Escape in the popover closes the popover and the preview stays', async () => {
    await withPreview()
    click('Tile color for Alpha: No color')
    const radio = screen.getByRole('radio', { name: 'No color' })
    fireEvent.keyDown(radio, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Tile color' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Review import/i })).not.toBeNull()
  })

  it('MUST-DIFFER: with the popover closed, Escape cancels the preview', async () => {
    await withPreview()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: /Review import/i })).toBeNull()
  })
})
