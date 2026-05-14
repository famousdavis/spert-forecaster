// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useRef, useState } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import { getStorageMode } from '@/shared/state/storage'
import { validateImportData, type ExportData } from '@/shared/state/import-validation'
import {
  classifyImportData,
  conflictsEqual,
  detectImportConflicts,
  type ParsedImportData,
  type LegacyImportData,
  type ImportConflict,
  type ConflictAction,
} from '@/shared/state/import-utils'

// Outside the hook — not recreated on every render (C13).
const MAX_FILE_SIZE = 10 * 1024 * 1024

type ImportMode = 'merge' | 'replace-all'

type ImportPreviewState = {
  imported: ParsedImportData
  conflicts: ImportConflict[]
  decisions: Map<string, ConflictAction>
  mode: ImportMode
}

type ImportBannerState = { kind: 'success' | 'error'; text: string }

export type { ImportMode, ImportPreviewState, ImportBannerState }

export function useImportState() {
  // C10/C23: No projects/sprints/viewingProjectId subscriptions. All async
  // handlers read via useProjectStore.getState() at call time to avoid
  // stale-closure risk.
  const importDataAndSelectFirstAction = useProjectStore((s) => s.importDataAndSelectFirst)
  const applySmartImportAction = useProjectStore((s) => s.applySmartImport)

  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null)
  const [importBanner, setImportBanner] = useState<ImportBannerState | null>(null)
  const [replaceAllPending, setReplaceAllPending] = useState(false)
  const [applying, setApplying] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // C9/C27: Prevents file-pick race. The import button's disabled={applying}
  // covers the normal case; this ref defends against a future programmatic
  // trigger that might bypass the disabled state.
  const readerPendingRef = useRef(false)

  const showPreview = useCallback((state: ImportPreviewState) => {
    setImportBanner(null)
    setReplaceAllPending(false)
    setApplying(false)
    setImportPreview(state)
  }, [])

  const showBanner = useCallback((banner: ImportBannerState) => {
    setImportPreview(null)
    setReplaceAllPending(false)
    setApplying(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setImportBanner(banner)
  }, [])

  const clearImportFlow = useCallback(() => {
    setImportPreview(null)
    setReplaceAllPending(false)
    setApplying(false)
    // Does NOT touch importBanner.
  }, [])

  const computeDefaultDecisions = useCallback(
    (conflicts: ImportConflict[]): Map<string, ConflictAction> => {
      const m = new Map<string, ConflictAction>()
      for (const c of conflicts) {
        // C1/C15: Default to 'skip' for ALL ID conflicts (destructive 'replace'
        // requires opt-in). Default to 'copy' for name conflicts.
        m.set(c.incomingProject.id, c.type === 'id' ? 'skip' : 'copy')
      }
      return m
    },
    [],
  )

  const applyMergeDecisions = useCallback(
    async (
      imported: ParsedImportData,
      decisions: Map<string, ConflictAction>,
      originalConflicts: ImportConflict[],
    ) => {
      setApplying(true)
      try {
        // C10: Read directly from store.
        const { projects: currentProjects } = useProjectStore.getState()
        const freshConflicts = detectImportConflicts(imported, currentProjects)
        if (!conflictsEqual(freshConflicts, originalConflicts)) {
          // Hook-level stale-data guard (fast early exit before calling store).
          showBanner({
            kind: 'error',
            text:
              originalConflicts.length === 0
                ? 'The workspace changed during import. Please try again.'
                : 'The workspace changed while the preview was open. Please review your import again.',
          })
          return
        }
        // C17/C28: Store action performs the merge atomically inside Zustand's
        // set(). It re-detects conflicts against state.projects at write time
        // (second defense layer — catches concurrent deletes).
        const outcome = applySmartImportAction({
          incoming: imported,
          decisions,
          freshConflicts,
          source: imported.exportType,
        })
        if (!outcome.ok) {
          showBanner({
            kind: 'error',
            text: 'The workspace changed during import. Please try again.',
          })
          return
        }
        // C28: Banner built from outcome.result.
        const { result } = outcome
        const parts: string[] = []
        if (result.added > 0) parts.push(`${result.added} project${result.added !== 1 ? 's' : ''} added`)
        if (result.copied > 0) parts.push(`${result.copied} copied`)
        if (result.replaced > 0) parts.push(`${result.replaced} replaced`)
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
        showBanner({
          kind: 'success',
          text: parts.length > 0 ? parts.join(', ') + '.' : 'No projects were imported.',
        })
      } catch (err) {
        showBanner({
          kind: 'error',
          text: `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      } finally {
        setApplying(false)
      }
    },
    [applySmartImportAction, showBanner],
  )

  const applyReplaceAll = useCallback(
    async (imported: LegacyImportData) => {
      setApplying(true)
      try {
        importDataAndSelectFirstAction(imported._originalExportData, imported.projects[0]?.id)
        const n = imported.projects.length
        showBanner({
          kind: 'success',
          text:
            n > 0
              ? `All data replaced. ${n} project${n !== 1 ? 's' : ''} imported.`
              : 'All data replaced.',
        })
      } catch (err) {
        showBanner({
          kind: 'error',
          text: `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      } finally {
        setApplying(false)
      }
    },
    [importDataAndSelectFirstAction, showBanner],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (readerPendingRef.current) return // C9
      readerPendingRef.current = true
      // C6: setApplying handled by each terminal path (showBanner / showPreview /
      // apply...). DO NOT wrap in try/finally — would reset before async work.
      setApplying(true)

      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        readerPendingRef.current = false
        showBanner({ kind: 'error', text: 'Import failed: Please select a JSON file (.json)' })
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        readerPendingRef.current = false
        showBanner({ kind: 'error', text: 'Import failed: File exceeds the 10 MB limit' })
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        readerPendingRef.current = false
        try {
          const content = event.target?.result as string
          let raw: unknown
          try {
            raw = JSON.parse(content)
          } catch {
            showBanner({ kind: 'error', text: 'Import failed: Invalid JSON format.' })
            return
          }
          try {
            validateImportData(raw)
          } catch (err) {
            showBanner({
              kind: 'error',
              text: `Import failed: ${err instanceof Error ? err.message : 'Validation error'}`,
            })
            return
          }
          const imported = classifyImportData(raw as ExportData)
          if (imported.projects.length === 0) {
            showBanner({ kind: 'error', text: 'The file contains no projects to import.' })
            return
          }
          // C23: Read from store at call time.
          const { projects: currentProjects } = useProjectStore.getState()
          const conflicts = detectImportConflicts(imported, currentProjects)
          // C2/C8/C18: Cloud guard — see pre-flight #5 for safety analysis.
          const isCloudMode = getStorageMode() === 'cloud'

          // Fast path 1: zero-conflict additive — local mode only.
          if (
            !isCloudMode &&
            (imported.exportType === 'spert-forecaster-project-export' ||
              imported.exportType === 'spert-story-map') &&
            conflicts.length === 0
          ) {
            void applyMergeDecisions(imported, new Map(), [])
            return
          }

          // Fast path 2: empty workspace replace — local mode only.
          if (!isCloudMode && imported.exportType === 'legacy' && currentProjects.length === 0) {
            void applyReplaceAll(imported)
            return
          }

          const initialMode: ImportMode = imported.exportType === 'legacy' ? 'replace-all' : 'merge'
          showPreview({
            imported,
            conflicts,
            decisions: computeDefaultDecisions(conflicts),
            mode: initialMode,
          })
        } catch (err) {
          showBanner({
            kind: 'error',
            text: `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          })
        }
      }
      reader.onerror = () => {
        readerPendingRef.current = false
        showBanner({ kind: 'error', text: 'Import failed: Could not read file' })
      }
      // C20: reader.readAsText() can throw InvalidStateError in edge cases.
      try {
        reader.readAsText(file)
      } catch (err) {
        readerPendingRef.current = false
        showBanner({
          kind: 'error',
          text: `Import failed: ${err instanceof Error ? err.message : 'Could not start reading file'}`,
        })
      }
    },
    [showBanner, showPreview, computeDefaultDecisions, applyMergeDecisions, applyReplaceAll],
  )

  const handleConfirmMerge = useCallback(() => {
    if (!importPreview) return
    void applyMergeDecisions(importPreview.imported, importPreview.decisions, importPreview.conflicts)
  }, [importPreview, applyMergeDecisions])

  const handleImportCancel = useCallback(() => {
    clearImportFlow()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [clearImportFlow])

  const openReplaceAllConfirm = useCallback(() => setReplaceAllPending(true), [])
  const cancelReplaceAllConfirm = useCallback(() => setReplaceAllPending(false), [])

  const handleConfirmReplaceAll = useCallback(() => {
    if (!importPreview) return
    const imported = importPreview.imported
    if (imported.exportType !== 'legacy') return
    cancelReplaceAllConfirm()
    void applyReplaceAll(imported)
  }, [importPreview, applyReplaceAll, cancelReplaceAllConfirm])

  const onModeChange = useCallback((mode: ImportMode) => {
    setImportPreview((prev) => (prev ? { ...prev, mode } : null))
  }, [])

  const onDecisionChange = useCallback((projectId: string, action: ConflictAction) => {
    setImportPreview((prev) => {
      if (!prev) return null
      // Required: React relies on reference identity for change detection.
      // Mutating the existing Map would not trigger re-render.
      const decisions = new Map(prev.decisions)
      decisions.set(projectId, action)
      return { ...prev, decisions }
    })
  }, [])

  const dismissBanner = useCallback(() => setImportBanner(null), [])

  return {
    importPreview,
    importBanner,
    replaceAllPending,
    applying,
    fileInputRef,
    showPreview,
    showBanner,
    clearImportFlow,
    openReplaceAllConfirm,
    cancelReplaceAllConfirm,
    handleConfirmReplaceAll,
    dismissBanner,
    handleFileChange,
    handleConfirmMerge,
    handleImportCancel,
    onModeChange,
    onDecisionChange,
    computeDefaultDecisions,
  }
}
