// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useCallback, useState } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { useProjectStore } from '@/shared/state/project-store'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { normalizeDisplayName } from '@/features/auth/lib/display-name'
import { SignInButtons } from './SignInButtons'
import { UploadConfirmPanel } from './UploadConfirmPanel'

interface CloudStorageModalProps {
  isOpen: boolean
  onClose: () => void
}

const sectionHeadingClass = 'text-sm font-semibold text-spert-text dark:text-gray-100 mb-2'
const descriptionClass = 'text-xs text-spert-text-muted dark:text-gray-400'

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6L18 18M6 18L18 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CloudStorageModal({ isOpen, onClose }: CloudStorageModalProps) {
  const { user, isFirebaseAvailable, signOut } = useAuth()
  const { mode, setMode } = useStorageMode()
  const projects = useProjectStore((s) => s.projects)

  const [showUploadConfirm, setShowUploadConfirm] = useState(false)
  const [showSwitchToLocalConfirm, setShowSwitchToLocalConfirm] = useState(false)

  const isSignedIn = !!user
  const isSignedInLocal = isSignedIn && mode === 'local'
  const isSignedInCloud = isSignedIn && mode === 'cloud'

  // Close handler — also resets transient confirm panels so reopening the
  // modal starts in a clean state. (Avoids a setState-in-effect reset hook.)
  const handleClose = useCallback(() => {
    setShowUploadConfirm(false)
    setShowSwitchToLocalConfirm(false)
    onClose()
  }, [onClose])

  // Escape to close; body scroll lock when open.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    },
    [isOpen, handleClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

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

  const handleRadioCloud = useCallback(() => {
    if (!user) return
    if (mode === 'cloud') return
    if (projects.length === 0) {
      setMode('cloud')
      return
    }
    setShowUploadConfirm(true)
  }, [user, mode, projects.length, setMode])

  const handleRadioLocal = useCallback(() => {
    if (mode === 'local') return
    setShowSwitchToLocalConfirm(true)
  }, [mode])

  const handleUploadSuccess = useCallback(() => {
    setMode('cloud')
    setShowUploadConfirm(false)
  }, [setMode])

  const handleConfirmSwitchToLocal = useCallback(() => {
    useProjectStore.getState().clearProjectsOnSignOut()
    setMode('local')
    setShowSwitchToLocalConfirm(false)
  }, [setMode])

  const handleSignOut = useCallback(async () => {
    await signOut()
    // AuthProvider cascade handles: cancelPendingSaves, clearProjects,
    // setMode('local'), setUser(null). There is no page reload; the modal
    // must close itself explicitly.
    handleClose()
  }, [signOut, handleClose])

  if (!isOpen) return null

  const displayName = normalizeDisplayName(user?.displayName) || user?.email || 'Signed in'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-storage-dialog-title"
        className="relative z-10 w-full max-w-[460px] rounded-lg bg-white dark:bg-gray-800 shadow-xl mx-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-spert-border dark:border-gray-700">
          <h2
            id="cloud-storage-dialog-title"
            className="text-lg font-semibold text-spert-text dark:text-gray-100"
          >
            Cloud Storage
          </h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-gray-500 dark:text-gray-400 hover:text-spert-text dark:hover:text-gray-200 cursor-pointer p-1 -mr-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6">
          {!isFirebaseAvailable ? (
            <p className="text-sm text-spert-text-muted dark:text-gray-400">
              Cloud Storage is not available in this environment.
            </p>
          ) : (
            <>
              {/* Storage section */}
              <section>
                <h3 className={sectionHeadingClass}>Storage</h3>
                <div role="radiogroup" aria-label="Storage mode" className="space-y-2">
                  <label
                    className={`flex items-center gap-2 ${isSignedInCloud ? 'cursor-pointer' : ''}`}
                  >
                    <input
                      type="radio"
                      name="cloudModalStorageMode"
                      checked={mode === 'local'}
                      onChange={handleRadioLocal}
                      className="cursor-pointer"
                    />
                    <span className="text-sm text-spert-text dark:text-gray-200">
                      Local (browser only)
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-2 ${
                      isSignedIn ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cloudModalStorageMode"
                      checked={mode === 'cloud'}
                      onChange={handleRadioCloud}
                      disabled={!isSignedIn}
                      className={isSignedIn ? 'cursor-pointer' : 'cursor-not-allowed'}
                    />
                    <span className="text-sm text-spert-text dark:text-gray-200">
                      Cloud (sync across devices)
                    </span>
                  </label>
                </div>

                {!isSignedIn && (
                  <>
                    <p className={`${descriptionClass} mt-3 mb-3`}>
                      Sign in to enable cloud storage and sharing.
                    </p>
                    <SignInButtons fullLabel />
                  </>
                )}

                {isSignedInLocal && user && (
                  <div className="mt-3 space-y-3">
                    <IdentityCard
                      displayName={displayName}
                      email={user.email ?? ''}
                      onSignOut={handleSignOut}
                    />
                    {showUploadConfirm ? (
                      <UploadConfirmPanel
                        uid={user.uid}
                        displayName={user.displayName ?? ''}
                        email={user.email ?? ''}
                        photoURL={user.photoURL ?? null}
                        projectCount={projects.length}
                        onSuccess={handleUploadSuccess}
                        onCancel={() => setShowUploadConfirm(false)}
                      />
                    ) : (
                      <button
                        onClick={handleClose}
                        className="w-full px-3 py-2 text-sm font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                      >
                        Keep using local storage
                      </button>
                    )}
                  </div>
                )}

                {isSignedInCloud && user && (
                  <div className="mt-3">
                    <IdentityCard
                      displayName={displayName}
                      email={user.email ?? ''}
                      onSignOut={handleSignOut}
                    />
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* Switch-to-local confirm (dialog-over-dialog) */}
      <ConfirmDialog
        isOpen={showSwitchToLocalConfirm}
        title="Switch to local storage?"
        message="Any projects created only in cloud mode won't be accessible in local storage. Your cloud data will remain in Firebase but won't sync until you switch back."
        confirmLabel="Switch to Local"
        cancelLabel="Stay in Cloud"
        onConfirm={handleConfirmSwitchToLocal}
        onCancel={() => setShowSwitchToLocalConfirm(false)}
        variant="default"
      />
    </div>
  )
}

interface IdentityCardProps {
  displayName: string
  email: string
  onSignOut: () => void | Promise<void>
}

function IdentityCard({ displayName, email, onSignOut }: IdentityCardProps) {
  const [signingOut, setSigningOut] = useState(false)

  const handleClick = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-spert-border dark:border-gray-700">
      <div className="min-w-0">
        <p className="text-sm font-medium text-spert-text dark:text-gray-100 truncate">
          {displayName}
        </p>
        {email && (
          <p className="text-xs text-spert-text-muted dark:text-gray-400 truncate">{email}</p>
        )}
      </div>
      <button
        onClick={handleClick}
        disabled={signingOut}
        className="shrink-0 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}
