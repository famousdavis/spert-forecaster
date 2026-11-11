// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// --- Module mocks --------------------------------------------------------
//
// ProjectsTab pulls in Firebase, auth, sharing — everything we don't care
// about for "import wiring" tests. Mock the integration surface so the
// rendered tree depends only on what useImportState and ImportPreviewSection
// produce.
//
// `mockAuthMode` is hoisted so tests can override the active user and storage
// mode per-test (default: signed-out, local mode — matches the existing
// import-wiring tests). See the share-button refresh suite below.

const mockAuthMode = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  mode: 'local' as 'local' | 'cloud',
}))

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: mockAuthMode.user }),
}))

vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: mockAuthMode.mode, setMode: vi.fn() }),
}))

vi.mock('@/shared/firebase/firestore-driver', () => ({
  loadOwnedProjectIds: vi.fn().mockResolvedValue(new Set()),
}))

vi.mock('@/shared/firebase/config', () => ({ auth: null }))
vi.mock('@/shared/firebase/sync-bus', () => ({
  syncBus: { emit: vi.fn(), subscribe: () => () => {} },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Mock useIsClient to bypass the SSR loading branch.
vi.mock('@/shared/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/shared/hooks')>('@/shared/hooks')
  return { ...actual, useIsClient: () => true }
})

import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { loadOwnedProjectIds } from '@/shared/firebase/firestore-driver'

/**
 * Mount ProjectsTab with a REAL `useImportState`, the way AppShell does.
 *
 * ⚠️ This MUST be a wrapper component that calls the hook. Do NOT replace it with a
 * hand-built object satisfying `ReturnType<typeof useImportState>`. Note that none of the
 * `vi.mock` calls above mocks `useImportState` — every test in this file exercises the real
 * hook against real store state, and that is the point of the file. A fake bundle would
 * typecheck, go green, and quietly turn a wiring suite into a mock-assertion suite: coverage
 * unchanged, meaning gone.
 */
function renderProjectsTab() {
  function Harness() {
    const importState = useImportState()
    return <ProjectsTab importState={importState} />
  }
  return render(<Harness />)
}

function resetStore() {
  useProjectStore.setState({
    projects: [],
    sprints: [],
    viewingProjectId: null,
    forecastInputs: {},
    burnUpConfigs: {},
    shouldFocusNewProjectForm: false,
    _originRef: '',
    _changeLog: [],
    cloudDataLoaded: false,
    projectRoles: {},
  })
}

beforeEach(() => {
  resetStore()
  // Restore defaults (signed-out, local mode). Without this a test that
  // mutates mockAuthMode leaks into subsequent tests in random order.
  mockAuthMode.user = null
  mockAuthMode.mode = 'local'
  vi.mocked(loadOwnedProjectIds).mockReset()
  vi.mocked(loadOwnedProjectIds).mockResolvedValue(new Set())
})

describe('ProjectsTab — import wiring', () => {
  it('renders without crashing', () => {
    renderProjectsTab()
    expect(screen.getByText('Projects')).toBeTruthy()
  })

  it('renders the Import button', () => {
    renderProjectsTab()
    expect(screen.getByRole('button', { name: /Import projects from JSON/i })).toBeTruthy()
  })

  // v0.48.0: rendered and disabled with no projects (was hidden until v0.48.0).
  it('renders Export All disabled when projects array is empty', () => {
    renderProjectsTab()
    const exportAll = screen.getByRole('button', { name: /Export all projects/i }) as HTMLButtonElement
    expect(exportAll.disabled).toBe(true)
  })

  it('shows Export All when at least one project exists', () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'p1',
          name: 'Test',
          unitOfMeasure: 'pts',
          createdAt: 't',
          updatedAt: 't',
        },
      ],
    })
    renderProjectsTab()
    const exportAll = screen.getByRole('button', { name: /Export all projects/i }) as HTMLButtonElement
    expect(exportAll.disabled).toBe(false)
  })

  // v0.48.0: the toolbar's Load Sample shows with no projects too, beside the empty
  // state's own button, which stays (was hidden at zero since v0.33.2).
  it('renders the Load Sample toolbar button when projects array is empty, and the empty state keeps its own', () => {
    renderProjectsTab()
    // Toolbar button has accessible name "Load Sample" (exact); empty-state CTA's
    // accessible name is "Load Sample Project" (distinct). Anchored regexes keep them apart.
    expect(screen.getByRole('button', { name: /^Load Sample$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Load Sample Project$/i })).toBeTruthy()
  })

  it('shows Load Sample toolbar button when at least one project exists (v0.33.2)', () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'p1',
          name: 'Test',
          unitOfMeasure: 'pts',
          createdAt: 't',
          updatedAt: 't',
        },
      ],
    })
    renderProjectsTab()
    expect(screen.getByRole('button', { name: /^Load Sample$/i })).toBeTruthy()
  })

  // v0.33.3 — ProjectForm is hidden on first-touch until the user signals intent.
  // v0.48.0 — and hidden with projects listed too, until New Project.
  describe('ProjectForm visibility gating (v0.33.3, v0.48.0)', () => {
    it('hides the ProjectForm on first-touch (zero projects, no edit, no focus flag)', () => {
      renderProjectsTab()
      expect(screen.queryByLabelText('Project Name')).toBeNull()
    })

    it('shows the ProjectForm after clicking "Create New Project" in the welcome empty-state', () => {
      renderProjectsTab()
      // Welcome empty-state button has visible text "Create New Project".
      const createBtn = screen.getByRole('button', { name: /Create New Project/i })
      fireEvent.click(createBtn)
      expect(screen.getByLabelText('Project Name')).toBeTruthy()
    })

    it('shows the ProjectForm when shouldFocusNewProjectForm flag is set on mount (cross-tab path)', () => {
      // Forecast-tab CTA sets the flag, switches tabs, ProjectsTab mounts with flag true.
      useProjectStore.setState({ shouldFocusNewProjectForm: true })
      renderProjectsTab()
      expect(screen.getByLabelText('Project Name')).toBeTruthy()
    })

    // Was "shows the ProjectForm when at least one project exists" until v0.48.0.
    it('hides the ProjectForm with projects listed until New Project is pressed (known-bad: always-visible-on-populated)', () => {
      useProjectStore.setState({
        projects: [
          {
            id: 'p1',
            name: 'Existing',
            unitOfMeasure: 'pts',
            createdAt: 't',
            updatedAt: 't',
          },
        ],
      })
      renderProjectsTab()
      expect(screen.queryByLabelText('Project Name')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
      expect(screen.getByLabelText('Project Name')).toBe(document.activeElement)
    })
  })

  it('does NOT render the preview section initially (importPreview is null)', () => {
    renderProjectsTab()
    expect(screen.queryByRole('region', { name: /Review import/i })).toBeNull()
  })

  // v0.49.0 split ProjectsTab.tsx (444 lines) into these files, so the two scans below read all
  // of them: code that moved out of the tab is still scanned. Must-find control: every file is
  // read (each carries the copyright header), and the scan reaches code that moved out of
  // ProjectsTab.tsx (the single-project export and the dialog's submit).
  const DASHBOARD_FILES = [
    'ProjectsTab.tsx',
    'ProjectList.tsx',
    'ProjectTile.tsx',
    'ProjectDialog.tsx',
    'ImportBanner.tsx',
    'dashboard-styles.ts',
    '../hooks/useProjectDialog.ts',
    '../hooks/useProjectDelete.ts',
    '../hooks/useProjectTileActions.ts',
    '../lib/tile-meta.ts',
    '../lib/tile-focus.ts',
    // v0.50.0
    'ArchiveControls.tsx',
    'ProjectColorControl.tsx',
    'tile-color-styles.ts',
    '../hooks/useProjectArchive.ts',
  ]
  const dashboardSources = () => DASHBOARD_FILES.map((f) => readFileSync(resolve(__dirname, f), 'utf8'))

  it('the scans below read every dashboard file, including the code moved out of ProjectsTab.tsx (control)', () => {
    const sources = dashboardSources()
    expect(sources.map((s) => s.includes('Copyright (C) 2026 William W. Davis'))).toEqual(DASHBOARD_FILES.map(() => true))
    const all = sources.join('\n')
    expect(all).toMatch(/exportSingleProject\(projectId/)
    expect(all).toMatch(/updateProject\(editingProject\.id, data\)/)
  })

  it('does NOT import MergeImportDialog (regression guard)', () => {
    const source = dashboardSources().join('\n')
    expect(source).not.toMatch(/MergeImportDialog/)
  })

  it('does NOT reference old store actions importData / mergeImportData / mergeProjectSubset', () => {
    const source = dashboardSources().join('\n')
    // Allow `importDataAndSelectFirst` (it contains "importData" as a substring),
    // but reject standalone usages of the deprecated actions.
    expect(source).not.toMatch(/\.importData\b(?!AndSelectFirst)/)
    expect(source).not.toMatch(/\.mergeImportData\b/)
    expect(source).not.toMatch(/\.mergeProjectSubset\b/)
  })

  it('hidden file input uses name "projectImportFile" (preserved attribute)', () => {
    const { container } = renderProjectsTab()
    const input = container.querySelector('input[type="file"]')
    expect(input?.getAttribute('name')).toBe('projectImportFile')
  })
})

