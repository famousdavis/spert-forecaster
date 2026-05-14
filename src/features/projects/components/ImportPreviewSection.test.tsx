// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportPreviewSection } from './ImportPreviewSection'
import type {
  ParsedImportData,
  ImportConflict,
  ConflictAction,
} from '@/shared/state/import-utils'
import type { Project, Sprint } from '@/shared/types'
import type { ExportData } from '@/shared/state/import-validation'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: 'Test Project',
    unitOfMeasure: 'Story Points',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function projectExport(projects: Project[], sprints: Sprint[] = []): ParsedImportData {
  return { exportType: 'spert-forecaster-project-export', projects, sprints }
}

function legacyImport(projects: Project[], sprints: Sprint[] = []): ParsedImportData {
  const data: ExportData = {
    version: '0.30.0',
    exportedAt: '2026-05-14',
    projects,
    sprints,
  }
  return { exportType: 'legacy', projects, sprints, _originalExportData: data }
}

interface Setup {
  imported?: ParsedImportData
  conflicts?: ImportConflict[]
  decisions?: Map<string, ConflictAction>
  mode?: 'merge' | 'replace-all'
  applying?: boolean
  onModeChange?: (m: 'merge' | 'replace-all') => void
  onDecisionChange?: (id: string, a: ConflictAction) => void
  onConfirm?: () => void
  onRequestReplaceAll?: () => void
  onCancel?: () => void
}

function renderSection(opts: Setup = {}) {
  const imported = opts.imported ?? projectExport([])
  const handlers = {
    onModeChange: opts.onModeChange ?? vi.fn(),
    onDecisionChange: opts.onDecisionChange ?? vi.fn(),
    onConfirm: opts.onConfirm ?? vi.fn(),
    onRequestReplaceAll: opts.onRequestReplaceAll ?? vi.fn(),
    onCancel: opts.onCancel ?? vi.fn(),
  }
  render(
    <ImportPreviewSection
      imported={imported}
      conflicts={opts.conflicts ?? []}
      decisions={opts.decisions ?? new Map()}
      mode={opts.mode ?? 'merge'}
      applying={opts.applying ?? false}
      idPrefix="t"
      {...handlers}
    />,
  )
  return handlers
}

// ---------------------------------------------------------------------------
// rendering — non-conflicting summary
// ---------------------------------------------------------------------------

