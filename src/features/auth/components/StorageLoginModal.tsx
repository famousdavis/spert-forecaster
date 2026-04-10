// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useCallback } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { SignInButtons } from './SignInButtons'

interface StorageLoginModalProps {
  isOpen: boolean
  onClose: () => void
}

export function StorageLoginModal({ isOpen, onClose }: StorageLoginModalProps) {
  const { isFirebaseAvailable } = useAuth()

  // Keyboard handling: Escape to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [isOpen, onClose]
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
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-login-dialog-title"
        className="relative z-10 w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl mx-4"
      >
        {!isFirebaseAvailable ? (
          <p className="text-sm text-spert-text-muted dark:text-gray-400">
            Cloud Storage is not available in this environment.
          </p>
        ) : (
          <>
            <h2
              id="storage-login-dialog-title"
              className="text-lg font-semibold text-spert-text dark:text-gray-100 mb-4"
            >
              Storage &amp; Sign In
            </h2>

            {/* Decorative radio display */}
            <div className="space-y-2.5 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-blue-600 shrink-0" />
                <span className="text-sm text-spert-text dark:text-gray-100">Local Storage</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                <span className="text-sm text-spert-text-muted dark:text-gray-400">Cloud Storage</span>
              </div>
            </div>

            <p className="text-sm text-spert-text-muted dark:text-gray-400 mb-5">
              Sign in to enable Cloud Storage and access your data across devices.
            </p>

            {/* Sign-in buttons — override ghost style to solid blue via descendant selectors */}
            <div className="[&>.flex>button]:!bg-spert-blue [&>.flex>button]:!text-white [&>.flex>button]:!border-spert-blue [&>.flex>button]:hover:!bg-spert-blue-dark dark:[&>.flex>button]:!bg-spert-blue dark:[&>.flex>button]:!text-white dark:[&>.flex>button]:!border-spert-blue dark:[&>.flex>button]:hover:!bg-spert-blue-dark [&_.hidden]:!inline">
              <SignInButtons />
            </div>

            {/* Divider */}
            <div className="border-t border-spert-border dark:border-gray-600 my-5" />

            {/* Dismiss button */}
            <div className="text-center">
              <button
                onClick={onClose}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                Continue with Local Storage
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