// Brief 39 PR B (OD-6) — replaces the v0.35.2 "share-button refresh after cloud
// snapshot" suite, whose mechanism is gone.
//
// Share used to be gated on `ownedProjectIds`, from a one-shot
// `loadOwnedProjectIds(uid)` Firestore query that v0.35.2 re-ran on every
// `projects` array change so a newly created project's Share button appeared
// once the post-create snapshot landed. Brief 39 retires the query: every
// cloud snapshot now carries the user's role per project (`projectRoles`), and
// Share shows only on an explicit 'owner' entry, signed in, with the first
// cloud load done. The v0.35.2 property is kept and asserted here: the
// post-create snapshot makes Share appear with no navigation.
describe('ProjectsTab — the Share button follows the role map (Brief 39 PR B, OD-6; was v0.35.2)', () => {
  const p1 = { id: 'p1', name: 'Sample', unitOfMeasure: 'points', createdAt: 't', updatedAt: 't' }
  const shareButton = () => screen.queryByRole('button', { name: 'Share project' })

  it('appears once a snapshot names the user owner of a project created here, with no query and no navigation (known-bad: gate still on a one-shot query)', () => {
    mockAuthMode.user = { uid: 'user-1' }
    mockAuthMode.mode = 'cloud'
    useProjectStore.setState({ projects: [p1], cloudDataLoaded: true, projectRoles: {} })
    renderProjectsTab()
    expect(shareButton()).toBeNull() // still being created here: no role entry yet

    act(() => {
      useProjectStore.setState({ projectRoles: { p1: 'owner' } })
    })

    expect(shareButton()).not.toBeNull()
    expect(vi.mocked(loadOwnedProjectIds)).not.toHaveBeenCalled()
  })

  it('is not offered in local mode, even signed in (known-bad: gate ignores the cloud load)', () => {
    mockAuthMode.user = { uid: 'user-1' }
    mockAuthMode.mode = 'local'
    useProjectStore.setState({ projects: [p1], cloudDataLoaded: false, projectRoles: {} })
    renderProjectsTab()
    expect(shareButton()).toBeNull()
  })
})
