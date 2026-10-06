// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'default'
  /**
   * Optional third button, shown FIRST: [extra] [confirm] [cancel]. The warnings
   * before an action that removes this browser's copy of the user's projects use
   * it for "Export a backup", which runs without closing the dialog (Brief 40).
   * Focus still opens on Cancel, so Enter never runs the destructive choice by
   * default. Without it the dialog is exactly the two-button dialog it always was.
   */
  extraAction?: { label: string; onClick: () => void }
}

const secondaryButtonClass =
  'px-4 py-2 text-sm font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors'

/**
 * Accessible confirmation dialog that replaces window.confirm()
 * - Traps focus within the dialog
 * - Supports keyboard navigation: Escape cancels; Enter activates the focused
 *   button, and focus opens on Cancel (there is no dialog-level Enter shortcut)
 * - Uses proper ARIA attributes for screen readers
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
  extraAction,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const extraButtonRef = useRef<HTMLButtonElement>(null)
  const hasExtra = extraAction !== undefined

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

      // Trap focus within dialog, in the buttons' on-screen order
      if (e.key === 'Tab') {
        const focusableElements = (
          hasExtra
            ? [extraButtonRef.current, confirmButtonRef.current, cancelButtonRef.current]
            : [cancelButtonRef.current, confirmButtonRef.current]
        ).filter(Boolean)
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
    [isOpen, onCancel, hasExtra]
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

  if (!isOpen) return null

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
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative z-10 w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl mx-4"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-spert-text dark:text-gray-100 mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-description"
          className="text-sm text-spert-text-muted dark:text-gray-400 mb-6"
        >
          {message}
        </p>

        <div className={cn('flex justify-end gap-3', hasExtra && 'flex-wrap')}>
          {extraAction && (
            <button ref={extraButtonRef} onClick={extraAction.onClick} className={secondaryButtonClass}>
              {extraAction.label}
            </button>
          )}
          {!hasExtra && (
            <button ref={cancelButtonRef} onClick={onCancel} className={secondaryButtonClass}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded text-white transition-colors',
              variant === 'danger'
                ? 'bg-spert-error hover:bg-spert-error-dark'
                : 'bg-spert-blue hover:bg-spert-blue-dark'
            )}
          >
            {confirmLabel}
          </button>
          {hasExtra && (
            <button ref={cancelButtonRef} onClick={onCancel} className={secondaryButtonClass}>
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
