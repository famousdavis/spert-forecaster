// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A defect in the export check must not cost the user their file. Here the check
 * THROWS, and every entry point still saves, still confirms, and shows no warning.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/shared/state/export-check', () => ({
  checkExportedFile: () => { throw new Error('check defect') },
}))
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

import { toast } from 'sonner'
import { ProjectsTab } from './ProjectsTab'
import { useImportState } from '../hooks/useImportState'
import { ExportProjectsSection } from '@/features/settings/components/ExportProjectsSection'
import { ExportCheckWarning } from '@/shell/components/ExportCheckWarning'
import { useProjectStore } from '@/shared/state/project-store'

const T = '2026-01-01T00:00:00.000Z'
let saved: string[] = []

beforeEach(() => {
  saved = []
  vi.mocked(toast.success).mockClear()
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useProjectStore.setState({
    projects: [{ id: 'a', name: 'Alpha', unitOfMeasure: 'u'.repeat(201), milestones: [], createdAt: T, updatedAt: T }],
    sprints: [], _originRef: 'origin-token', _changeLog: [],
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function renderProjects() {
  function Harness() {
    return (<><ExportCheckWarning /><ProjectsTab importState={useImportState()} /></>)
  }
  render(<Harness />)
}

describe('a throwing check cannot block the save', () => {
  it('Export All', () => {
    renderProjects()
    fireEvent.click(screen.getByRole('button', { name: 'Export all projects as JSON' }))
    expect(saved).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Project data exported')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('the project row\'s download', () => {
    renderProjects()
    fireEvent.click(screen.getByRole('button', { name: 'Export Alpha' }))
    expect(saved).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Project exported')
  })

  it('Settings → Export Projects', () => {
    render(<ExportProjectsSection />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: /^Export \(1\)$/ }))
    expect(saved).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Project exported')
  })
})
