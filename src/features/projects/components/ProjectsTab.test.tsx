// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
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
import { useProjectStore } from '@/shared/state/project-store'
import { loadOwnedProjectIds } from '@/shared/firebase/firestore-driver'

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
    render(<ProjectsTab />)
    expect(screen.getByText('Projects')).toBeTruthy()
  })

  it('renders the Import button', () => {
    render(<ProjectsTab />)
    expect(screen.getByRole('button', { name: /Import projects from JSON/i })).toBeTruthy()
  })

  it('hides Export All when projects array is empty', () => {
    render(<ProjectsTab />)
    expect(screen.queryByRole('button', { name: /Export all projects/i })).toBeNull()
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
    render(<ProjectsTab />)
    expect(screen.getByRole('button', { name: /Export all projects/i })).toBeTruthy()
  })

  it('hides Load Sample toolbar button when projects array is empty (empty-state CTA covers this case)', () => {
    render(<ProjectsTab />)
    // Toolbar button has accessible name "Load Sample" (exact); empty-state CTA's
    // accessible name is "Load Sample Project" (distinct). Anchored regex prevents
    // the empty-state from matching here.
    expect(screen.queryByRole('button', { name: /^Load Sample$/i })).toBeNull()
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
    render(<ProjectsTab />)
    expect(screen.getByRole('button', { name: /^Load Sample$/i })).toBeTruthy()
  })

  // v0.33.3 — ProjectForm is hidden on first-touch until the user signals intent.
  describe('ProjectForm visibility gating (v0.33.3)', () => {
    it('hides the ProjectForm on first-touch (zero projects, no edit, no focus flag)', () => {
      render(<ProjectsTab />)
      expect(screen.queryByLabelText('Project Name')).toBeNull()
    })

    it('shows the ProjectForm after clicking "Create New Project" in the welcome empty-state', () => {
      render(<ProjectsTab />)
      // Welcome empty-state button has visible text "Create New Project".
      const createBtn = screen.getByRole('button', { name: /Create New Project/i })
      fireEvent.click(createBtn)
      expect(screen.getByLabelText('Project Name')).toBeTruthy()
    })

    it('shows the ProjectForm when shouldFocusNewProjectForm flag is set on mount (cross-tab path)', () => {
      // Forecast-tab CTA sets the flag, switches tabs, ProjectsTab mounts with flag true.
      useProjectStore.setState({ shouldFocusNewProjectForm: true })
      render(<ProjectsTab />)
      expect(screen.getByLabelText('Project Name')).toBeTruthy()
    })

    it('shows the ProjectForm when at least one project exists (always-visible-on-populated)', () => {
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
      render(<ProjectsTab />)
      expect(screen.getByLabelText('Project Name')).toBeTruthy()
    })
  })

  it('does NOT render the preview section initially (importPreview is null)', () => {
    render(<ProjectsTab />)
    expect(screen.queryByRole('region', { name: /Review import/i })).toBeNull()
  })

  it('does NOT import MergeImportDialog (regression guard)', () => {
    const source = readFileSync(
      resolve(__dirname, 'ProjectsTab.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/MergeImportDialog/)
  })

  it('does NOT reference old store actions importData / mergeImportData / mergeProjectSubset', () => {
    const source = readFileSync(
      resolve(__dirname, 'ProjectsTab.tsx'),
      'utf8',
    )
    // Allow `importDataAndSelectFirst` (it contains "importData" as a substring),
    // but reject standalone usages of the deprecated actions.
    expect(source).not.toMatch(/\.importData\b(?!AndSelectFirst)/)
    expect(source).not.toMatch(/\.mergeImportData\b/)
    expect(source).not.toMatch(/\.mergeProjectSubset\b/)
  })

  it('hidden file input uses name "projectImportFile" (preserved attribute)', () => {
    const { container } = render(<ProjectsTab />)
    const input = container.querySelector('input[type="file"]')
    expect(input?.getAttribute('name')).toBe('projectImportFile')
  })
})

// v0.35.2 — Share button refresh-after-snapshot
//
// In cloud mode, the Share button visibility depends on `ownedProjectIds`,
// populated by a one-shot `loadOwnedProjectIds(uid)` Firestore query. Before
// v0.35.2, the useEffect that drives that query keyed on `projects.length`,
// which produced a stale-empty result for newly-created projects:
// `addProject` mutates the array (length grows), the query fires immediately,
// but the v0.35.1 `pendingCreateTimers` 200ms debounce + Firestore roundtrip
// means the doc isn't yet visible to the `where('owner', '==', uid)` index —
// so the query returns an empty set and the Share button stays hidden until
// the user navigates away and back.
//
// Fix: key the effect on the `projects` array reference, not its length, so
// the query re-runs when `replaceProjectsFromCloud` delivers the post-create
// snapshot — the exact moment Firestore's owner index becomes consistent.
describe('ProjectsTab — share-button refresh after cloud snapshot (v0.35.2)', () => {
  it('re-runs loadOwnedProjectIds when the projects array reference changes (snapshot delivery)', async () => {
    mockAuthMode.user = { uid: 'user-1' }
    mockAuthMode.mode = 'cloud'

    // Initial render: no projects. loadOwnedProjectIds called once with empty result.
    render(<ProjectsTab />)
    await waitFor(() => {
      expect(vi.mocked(loadOwnedProjectIds)).toHaveBeenCalledTimes(1)
    })

    // Simulate replaceProjectsFromCloud delivering a freshly-confirmed project
    // (this is the post-Firestore-create snapshot that v0.35.1 unblocked).
    // Stub the query to now return the project's ID.
    vi.mocked(loadOwnedProjectIds).mockResolvedValueOnce(new Set(['p1']))

    act(() => {
      useProjectStore.setState({
        projects: [
          {
            id: 'p1',
            name: 'Sample',
            unitOfMeasure: 'points',
            createdAt: 't',
            updatedAt: 't',
          },
        ],
      })
    })

    // The new array reference triggers the effect; query re-runs.
    await waitFor(() => {
      expect(vi.mocked(loadOwnedProjectIds)).toHaveBeenCalledTimes(2)
    })

    // And a second snapshot for the SAME project (e.g. co-editor edit) — array
    // reference changes again, query re-runs. Confirms we're not keyed on a
    // length check that would skip this case.
    act(() => {
      useProjectStore.setState({
        projects: [
          {
            id: 'p1',
            name: 'Sample (edited)',
            unitOfMeasure: 'points',
            createdAt: 't',
            updatedAt: 't2',
          },
        ],
      })
    })

    await waitFor(() => {
      expect(vi.mocked(loadOwnedProjectIds)).toHaveBeenCalledTimes(3)
    })
  })

  it('does NOT call loadOwnedProjectIds in local mode (gating preserved)', async () => {
    mockAuthMode.user = { uid: 'user-1' }
    mockAuthMode.mode = 'local'

    render(<ProjectsTab />)

    // Give the effect a tick to no-op.
    await new Promise((r) => setTimeout(r, 0))
    expect(vi.mocked(loadOwnedProjectIds)).not.toHaveBeenCalled()

    act(() => {
      useProjectStore.setState({
        projects: [
          {
            id: 'p1',
            name: 'Sample',
            unitOfMeasure: 'points',
            createdAt: 't',
            updatedAt: 't',
          },
        ],
      })
    })

    await new Promise((r) => setTimeout(r, 0))
    expect(vi.mocked(loadOwnedProjectIds)).not.toHaveBeenCalled()
  })
})