describe('rendering — non-conflicting summary', () => {
  it('renders the heading region', () => {
    renderSection()
    expect(screen.getByRole('region')).toBeTruthy()
    expect(screen.getByText('Review import')).toBeTruthy()
  })

  it('shows green summary line when there are non-conflicting projects', () => {
    renderSection({
      imported: projectExport([makeProject({ id: 'a' }), makeProject({ id: 'b' })]),
    })
    expect(screen.getByText(/2 new projects will be added/i)).toBeTruthy()
  })

  it('uses singular "project" when exactly one non-conflicting project', () => {
    renderSection({ imported: projectExport([makeProject({ id: 'a' })]) })
    expect(screen.getByText(/^1 new project will be added/i)).toBeTruthy()
  })

  it('shows "Nothing to import" when zero conflicts and zero non-conflicting', () => {
    renderSection()
    expect(screen.getByText(/Nothing to import\./i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// rendering — id conflicts
// ---------------------------------------------------------------------------

describe('rendering — id conflicts', () => {
  it('renders id-conflict label with existing name', () => {
    const inc = makeProject({ id: 'shared', name: 'NewName' })
    const existing = makeProject({ id: 'shared', name: 'OldName' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'id', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['shared', 'skip']]),
    })
    expect(screen.getByText(/Same project ID/i)).toBeTruthy()
    expect(screen.getByText(/OldName/)).toBeTruthy()
  })

  it('renders rename arrow when id conflict has different names', () => {
    const inc = makeProject({ id: 'shared', name: 'NewName' })
    const existing = makeProject({ id: 'shared', name: 'OldName' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'id', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['shared', 'skip']]),
    })
    expect(screen.getByRole('img', { name: /renamed to/i })).toBeTruthy()
    expect(screen.getByText(/NewName/)).toBeTruthy()
  })

  it('omits rename arrow when id conflict names are identical', () => {
    const inc = makeProject({ id: 'shared', name: 'Same' })
    const existing = makeProject({ id: 'shared', name: 'Same' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'id', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['shared', 'skip']]),
    })
    expect(screen.queryByRole('img', { name: /renamed to/i })).toBeNull()
  })

  it('renders all three radio actions per conflict', () => {
    const inc = makeProject({ id: 'shared', name: 'X' })
    const existing = makeProject({ id: 'shared', name: 'X' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'id', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['shared', 'skip']]),
    })
    expect(screen.getByLabelText(/Keep existing/i)).toBeTruthy()
    expect(screen.getByLabelText(/Add as a copy/i)).toBeTruthy()
    expect(screen.getByLabelText(/Replace existing/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// rendering — name conflicts
// ---------------------------------------------------------------------------

describe('rendering — name conflicts', () => {
  it('renders name-conflict label with the incoming name', () => {
    const inc = makeProject({ id: 'new-id', name: 'Shared' })
    const existing = makeProject({ id: 'old-id', name: 'shared' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'name', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['new-id', 'copy']]),
    })
    expect(screen.getByText(/Same name, different origin/i)).toBeTruthy()
    expect(screen.getByText(/Shared/)).toBeTruthy()
  })

  it('marks the checked radio according to decisions map', () => {
    const inc = makeProject({ id: 'new-id', name: 'Shared' })
    const existing = makeProject({ id: 'old-id', name: 'shared' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'name', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['new-id', 'replace']]),
    })
    const replaceInput = screen.getByLabelText(/Replace existing/i) as HTMLInputElement
    expect(replaceInput.checked).toBe(true)
  })

  it('defaults to skip when no decision is provided for a conflict', () => {
    const inc = makeProject({ id: 'i-1' })
    const existing = makeProject({ id: 'e-1' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'name', incomingProject: inc, existingProject: existing }],
      decisions: new Map(),
    })
    const skipInput = screen.getByLabelText(/Keep existing/i) as HTMLInputElement
    expect(skipInput.checked).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// legacy mode toggle
// ---------------------------------------------------------------------------

describe('legacy mode toggle', () => {
  it('shows the mode toggle for legacy imports', () => {
    renderSection({ imported: legacyImport([makeProject()]) })
    expect(screen.getByRole('radiogroup', { name: /Import mode/i })).toBeTruthy()
  })

  it('does not show the mode toggle for project-export imports', () => {
    renderSection({ imported: projectExport([makeProject()]) })
    expect(screen.queryByRole('radiogroup', { name: /Import mode/i })).toBeNull()
  })

  it('calls onModeChange when a mode button is clicked', () => {
    const onModeChange = vi.fn()
    renderSection({
      imported: legacyImport([makeProject()]),
      mode: 'merge',
      onModeChange,
    })
    fireEvent.click(screen.getByRole('radio', { name: /Replace all data/i }))
    expect(onModeChange).toHaveBeenCalledWith('replace-all')
  })

  it('shows the danger banner when in replace-all mode', () => {
    renderSection({
      imported: legacyImport([makeProject(), makeProject()]),
      mode: 'replace-all',
    })
    expect(screen.getByText(/All existing projects and sprints will be removed/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// decision change handler
// ---------------------------------------------------------------------------

describe('decision change handler', () => {
  it('calls onDecisionChange with the conflict id and selected action', () => {
    const inc = makeProject({ id: 'i-1' })
    const existing = makeProject({ id: 'e-1' })
    const onDecisionChange = vi.fn()
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'name', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['i-1', 'skip']]),
      onDecisionChange,
    })
    fireEvent.click(screen.getByLabelText(/Add as a copy/i))
    expect(onDecisionChange).toHaveBeenCalledWith('i-1', 'copy')
  })

  it('radio inputs are disabled while applying', () => {
    const inc = makeProject({ id: 'i-1' })
    const existing = makeProject({ id: 'e-1' })
    renderSection({
      imported: projectExport([inc]),
      conflicts: [{ type: 'name', incomingProject: inc, existingProject: existing }],
      decisions: new Map([['i-1', 'skip']]),
      applying: true,
    })
    expect((screen.getByLabelText(/Add as a copy/i) as HTMLInputElement).disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// confirm / cancel / replace-all buttons
// ---------------------------------------------------------------------------

describe('confirm / cancel / replace-all buttons', () => {
  it('calls onConfirm when "Apply import" is clicked', () => {
    const onConfirm = vi.fn()
    renderSection({ imported: projectExport([makeProject()]), onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /Apply import/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    renderSection({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows "Importing..." on the confirm button while applying', () => {
    renderSection({ imported: projectExport([makeProject()]), applying: true })
    expect(screen.getByRole('button', { name: /Importing/i })).toBeTruthy()
  })

  it('renders the Replace all data button when in replace-all mode (legacy)', () => {
    const onRequestReplaceAll = vi.fn()
    renderSection({
      imported: legacyImport([makeProject()]),
      mode: 'replace-all',
      onRequestReplaceAll,
    })
    // Two elements have "Replace all data" text: the mode-toggle radio button
    // and the bottom-row danger button. The latter is the only non-radio button.
    const danger = screen.getAllByRole('button', { name: /Replace all data/i }).find(
      (el) => el.getAttribute('role') !== 'radio',
    )!
    fireEvent.click(danger)
    expect(onRequestReplaceAll).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// focus management and Escape key
// ---------------------------------------------------------------------------

describe('focus management and Escape key', () => {
  it('focuses the heading on mount', () => {
    renderSection()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /Review import/i }))
  })

  it('calls onCancel when Escape is pressed and not applying', () => {
    const onCancel = vi.fn()
    renderSection({ onCancel })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('does NOT call onCancel on Escape while applying', () => {
    const onCancel = vi.fn()
    renderSection({ onCancel, applying: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
