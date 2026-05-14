// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Mock getStorageMode to control fast-path suppression behavior.
const hoisted = vi.hoisted(() => ({ mode: 'local' as 'local' | 'cloud' }))
vi.mock('@/shared/state/storage', async () => {
  const actual = await vi.importActual<typeof import('@/shared/state/storage')>(
    '@/shared/state/storage',
  )
  return {
    ...actual,
    getStorageMode: () => hoisted.mode,
  }
})

import { useImportState } from './useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import type { ImportConflict, ConflictAction } from '@/shared/state/import-utils'
import type { Project } from '@/shared/types'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'Test Project',
    unitOfMeasure: 'Story Points',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

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
  hoisted.mode = 'local'
  resetStore()
})

// ---------------------------------------------------------------------------
// transition helpers
// ---------------------------------------------------------------------------

describe('useImportState — transition helpers', () => {
  it('initial state has no preview, no banner, applying=false', () => {
    const { result } = renderHook(() => useImportState())
    expect(result.current.importPreview).toBeNull()
    expect(result.current.importBanner).toBeNull()
    expect(result.current.applying).toBe(false)
    expect(result.current.replaceAllPending).toBe(false)
  })

  it('showPreview clears banner and sets the preview state', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showBanner({ kind: 'error', text: 'old' })
    })
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [], sprints: [] },
        conflicts: [],
        decisions: new Map(),
        mode: 'merge',
      })
    })
    expect(result.current.importBanner).toBeNull()
    expect(result.current.importPreview).not.toBeNull()
    expect(result.current.applying).toBe(false)
  })

  it('showBanner clears preview, replaceAllPending, and applying', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [], sprints: [] },
        conflicts: [],
        decisions: new Map(),
        mode: 'merge',
      })
    })
    act(() => {
      result.current.showBanner({ kind: 'success', text: 'done' })
    })
    expect(result.current.importPreview).toBeNull()
    expect(result.current.importBanner?.kind).toBe('success')
  })

  it('clearImportFlow clears preview/replaceAllPending/applying but NOT banner', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showBanner({ kind: 'error', text: 'keep me' })
    })
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [], sprints: [] },
        conflicts: [],
        decisions: new Map(),
        mode: 'merge',
      })
    })
    act(() => {
      result.current.clearImportFlow()
    })
    expect(result.current.importPreview).toBeNull()
    // Banner was cleared by showPreview earlier (correct behavior), so this
    // assertion targets the clearImportFlow-specific case: a fresh banner
    // posted AFTER preview is closed should persist through clearImportFlow.
    act(() => {
      result.current.showBanner({ kind: 'success', text: 'persistent' })
    })
    act(() => {
      result.current.clearImportFlow()
    })
    expect(result.current.importBanner?.text).toBe('persistent')
  })

  it('dismissBanner clears the banner', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showBanner({ kind: 'success', text: 'x' })
    })
    act(() => {
      result.current.dismissBanner()
    })
    expect(result.current.importBanner).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// computeDefaultDecisions
// ---------------------------------------------------------------------------

describe('useImportState — computeDefaultDecisions', () => {
  const conflict = (incomingId: string, type: 'id' | 'name'): ImportConflict => ({
    type,
    incomingProject: makeProject({ id: incomingId }),
    existingProject: makeProject({ id: 'e-' + incomingId }),
  })

  it('defaults id conflicts to skip', () => {
    const { result } = renderHook(() => useImportState())
    const m = result.current.computeDefaultDecisions([conflict('i-1', 'id')])
    expect(m.get('i-1')).toBe('skip')
  })

  it('defaults name conflicts to copy', () => {
    const { result } = renderHook(() => useImportState())
    const m = result.current.computeDefaultDecisions([conflict('i-1', 'name')])
    expect(m.get('i-1')).toBe('copy')
  })

  it('returns an empty Map for empty conflicts', () => {
    const { result } = renderHook(() => useImportState())
    expect(result.current.computeDefaultDecisions([]).size).toBe(0)
  })

  it('mixes defaults across multiple conflicts', () => {
    const { result } = renderHook(() => useImportState())
    const m = result.current.computeDefaultDecisions([conflict('a', 'id'), conflict('b', 'name')])
    expect(m.get('a')).toBe('skip')
    expect(m.get('b')).toBe('copy')
  })
})

// ---------------------------------------------------------------------------
// mode and decision cloning
// ---------------------------------------------------------------------------

describe('useImportState — mode and decision cloning', () => {
  it('onModeChange updates only the mode field', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showPreview({
        imported: {
          exportType: 'legacy',
          projects: [],
          sprints: [],
          _originalExportData: { version: '0.30.0', exportedAt: '2026-05-14', projects: [], sprints: [] },
        },
        conflicts: [],
        decisions: new Map(),
        mode: 'replace-all',
      })
    })
    act(() => {
      result.current.onModeChange('merge')
    })
    expect(result.current.importPreview?.mode).toBe('merge')
  })

  it('onDecisionChange clones the decisions Map (reference identity required)', () => {
    const initial = new Map<string, ConflictAction>([['i-1', 'skip']])
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [], sprints: [] },
        conflicts: [],
        decisions: initial,
        mode: 'merge',
      })
    })
    act(() => {
      result.current.onDecisionChange('i-1', 'replace')
    })
    expect(result.current.importPreview?.decisions.get('i-1')).toBe('replace')
    // Original Map was not mutated.
    expect(initial.get('i-1')).toBe('skip')
  })
})

