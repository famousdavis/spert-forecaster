// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useCallback, useState } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { useProjectStore } from '@/shared/state/project-store'
import { migrateLocalToCloud, type MigrationResult } from '@/shared/firebase/firestore-migration'
import { SignInButtons } from './SignInButtons'

interface StorageLoginModalProps {
  isOpen: boolean
  onClose: () => void
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function StorageLoginModal({ isOpen, onClose }: StorageLoginModalProps) {
  const { user, isFirebaseAvailable } = useAuth()
  const { mode, setMode } = useStorageMode()
  const projects = useProjectStore((s) => s.projects)
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)

  // Auto-close if user is signed in AND already in cloud mode
  // (defensive — the chip should render the avatar instead, not open this modal)
  useEffect(() => {
    if (isOpen && user && mode === 'cloud') {
      onClose()
    }
  }, [isOpen, user, mode, onClose])

  // Keyboard handling: Escape to close (disabled while migrating)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || isMigrating) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [isOpen, isMigrating, onClose]
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

  const handleSwitchToCloud = useCallback(async () => {
    if (!user) return
    setMigrationError(null)

    if (projects.length === 0) {
      setMode('cloud')
      onClose()
      return
    }

    setIsMigrating(true)
    try {
      const result: MigrationResult = await migrateLocalToCloud(user.uid, {
        displayName: user.displayName || '',
        email: user.email || '',
        lastSignIn: new Date().toISOString(),
      })
      if (result.errors.length === 0) {
        setMode('cloud')
        onClose()
      } else {
        setMigrationError(result.errors.join(' '))
      }
    } catch (err) {
      setMigrationError(`Migration failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsMigrating(false)
    }
  }, [user, projects.length, setMode, onClose])

  if (!isOpen) return null

  // Post-signin state: user authenticated but still in local mode.
  // Replace the sign-in UI with a "Switch to Cloud Storage" CTA that
  // triggers the migration flow inline.
  const isPostSignIn = !!user && mode === 'local'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={isMigrating ? undefined : onClose}
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
              {isPostSignIn ? 'Enable Cloud Storage' : 'Storage & Sign In'}
            </h2>

            {/* Decorative radio display — selection reflects proposed target mode */}
            <div className="space-y-2.5 mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={
                    isPostSignIn
                      ? 'w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0'
                      : 'w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-blue-600 shrink-0'
                  }
                />
                <span
                  className={
                    isPostSignIn
                      ? 'text-sm text-spert-text-muted dark:text-gray-400'
                      : 'text-sm text-spert-text dark:text-gray-100'
                  }
                >
                  Local Storage
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span
                  className={
                    isPostSignIn
                      ? 'w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-blue-600 shrink-0'
                      : 'w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0'
                  }
                />
                <span
                  className={
                    isPostSignIn
                      ? 'text-sm text-spert-text dark:text-gray-100'
                      : 'text-sm text-spert-text-muted dark:text-gray-400'
                  }
                >
                  Cloud Storage
                </span>
              </div>
            </div>

            {isPostSignIn ? (
              <>
                <p className="text-sm text-spert-text-muted dark:text-gray-400 mb-5">
                  {projects.length > 0
                    ? `You're signed in as ${user.email}. Upload your ${projects.length} local project${projects.length !== 1 ? 's' : ''} to Firebase and switch to cloud storage.`
                    : `You're signed in as ${user.email}. Switch to cloud storage to sync data across devices.`}
                </p>

                <button
                  onClick={handleSwitchToCloud}
                  disabled={isMigrating}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded bg-spert-blue text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {isMigrating ? (
                    <>
                      <Spinner />
                      <span>Uploading to cloud…</span>
                    </>
                  ) : (
                    <span>
                      {projects.length > 0 ? 'Upload & Switch to Cloud Storage' : 'Switch to Cloud Storage'}
                    </span>
                  )}
                </button>

                {migrationError && (
                  <p className="mt-3 text-xs text-red-600 dark:text-red-400">
                    {migrationError}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-spert-text-muted dark:text-gray-400 mb-5">
                  Sign in to enable Cloud Storage and access your data across devices.
                </p>

                {/* Sign-in buttons — override ghost style to solid blue via descendant selectors */}
                <div className="[&>.flex>button]:!bg-spert-blue [&>.flex>button]:!text-white [&>.flex>button]:!border-spert-blue [&>.flex>button]:hover:!bg-spert-blue-dark dark:[&>.flex>button]:!bg-spert-blue dark:[&>.flex>button]:!text-white dark:[&>.flex>button]:!border-spert-blue dark:[&>.flex>button]:hover:!bg-spert-blue-dark [&_.hidden]:!inline">
                  <SignInButtons />
                </div>
              </>
            )}

            {/* Divider */}
            <div className="border-t border-spert-border dark:border-gray-600 my-5" />

            {/* Dismiss button */}
            <div className="text-center">
              <button
                onClick={onClose}
                disabled={isMigrating}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
