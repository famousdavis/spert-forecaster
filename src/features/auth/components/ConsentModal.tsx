// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TOS_URL, PRIVACY_URL } from '@/features/auth/lib/tos'

interface ConsentModalProps {
  isOpen: boolean
  onAccept: () => void
  onCancel: () => void
}

/**
 * Clickwrap consent modal for Cloud Storage activation.
 * Requires the user to check a checkbox agreeing to ToS/Privacy Policy
 * before the "Enable Cloud Storage" button becomes active.
 */
export function ConsentModal({ isOpen, onAccept, onCancel }: ConsentModalProps) {
  const [agreed, setAgreed] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const acceptButtonRef = useRef<HTMLButtonElement>(null)
  const checkboxRef = useRef<HTMLInputElement>(null)

  // Reset checkbox to unchecked each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setAgreed(false)
      cancelButtonRef.current?.focus()
    }
  }, [isOpen])

  // Keyboard handling: Escape to cancel, Tab to trap focus
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }

      if (e.key === 'Tab') {
        const focusable = [
          checkboxRef.current,
          cancelButtonRef.current,
          acceptButtonRef.current,
        ].filter(Boolean) as HTMLElement[]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    },
    [isOpen, onCancel]
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-dialog-title"
        aria-describedby="consent-dialog-description"
        className="relative z-10 w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl mx-4"
      >
        <h2
          id="consent-dialog-title"
          className="text-lg font-semibold text-spert-text dark:text-gray-100 mb-3"
        >
          Enable Cloud Storage
        </h2>

        <div id="consent-dialog-description" className="space-y-3 mb-5">
          <p className="text-sm text-spert-text-muted dark:text-gray-400">
            Cloud Storage stores your project planning data in Firebase/Firestore on Google Cloud.
            Use is governed by the Statistical PERT® Terms of Service and Privacy Policy.
          </p>

          <p className="text-sm">
            <a
              href={TOS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 transition-colors underline"
            >
              Terms of Service
            </a>
            {' · '}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 transition-colors underline"
            >
              Privacy Policy
            </a>
          </p>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-2 mb-5 cursor-pointer">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 cursor-pointer"
          />
          <span className="text-sm text-spert-text dark:text-gray-200">
            I have read and agree to the Terms of Service and Privacy Policy.
          </span>
        </label>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            ref={acceptButtonRef}
            onClick={onAccept}
            disabled={!agreed}
            className="px-4 py-2 text-sm font-medium rounded text-white transition-colors bg-spert-blue hover:bg-spert-blue-dark disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Enable Cloud Storage
          </button>
        </div>
      </div>
    </div>
  )
}