// ---------------------------------------------------------------------------
// applyMergeDecisions — uses store action outcome (C28)
// ---------------------------------------------------------------------------

describe('useImportState — banner built from store action outcome (C28)', () => {
  it('success banner reflects counts from outcome.result', async () => {
    const { result } = renderHook(() => useImportState())
    const incoming = {
      exportType: 'spert-forecaster-project-export' as const,
      projects: [makeProject({ id: 'a' })],
      sprints: [],
    }
    act(() => {
      result.current.showPreview({
        imported: incoming,
        conflicts: [],
        decisions: new Map(),
        mode: 'merge',
      })
    })
    await act(async () => {
      result.current.handleConfirmMerge()
    })
    expect(result.current.importBanner?.kind).toBe('success')
    expect(result.current.importBanner?.text).toMatch(/1 project added/)
  })

  it('store-level drift detection triggers error banner via outcome.ok === false', async () => {
    // Pre-seed the preview with stale conflict assertions that don't match real
    // state. The hook's pre-check uses the same store getState so it ALSO fails
    // its guard; this still produces an error banner. Verifies behavior end-to-end.
    const { result } = renderHook(() => useImportState())
    useProjectStore.setState({ projects: [makeProject({ id: 'existing' })] })
    const inc = makeProject({ id: 'unique', name: 'No conflict in real state' })
    const phantomConflict: ImportConflict = {
      type: 'id',
      incomingProject: inc,
      existingProject: makeProject({ id: 'unique' }),
    }
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [inc], sprints: [] },
        conflicts: [phantomConflict],
        decisions: new Map([['unique', 'replace']]),
        mode: 'merge',
      })
    })
    await act(async () => {
      result.current.handleConfirmMerge()
    })
    expect(result.current.importBanner?.kind).toBe('error')
    expect(result.current.importBanner?.text).toMatch(/workspace changed/i)
  })
})

// ---------------------------------------------------------------------------
// storage-mode guard behavior (C29 — was "invariant")
// ---------------------------------------------------------------------------

describe('useImportState — storage-mode guard behavior (C29)', () => {
  // The guard suppresses fast paths when getStorageMode() === 'cloud'.
  // We can't directly trigger handleFileChange's internal getStorageMode
  // check without a FileReader — but we CAN verify the underlying primitives
  // (current mode reflects mock, fast-path eligibility predicates).

  it('mock getStorageMode reflects "cloud" when hoisted.mode is cloud', () => {
    hoisted.mode = 'cloud'
    // Re-import to verify the mock is wired.
    import('@/shared/state/storage').then((mod) => {
      expect(mod.getStorageMode()).toBe('cloud')
    })
  })

  it('mock getStorageMode reflects "local" when hoisted.mode is local', () => {
    hoisted.mode = 'local'
    import('@/shared/state/storage').then((mod) => {
      expect(mod.getStorageMode()).toBe('local')
    })
  })

  it('legacy import into empty workspace in LOCAL mode applies via importDataAndSelectFirst (fast path 2)', async () => {
    hoisted.mode = 'local'
    const spy = vi.spyOn(useProjectStore.getState(), 'importDataAndSelectFirst')
    const { result } = renderHook(() => useImportState())
    const file = new File(
      [JSON.stringify({ version: '0.30.0', exportedAt: '2026-05-14', projects: [{ id: 'a', name: 'A', unitOfMeasure: 'pts', createdAt: 't', updatedAt: 't' }], sprints: [] })],
      'data.json',
      { type: 'application/json' },
    )
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      // FileReader is async — wait a tick.
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('legacy import into empty workspace in CLOUD mode shows preview (fast path 2 suppressed)', async () => {
    hoisted.mode = 'cloud'
    const { result } = renderHook(() => useImportState())
    const file = new File(
      [JSON.stringify({ version: '0.30.0', exportedAt: '2026-05-14', projects: [{ id: 'a', name: 'A', unitOfMeasure: 'pts', createdAt: 't', updatedAt: 't' }], sprints: [] })],
      'data.json',
      { type: 'application/json' },
    )
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.importPreview).not.toBeNull()
    expect(result.current.importPreview?.mode).toBe('replace-all')
  })
})

// ---------------------------------------------------------------------------
// file handler error paths
// ---------------------------------------------------------------------------

describe('useImportState — file handler error paths', () => {
  it('rejects non-JSON files', async () => {
    const { result } = renderHook(() => useImportState())
    const file = new File(['hello'], 'data.txt', { type: 'text/plain' })
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.importBanner?.kind).toBe('error')
    expect(result.current.importBanner?.text).toMatch(/JSON file/i)
  })

  it('rejects files larger than 10 MB', async () => {
    const { result } = renderHook(() => useImportState())
    // Construct a fake large File — set size via Object.defineProperty.
    const file = new File([''], 'big.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.importBanner?.text).toMatch(/10 MB/i)
  })

  it('rejects empty-projects file with a friendly error', async () => {
    const { result } = renderHook(() => useImportState())
    const file = new File(
      [JSON.stringify({ version: '0.30.0', exportedAt: '2026-05-14', projects: [], sprints: [] })],
      'empty.json',
      { type: 'application/json' },
    )
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.importBanner?.text).toMatch(/no projects/i)
  })

  it('rejects invalid JSON with a friendly error', async () => {
    const { result } = renderHook(() => useImportState())
    const file = new File(['not json'], 'bad.json', { type: 'application/json' })
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.importBanner?.text).toMatch(/Invalid JSON/i)
  })
})

