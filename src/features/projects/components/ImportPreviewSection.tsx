// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef } from 'react'
import type {
  ParsedImportData,
  ImportConflict,
  ConflictAction,
} from '@/shared/state/import-utils'

interface ImportPreviewSectionProps {
  imported: ParsedImportData
  conflicts: ImportConflict[]
  decisions: Map<string, ConflictAction>
  mode: 'merge' | 'replace-all'
  applying: boolean
  // useId() from ProjectsTab — stable, SSR-safe.
  idPrefix: string
  onModeChange: (mode: 'merge' | 'replace-all') => void
  onDecisionChange: (projectId: string, action: ConflictAction) => void
  onConfirm: () => void
  onRequestReplaceAll: () => void
  onCancel: () => void
}

// Form-control hygiene (required for all form-touching changes):
// [x] htmlFor/id pairing — radio inputs use `${idPrefix}-conflict-${id}-${action}`
// [x] Radio name unique per conflict group — `${idPrefix}-conflict-${id}`
// [x] aria-labelledby on each radiogroup references its conflict label element
// [x] Visual focus indicator — heading uses focus:ring-2 (not focus-visible — pitfall #31)
// [x] Disabled state visual contrast — disabled:opacity-50 on interactive elements

const ACTION_LABELS: Record<ConflictAction, string> = {
  skip: 'Keep existing, ignore imported',
  copy: 'Add as a copy',
  replace: 'Replace existing with imported',
}

export function ImportPreviewSection({
  imported,
  conflicts,
  decisions,
  mode,
  applying,
  idPrefix,
  onModeChange,
  onDecisionChange,
  onConfirm,
  onRequestReplaceAll,
  onCancel,
}: ImportPreviewSectionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = `${idPrefix}-import-preview-heading`

  // Focus heading on mount so screen readers announce the new region.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Escape closes the preview when not mid-apply.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applying) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [applying, onCancel])

  const isLegacy = imported.exportType === 'legacy'
  const showReplaceAllControls = isLegacy && mode === 'replace-all'
  const conflictIncomingIds = new Set(conflicts.map((c) => c.incomingProject.id))
  const nonConflictingCount = imported.projects.filter((p) => !conflictIncomingIds.has(p.id)).length

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      className="rounded-lg border border-spert-border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-4"
    >
      <h2
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="text-lg font-semibold text-spert-text dark:text-gray-100 outline-none focus:ring-2 focus:ring-spert-blue rounded"
      >
        Review import
      </h2>

      {isLegacy && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-spert-text-muted dark:text-gray-400">How should this file be applied?</span>
          <div
            role="radiogroup"
            aria-label="Import mode"
            className="inline-flex rounded border border-spert-border dark:border-gray-600 overflow-hidden"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'merge'}
              disabled={applying}
              onClick={() => onModeChange('merge')}
              className={
                'px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ' +
                (mode === 'merge'
                  ? 'bg-spert-blue text-white'
                  : 'bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600')
              }
            >
              Merge into workspace
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'replace-all'}
              disabled={applying}
              onClick={() => onModeChange('replace-all')}
              className={
                'px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ' +
                (mode === 'replace-all'
                  ? 'bg-spert-blue text-white'
                  : 'bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600')
              }
            >
              Replace all data
            </button>
          </div>
        </div>
      )}

      {!showReplaceAllControls && (
        <>
          {nonConflictingCount > 0 && (
            <div className="rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 p-3 text-sm text-green-900 dark:text-green-100">
              {nonConflictingCount} new project{nonConflictingCount !== 1 ? 's' : ''} will be added without changes.
            </div>
          )}

          {conflicts.length === 0 && nonConflictingCount === 0 && (
            <p className="text-sm text-spert-text-muted dark:text-gray-400">
              Nothing to import.
            </p>
          )}

          {conflicts.map((conflict) => {
            const incomingId = conflict.incomingProject.id
            const action = decisions.get(incomingId) ?? 'skip'
            const labelId = `${idPrefix}-conflict-${incomingId}-label`
            const radioName = `${idPrefix}-conflict-${incomingId}`

            return (
              <div
                key={incomingId}
                className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2"
              >
                <p id={labelId} className="text-sm font-medium text-spert-text dark:text-gray-100">
                  {conflict.type === 'id' ? (
                    <>
                      Same project ID:{' '}
                      <span className="font-semibold">&ldquo;{conflict.existingProject.name}&rdquo;</span>
                      {conflict.existingProject.name !== conflict.incomingProject.name && (
                        <>
                          {' '}
                          <span role="img" aria-label="renamed to" className="text-spert-text-muted">
                            &rarr;
                          </span>{' '}
                          <span className="font-semibold">&ldquo;{conflict.incomingProject.name}&rdquo;</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Same name, different origin:{' '}
                      <span className="font-semibold">&ldquo;{conflict.incomingProject.name}&rdquo;</span>
                    </>
                  )}
                </p>

                <div role="radiogroup" aria-labelledby={labelId} className="space-y-1">
                  {(['skip', 'copy', 'replace'] as const).map((opt) => {
                    const inputId = `${idPrefix}-conflict-${incomingId}-${opt}`
                    return (
                      <label
                        key={opt}
                        htmlFor={inputId}
                        className="flex items-start gap-2 text-sm text-spert-text dark:text-gray-100 cursor-pointer disabled:opacity-50"
                      >
                        <input
                          id={inputId}
                          name={radioName}
                          type="radio"
                          value={opt}
                          checked={action === opt}
                          disabled={applying}
                          onChange={() => onDecisionChange(incomingId, opt)}
                          className="mt-0.5"
                        />
                        <span>{ACTION_LABELS[opt]}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <p className="text-xs italic text-spert-text-muted dark:text-gray-500">
            Replacing a project substitutes its sprint history with the incoming file&rsquo;s sprints.
            Burn-up configurations are cleared and forecast inputs may need to be re-entered.
          </p>
        </>
      )}

      {showReplaceAllControls && (
        <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-100">
          All existing projects and sprints will be removed and replaced with {imported.projects.length} project
          {imported.projects.length !== 1 ? 's' : ''} from this file. This cannot be undone.
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={applying}
          className="px-4 py-2 text-sm font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        {showReplaceAllControls ? (
          <button
            type="button"
            onClick={onRequestReplaceAll}
            disabled={applying}
            className="px-4 py-2 text-sm font-medium rounded text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Replace all data
          </button>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={applying}
            className="px-4 py-2 text-sm font-medium rounded text-white bg-spert-blue hover:bg-spert-blue-dark transition-colors disabled:opacity-50"
          >
            {applying ? 'Importing...' : 'Apply import'}
          </button>
        )}
      </div>
    </section>
  )
}
