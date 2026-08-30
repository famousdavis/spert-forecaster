// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useProjectStore } from '@/shared/state/project-store'
import { buildImportBannerDetails } from '../lib/import-banner'
import { getStorageMode } from '@/shared/state/storage'
import { validateImportData, type ExportData } from '@/shared/state/import-validation'
import type { Sprint } from '@/shared/types'
import {
  availableActions,
  classifyImportData,
  conflictsEqual,
  detectImportConflicts,
  hasMatchingExistingSprintId,
  hasUnmatchedExistingSprints,
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

type ImportBannerState = { kind: 'success' | 'error'; text: string; details?: string[] }

/** How a payload reached the importer. The ONLY thing allowed to vary by it is wording. */
type ImportTransport = 'file' | 'crosslink'

/**
 * What ingesting a payload did.
 *
 * ⚠️ `nackReason` ABSENT with `didApply` false is not a failure — it means the payload was
 * accepted and a preview is open, waiting for a human. Only a present `nackReason` is a
 * refusal. Deliberately not named `ok` or `result`: both already mean something else here
 * (`outcome.ok` from the store action, `outcome.result` a few lines below it).
 */
type IngestResult = { didApply: boolean; nackReason?: string }

export type { ImportMode, ImportPreviewState, ImportBannerState, ImportTransport, IngestResult }

export function useImportState() {
  // C10/C23: No projects/sprints/viewingProjectId subscriptions. All async
  // handlers read via useProjectStore.getState() at call time to avoid
  // stale-closure risk.
  const importDataAndSelectFirstAction = useProjectStore((s) => s.importDataAndSelectFirst)
  const applySmartImportAction = useProjectStore((s) => s.applySmartImport)
  // Pitfall #88: reactive subscription to the cloud hydration signal. Drives
  // the Import-button disable and the "Loading your cloud projects" hint in
  // ProjectsTab. The store getState() check in handleFileChange handles the
  // event-callback case where a reactive subscription isn't appropriate.
  const cloudDataLoaded = useProjectStore((s) => s.cloudDataLoaded)

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

  // ⚠️ SIGNATURE TAKES `imported` AND `existingSprints`. It cannot decide
  // whether `update` is available from ImportConflict[] alone: availability
  // depends on the payload's exportType and on the §4.1 sprint predicate.
  const computeDefaultDecisions = useCallback(
    (
      conflicts: ImportConflict[],
      imported: ParsedImportData,
      existingSprints: Sprint[],
    ): Map<string, ConflictAction> => {
      const m = new Map<string, ConflictAction>()
      for (const c of conflicts) {
        // ONE predicate, shared with the radiogroup (§5.1). Two independent
        // conditionals is how the availability rule becomes untestable.
        const actions = availableActions(
          c.type,
          imported.exportType,
          hasUnmatchedExistingSprints(
            existingSprints,
            imported.sprints,
            c.existingProject.id,
            c.incomingProject.id,
          ),
          hasMatchingExistingSprintId(
            existingSprints,
            imported.sprints,
            c.existingProject.id,
            c.incomingProject.id,
          ),
        )
        // Default to 'update' wherever it is offered: it is the non-destructive
        // action, and a re-import of the same project is what it exists for.
        // Otherwise keep the shipped defaults — 'skip' for ID conflicts
        // (destructive 'replace' requires opt-in), 'copy' for name conflicts.
        if (actions.includes('update')) {
          m.set(c.incomingProject.id, 'update')
        } else {
          m.set(c.incomingProject.id, c.type === 'id' ? 'skip' : 'copy')
        }
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
    ): Promise<IngestResult> => {
      // C-FS1 (pitfall #86): flushSync forces React to commit setApplying(true)
      // to the DOM before the synchronous applySmartImportAction() runs. Without
      // this, React 18 batches setApplying(true)→...→setApplying(false) inside
      // one tick and the "Importing..." label / aria-busy never paints.
      flushSync(() => setApplying(true))
      try {
        // C10: Read directly from store.
        const { projects: currentProjects } = useProjectStore.getState()
        const freshConflicts = detectImportConflicts(imported, currentProjects)
        if (!conflictsEqual(freshConflicts, originalConflicts)) {
          // Hook-level stale-data guard (fast early exit before calling store).
          const text =
            originalConflicts.length === 0
              ? 'The workspace changed during import. Please try again.'
              : 'The workspace changed while the preview was open. Please review your import again.'
          showBanner({ kind: 'error', text })
          return { didApply: false, nackReason: text }
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
          const text = 'The workspace changed during import. Please try again.'
          showBanner({ kind: 'error', text })
          return { didApply: false, nackReason: text }
        }
        // C28: Banner built from outcome.result.
        const { result } = outcome
        const parts: string[] = []
        if (result.added > 0) parts.push(`${result.added} project${result.added !== 1 ? 's' : ''} added`)
        if (result.copied > 0) parts.push(`${result.copied} copied`)
        if (result.replaced > 0) parts.push(`${result.replaced} replaced`)
        if (result.updated > 0) parts.push(`${result.updated} updated`)
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
        showBanner({
          kind: 'success',
          text: parts.length > 0 ? parts.join(', ') + '.' : 'No projects were imported.',
          // Built from the WRITE-TIME result, never from the preview.
          details: buildImportBannerDetails(result),
        })
        // ⚠️ TRUE only here. The crosslink sender reports success from this flag, so it must
        // mean "the store was written", not "nothing threw" — a preview opening and a stale
        // guard refusing both reach the caller as false.
        return { didApply: true }
      } catch (err) {
        const text = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        showBanner({ kind: 'error', text })
        return { didApply: false, nackReason: text }
      } finally {
        setApplying(false)
      }
    },
    [applySmartImportAction, showBanner],
  )

  const applyReplaceAll = useCallback(
    async (imported: LegacyImportData): Promise<IngestResult> => {
      // C-FS1 (pitfall #86): see applyMergeDecisions above.
      flushSync(() => setApplying(true))
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
        return { didApply: true }
      } catch (err) {
        const text = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        showBanner({ kind: 'error', text })
        return { didApply: false, nackReason: text }
      } finally {
        setApplying(false)
      }
    },
    [importDataAndSelectFirstAction, showBanner],
  )

  /**
   * Is the workspace in a state where an import may be applied at all?
   *
   * ⚠️ RETURNS its verdict rather than showing a banner, because the crosslink path has to
   * turn the same refusal into a NACK the sender can read. The two entry points then render
   * it differently — banner on the file path, NACK on the wire — from one predicate.
   */
  const assertIngestReady = useCallback((): string | null => {
    if (getStorageMode() === 'cloud' && !useProjectStore.getState().cloudDataLoaded) {
      return 'Cloud projects are still loading — please try again in a moment.'
    }
    return null
  }, [])

  /**
   * Where a VALID payload goes: straight in, replacing everything, or to a preview.
   *
   * Split out of `ingestPayload` only to keep that function under the complexity ratchet —
   * it raises no refusals of its own, so every refusal literal stays in one place, which is
   * what the register's completeness check reads. The order here is part of the shared half
   * and is transport-invariant like the rest of it.
   */
  const routeImport = useCallback(
    async (imported: ParsedImportData): Promise<IngestResult> => {
      // C23: Read from store at call time.
      const { projects: currentProjects, sprints: currentSprints } = useProjectStore.getState()
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
        return await applyMergeDecisions(imported, new Map(), [])
      }

      // Fast path 2: empty workspace replace — local mode only.
      if (!isCloudMode && imported.exportType === 'legacy' && currentProjects.length === 0) {
        return await applyReplaceAll(imported)
      }

      const initialMode: ImportMode = imported.exportType === 'legacy' ? 'replace-all' : 'merge'
      showPreview({
        imported,
        conflicts,
        decisions: computeDefaultDecisions(conflicts, imported, currentSprints),
        mode: initialMode,
      })
      // Accepted, not applied, and NOT a refusal — `nackReason` is absent. A conflicting
      // payload waits for a human to click Confirm, and the sender must say so rather than
      // claim either success or failure.
      return { didApply: false }
    },
    [showPreview, computeDefaultDecisions, applyMergeDecisions, applyReplaceAll],
  )

  /**
   * THE SHARED HALF. Everything from `JSON.parse` through `showPreview`, including
   * `validateImportData` — which has to be inside, because `classifyImportData` validates
   * nothing at all: it takes an `ExportData` and casts.
   *
   * ⚠️ The condition set and the evaluation order here are TRANSPORT-INVARIANT. `transport`
   * is allowed to change wording and nothing else. If you find yourself adding
   * `if (transport === …)` around a *check*, that is the bug this comment exists to prevent —
   * the whole point is that a payload refused over one route is refused over the other.
   *
   * The gates that sit OUTSIDE this function — the file picker, the extension gate, the
   * `file.size` pre-check, `assertIngestReady` — are per-transport by design, and that
   * asymmetry is deliberate: they guard the act of *arriving*, not the payload.
   */
  const ingestPayload = useCallback(
    async (content: string, transport: ImportTransport): Promise<IngestResult> => {
      const refuse = (text: string): IngestResult => {
        showBanner({ kind: 'error', text })
        return { didApply: false, nackReason: text }
      }
      try {
        // The ceiling, on the STRING. `file.size` upstream is a cheap pre-check on a route
        // that happens to have a File; a payload that arrives over the wire never had one.
        if (new Blob([content]).size > MAX_FILE_SIZE) {
          return refuse('Import failed: The project data exceeds the 10 MB limit')
        }
        let raw: unknown
        try {
          raw = JSON.parse(content)
        } catch {
          return refuse('Import failed: Invalid JSON format.')
        }
        try {
          validateImportData(raw)
        } catch (err) {
          return refuse(
            `Import failed: ${err instanceof Error ? err.message : 'Validation error'}`,
          )
        }
        const imported = classifyImportData(raw as ExportData)
        if (imported.projects.length === 0) {
          // One condition, two wordings — the only kind of transport variance allowed. Both
          // literals live here on purpose: the register matches them as plain substrings of
          // this file's source, with no interpolation handling, so an assembled string would
          // stop being findable.
          return refuse(
            transport === 'file'
              ? 'The file contains no projects to import.'
              : 'The transfer contains no projects to import.',
          )
        }
        return await routeImport(imported)
      } catch (err) {
        return refuse(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [showBanner, routeImport],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (readerPendingRef.current) return // C9: race guard
      // Fix for Pitfall #88 hydration race: reject file picks until cloud data
      // is loaded. The Import button (disabled={isCloudPending}) is the primary
      // gate. This guard covers programmatic triggers, future drag-and-drop, etc.
      //
      // ⚠️ Stays THIRD, behind the two guards above — it is not "first in each entry point".
      // Moving it would change what this path says: pick `notes.txt` while the cloud is
      // loading and today you get "Cloud projects are still loading"; ahead of the extension
      // gate you would get "Please select a JSON file (.json)". Same predicate, different
      // observable behaviour, so the predicate is DUPLICATED rather than moved.
      const notReady = assertIngestReady()
      if (notReady) {
        showBanner({ kind: 'error', text: notReady })
        return
      }
      readerPendingRef.current = true
      // Clear stale banner now that the user has passed the race guard.
      // Placed after the race guard (not before) so a double-click that loses
      // the race leaves the current banner intact — correct UX.
      setImportBanner(null)
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
        void ingestPayload(event.target?.result as string, 'file')
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
    [showBanner, assertIngestReady, ingestPayload],
  )

  const handleConfirmMerge = useCallback(() => {
    if (!importPreview) return
    // Belt-and-suspenders: the disabled Import button is the primary gate.
    // This guard handles the edge case where the preview was opened in local
    // mode and the user switched to cloud before confirming.
    const notReady = assertIngestReady()
    if (notReady) {
      showBanner({ kind: 'error', text: notReady })
      return
    }
    void applyMergeDecisions(importPreview.imported, importPreview.decisions, importPreview.conflicts)
  }, [importPreview, applyMergeDecisions, showBanner, assertIngestReady])

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
    // The seam. `useCrosslinkReceiver` is the other caller.
    ingestPayload,
    assertIngestReady,
    handleConfirmMerge,
    handleImportCancel,
    onModeChange,
    onDecisionChange,
    computeDefaultDecisions,
    cloudDataLoaded,
  }
}
