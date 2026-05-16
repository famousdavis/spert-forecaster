// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// --- Module mocks --------------------------------------------------------
//
// ProjectsTab pulls in Firebase, auth, sharing — everything we don't care
// about for "import wiring" tests. Mock the integration surface so the
// rendered tree depends only on what useImportState and ImportPreviewSection
// produce.

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('@/shared/hooks/useStorageMode', () => ({
  useStorageMode: () => ({ mode: 'local', setMode: vi.fn() }),
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

function resetStore() {
  useProjectStore.setState({
    projects: [],
    sprints: [],
    viewingProjectId: null,
    forecastInputs: {},
    burnUpConfigs: {},
    _originRef: '',
    _changeLog: [],
  })
}

beforeEach(() => {
  resetStore()
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