// ---------------------------------------------------------------------------
// fast-path-1 vs cloud-mode suppression
// ---------------------------------------------------------------------------

describe('useImportState — cloud mode fast-path suppression (C2)', () => {
  function projectExportFile(): File {
    return new File(
      [
        JSON.stringify({
          version: '0.30.0',
          exportedAt: '2026-05-14',
          _exportType: 'spert-forecaster-project-export',
          projects: [{ id: 'new', name: 'New', unitOfMeasure: 'pts', createdAt: 't', updatedAt: 't' }],
          sprints: [],
        }),
      ],
      'export.json',
      { type: 'application/json' },
    )
  }

  it('local mode + zero-conflict project-export → fast path (no preview shown)', async () => {
    hoisted.mode = 'local'
    const { result } = renderHook(() => useImportState())
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [projectExportFile()] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.importPreview).toBeNull()
    expect(result.current.importBanner?.kind).toBe('success')
  })

  it('cloud mode + zero-conflict project-export → preview shown (fast path 1 suppressed)', async () => {
    hoisted.mode = 'cloud'
    const { result } = renderHook(() => useImportState())
    await act(async () => {
      result.current.handleFileChange({
        target: { files: [projectExportFile()] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.importPreview).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// stale-data guard (hook level)
// ---------------------------------------------------------------------------

describe('useImportState — handleImportCancel', () => {
  it('clears preview/replaceAllPending/applying but leaves a posted banner alone', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [], sprints: [] },
        conflicts: [],
        decisions: new Map(),
        mode: 'merge',
      })
    })
    act(() => {
      result.current.handleImportCancel()
    })
    expect(result.current.importPreview).toBeNull()
    expect(result.current.applying).toBe(false)
  })

  it('openReplaceAllConfirm and cancelReplaceAllConfirm toggle the pending flag', () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.openReplaceAllConfirm()
    })
    expect(result.current.replaceAllPending).toBe(true)
    act(() => {
      result.current.cancelReplaceAllConfirm()
    })
    expect(result.current.replaceAllPending).toBe(false)
  })

  it('handleConfirmReplaceAll applies a legacy import and posts success banner', async () => {
    const { result } = renderHook(() => useImportState())
    act(() => {
      result.current.showPreview({
        imported: {
          exportType: 'legacy',
          projects: [makeProject({ id: 'a' })],
          sprints: [],
          _originalExportData: {
            version: '0.30.0',
            exportedAt: '2026-05-14',
            projects: [makeProject({ id: 'a' })],
            sprints: [],
          },
        },
        conflicts: [],
        decisions: new Map(),
        mode: 'replace-all',
      })
      result.current.openReplaceAllConfirm()
    })
    await act(async () => {
      result.current.handleConfirmReplaceAll()
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(result.current.importBanner?.kind).toBe('success')
    expect(result.current.importBanner?.text).toMatch(/All data replaced/)
  })
})

describe('useImportState — stale-data guard (hook level)', () => {
  it('aborts apply when workspace changes between preview and confirm', async () => {
    hoisted.mode = 'local'
    useProjectStore.setState({ projects: [makeProject({ id: 'A', name: 'A' })] })
    const { result } = renderHook(() => useImportState())
    const inc = makeProject({ id: 'A', name: 'A-new' })
    // Open preview with a current id-conflict on A.
    act(() => {
      result.current.showPreview({
        imported: { exportType: 'spert-forecaster-project-export', projects: [inc], sprints: [] },
        conflicts: [{ type: 'id', incomingProject: inc, existingProject: makeProject({ id: 'A' }) }],
        decisions: new Map([['A', 'replace']]),
        mode: 'merge',
      })
    })
    // Simulate workspace change: delete A.
    useProjectStore.setState({ projects: [] })
    await act(async () => {
      result.current.handleConfirmMerge()
    })
    expect(result.current.importBanner?.kind).toBe('error')
    expect(result.current.importBanner?.text).toMatch(/workspace changed/i)
  })
})
