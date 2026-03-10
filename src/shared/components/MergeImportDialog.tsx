// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { MergePlan } from '@/shared/state/merge-import'

interface MergeImportDialogProps {
  isOpen: boolean
  plan: MergePlan | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog for Story Map merge imports.
 * Shows a summary of what will be updated/added, then lets the user confirm or cancel.
 * Follows the same accessibility patterns as ConfirmDialog.
 */
export function MergeImportDialog({
  isOpen,
  plan,
  onConfirm,
  onCancel,
}: MergeImportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Focus the cancel button when dialog opens (safer default)
  useEffect(() => {
    if (isOpen) {
      cancelButtonRef.current?.focus()
    }
  }, [isOpen])

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }

      // Trap focus within dialog
      if (e.key === 'Tab') {
        const focusableElements = [cancelButtonRef.current, confirmButtonRef.current].filter(Boolean)
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    },
    [isOpen, onCancel],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || !plan) return null

  const hasActions = plan.actions.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="merge-dialog-title"
        aria-describedby="merge-dialog-description"
        className="relative z-10 w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl mx-4"
      >
        <h2
          id="merge-dialog-title"
          className="text-lg font-semibold text-spert-text dark:text-gray-100 mb-4"
        >
          Import from Story Map
        </h2>

        <div id="merge-dialog-description" className="space-y-3 mb-4">
          {!hasActions && (
            <p className="text-sm text-spert-text-muted dark:text-gray-400">
              Nothing to import. The file contains no projects.
            </p>
          )}

          {plan.actions.map((action, i) => (
            <div
              key={i}
              className="rounded border border-spert-border dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3"
            >
              {action.type === 'update-existing' ? (
                <>
                  <p className="text-sm font-medium text-spert-text dark:text-gray-100">
                    Update &ldquo;{action.existingProject?.name}&rdquo;
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-spert-text-muted dark:text-gray-400">
                    {action.milestonesIncoming > 0 ? (
                      <li>
                        Replace {action.milestonesReplaced} milestone{action.milestonesReplaced !== 1 ? 's' : ''} with{' '}
                        {action.milestonesIncoming} from Story Map
                      </li>
                    ) : (
                      <li>Clear existing milestones (import has none)</li>
                    )}
                    {action.newSprintCount > 0 && (
                      <li>
                        Add {action.newSprintCount} new sprint{action.newSprintCount !== 1 ? 's' : ''}
                      </li>
                    )}
                    {action.skippedSprintCount > 0 && (
                      <li>
                        Keep {action.skippedSprintCount} existing sprint{action.skippedSprintCount !== 1 ? 's' : ''} unchanged
                      </li>
                    )}
                    {action.newSprintCount === 0 && action.skippedSprintCount === 0 && (
                      <li>No sprint changes</li>
                    )}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-spert-text dark:text-gray-100">
                    Add new project &ldquo;{action.importedProject.name}&rdquo;
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-spert-text-muted dark:text-gray-400">
                    {action.milestonesIncoming > 0 && (
                      <li>
                        {action.milestonesIncoming} milestone{action.milestonesIncoming !== 1 ? 's' : ''}
                      </li>
                    )}
                    {action.newSprintCount > 0 && (
                      <li>
                        {action.newSprintCount} sprint{action.newSprintCount !== 1 ? 's' : ''}
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          ))}

          {hasActions && plan.totalUpdatedProjects > 0 && (
            <p className="text-xs text-spert-text-muted dark:text-gray-500 italic">
              Existing sprint history and productivity adjustments will be preserved.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          {hasActions && (
            <button
              ref={confirmButtonRef}
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-medium rounded text-white bg-spert-blue hover:bg-spert-blue-dark transition-colors"
            >
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
