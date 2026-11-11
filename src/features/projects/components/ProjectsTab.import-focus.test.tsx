// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Focus once the import preview goes (v0.50.3, F4 and F5): applied by Replace all data or by
 * Apply import, or cancelled by its Cancel or by Escape. Focus that was inside the preview goes to
 * the toolbar's Import; focus the user has put anywhere else stays there. Known-bad (measured on a
 * production build in v0.50.2 for Replace all data): <body>.
 *
 * Mounted through a harness that calls the REAL `useImportState`, as AppShell does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/shared/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks')>('@/shared/hooks')
  return { ...actual, useIsClient: () => true }
})

import { useRef, useState } from 'react'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useImportFocusReturn } from '../hooks/useImportFocusReturn'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string, name: string): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: T, updatedAt: T })
const ABC = [project('a', 'Alpha'), project('b', 'Bravo'), project('c', 'Charlie')]

afterEach(() => {
  cleanup()
  useProjectStore.setState({ projects: [], sprints: [], projectRoles: {}, cloudDataLoaded: false })
  useStorageModeStore.setState({ mode: 'local' })
})

const preview = () => screen.queryByRole('region', { name: 'Review import' })
const importButton = () => screen.getByRole('button', { name: 'Import projects from JSON' })
const focused = () => document.activeElement

/** The Projects tab with a workspace file (Export All of ABC) waiting in the preview. */
async function withPreview() {
  useStorageModeStore.setState({ mode: 'local' })
  useProjectStore.setState({ projects: ABC, sprints: [], cloudDataLoaded: false, projectRoles: {} })
  const file = JSON.stringify(useProjectStore.getState().exportData())
  let importState: ReturnType<typeof useImportState> | null = null
  function Harness() {
    importState = useImportState()
    return <ProjectsTab importState={importState} />
  }
  render(<Harness />)
  await act(async () => {
    await importState!.ingestPayload(file, 'file')
  })
  expect(preview()).not.toBeNull()
}
/** Focus a preview control and press it, as a keyboard user does (a click in jsdom moves no focus). */
function press(el: HTMLElement) {
  el.focus()
  fireEvent.click(el)
}

describe('the preview goes, focus was in it → the toolbar\'s Import (known-bad: <body>)', () => {
  it('Replace all data, confirmed: Import, once the data is written', async () => {
    await withPreview()
    press(within(preview()!).getByRole('button', { name: 'Replace all data' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Replace all data' })
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }))
    })
    expect([preview(), screen.getByRole('status').textContent, focused()]).toEqual([
      null,
      expect.stringContaining('All data replaced.'),
      importButton(),
    ])
    expect((focused() as HTMLButtonElement).disabled).toBe(false)
  })

  it('Apply import (merge): Import', async () => {
    await withPreview()
    fireEvent.click(within(preview()!).getByRole('radio', { name: 'Merge into workspace' }))
    await act(async () => {
      press(within(preview()!).getByRole('button', { name: 'Apply import' }))
    })
    expect([preview(), focused()]).toEqual([null, importButton()])
  })

  it('its Cancel: Import', async () => {
    await withPreview()
    press(within(preview()!).getByRole('button', { name: 'Cancel' }))
    expect([preview(), focused()]).toEqual([null, importButton()])
  })

  it('Escape, from inside it: Import', async () => {
    await withPreview()
    const cancel = within(preview()!).getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Escape' })
    expect([preview(), focused()]).toEqual([null, importButton()])
  })
})

describe('focus the user put elsewhere stays there', () => {
  it('the tab opening with no preview moves no focus', () => {
    useProjectStore.setState({ projects: ABC, sprints: [], cloudDataLoaded: false, projectRoles: {} })
    function Harness() {
      return <ProjectsTab importState={useImportState()} />
    }
    render(<Harness />)
    expect(focused()).toBe(document.body)
  })

  it('a preview arriving keeps its own focus rule (its heading), never Import', async () => {
    await withPreview()
    expect([focused()?.tagName, preview()!.contains(focused()), focused() === importButton()]).toEqual(['H2', true, false])
  })

  it('Escape with focus on Load Sample: the preview goes, focus stays on Load Sample', async () => {
    await withPreview()
    const sample = screen.getByRole('button', { name: 'Load Sample' })
    sample.focus()
    fireEvent.keyDown(sample, { key: 'Escape' })
    expect([preview(), focused()]).toEqual([null, sample])
  })

  it('"Replace all data" cancelled: the preview stays, and focus goes back to its button (v0.50.2), not Import', async () => {
    await withPreview()
    const replace = within(preview()!).getByRole('button', { name: 'Replace all data' })
    press(replace)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect([preview() !== null, focused()]).toEqual([true, replace])
  })
})

describe('useImportFocusReturn: Import disabled → New Project', () => {
  it('with Import disabled when the preview goes, focus lost with it goes to New Project', () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      const newProjectRef = useRef<HTMLButtonElement>(null)
      const importRef = useImportFocusReturn(open, newProjectRef)
      return (
        <>
          <button ref={importRef} disabled>Import</button>
          <button ref={newProjectRef}>New Project</button>
          {open && <button onClick={() => setOpen(false)}>Close preview</button>}
        </>
      )
    }
    render(<Harness />)
    press(screen.getByRole('button', { name: 'Close preview' }))
    expect(focused()).toBe(screen.getByRole('button', { name: 'New Project' }))
  })
})
