// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { syncBus } from '@/shared/firebase/sync-bus'
import { useState } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { migrateLocalToCloud, type MigrationResult } from '@/shared/firebase/firestore-migration'
import { useProjectStore } from '@/shared/state/project-store'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { normalizeDisplayName } from '@/features/auth/lib/display-name'
import { SignInButtons } from './SignInButtons'
import { UploadConfirmPanel } from './UploadConfirmPanel'

const sectionHeaderClass = 'text-lg font-semibold text-spert-blue mb-4'
const labelClass = 'text-sm font-semibold text-spert-text-secondary dark:text-gray-300'
const descriptionClass = 'text-xs text-spert-text-muted dark:text-gray-400 mt-0.5'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function StorageModeSection() {
  const { user, isFirebaseAvailable, signOut } = useAuth()
  const { mode, setMode } = useStorageMode()
  const projects = useProjectStore((s) => s.projects)
  const [isReUploading, setIsReUploading] = useState(false)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false)
  const [showLocalConfirm, setShowLocalConfirm] = useState(false)

  if (!isFirebaseAvailable) return null

  const handleModeChange = (newMode: 'local' | 'cloud') => {
    if (newMode === 'cloud') {
      if (!user) return
      if (projects.length > 0 && mode === 'local') {
        setShowMigrationPrompt(true)
        return
      }
      setMode('cloud')
    } else {
      setShowLocalConfirm(true)
    }
  }

  const handleConfirmLocal = () => {
    // UX intent: switching to local = start fresh local state. Users who
    // want to keep specific cloud projects locally should Export first,
    // then Import after the switch. See v0.24.2 release notes.
    useProjectStore.getState().clearProjectsOnSignOut()
    // Mode switch, not sign-out: the AI pairing and its session survive, and
    // only the uploaded snapshot is removed.
    syncBus.emit({ type: 'ai:session-teardown', reason: 'mode-switch' })
    setMode('local')
    setMigrationResult(null)
    setShowLocalConfirm(false)
  }

  const handleMigrationSuccess = (result: MigrationResult) => {
    setMigrationResult(result)
    setShowMigrationPrompt(false)
    setMode('cloud')
  }

  const handleCancelMigration = () => {
    setShowMigrationPrompt(false)
    // Stay in local mode — do NOT switch to cloud without uploading
  }

  const handleReUpload = async () => {
    if (!user) return
    setIsReUploading(true)
    setMigrationResult(null)
    try {
      const result = await migrateLocalToCloud(user.uid, {
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL ?? null,
        lastSignIn: new Date().toISOString(),
      })
      setMigrationResult(result)
    } catch (err) {
      setMigrationResult({
        projectsUploaded: 0,
        projectsSkipped: 0,
        settingsUploaded: false,
        errors: [`Migration failed: ${err}`],
      })
    } finally {
      setIsReUploading(false)
    }
  }

  return (
    <>
      {/* Account */}
      <section>
        <h3 className={sectionHeaderClass}>Account</h3>
        <div className="space-y-3">
          {!user ? (
            <div className="space-y-2">
              <p className="text-sm text-spert-text dark:text-gray-200">
                Sign in to enable cloud storage and cross-device sync.
              </p>
              <SignInButtons />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-spert-text dark:text-gray-100">
                  {normalizeDisplayName(user.displayName) || 'User'}
                </p>
                <p className="text-xs text-spert-text-muted dark:text-gray-400">
                  {user.email}
                </p>
              </div>
              <button
                onClick={signOut}
                className="px-3 py-1.5 text-sm font-medium rounded border border-spert-border dark:border-gray-600 text-spert-text dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Storage */}
      <section>
        <h3 className={sectionHeaderClass}>Storage</h3>
        <div className="space-y-4">
          <div>
            <span className={labelClass}>Data storage mode</span>
            <p className={descriptionClass}>
              Local stores data in your browser only. Cloud syncs data to Firebase for cross-device access.
            </p>
          </div>

          {!user && (
            <p className="text-sm text-spert-text-muted dark:text-gray-400 italic">
              Sign in above to enable cloud storage.
            </p>
          )}

          <div className="flex gap-4">
            <label className={`flex items-center gap-2 ${showMigrationPrompt ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name="storageMode"
                value="local"
                checked={mode === 'local'}
                onChange={() => handleModeChange('local')}
                disabled={showMigrationPrompt}
                className={showMigrationPrompt ? 'cursor-not-allowed' : 'cursor-pointer'}
              />
              <span className="text-sm text-spert-text dark:text-gray-200">Local</span>
            </label>
            <label className={`flex items-center gap-2 ${!user || showMigrationPrompt ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name="storageMode"
                value="cloud"
                checked={mode === 'cloud'}
                onChange={() => handleModeChange('cloud')}
                disabled={!user || showMigrationPrompt}
                className={!user || showMigrationPrompt ? 'cursor-not-allowed' : 'cursor-pointer'}
              />
              <span className="text-sm text-spert-text dark:text-gray-200">Cloud</span>
            </label>
          </div>

          {/* Migration prompt — shared UploadConfirmPanel */}
          {showMigrationPrompt && user && (
            <UploadConfirmPanel
              uid={user.uid}
              displayName={user.displayName ?? ''}
              email={user.email ?? ''}
              photoURL={user.photoURL ?? null}
              projectCount={projects.length}
              onSuccess={handleMigrationSuccess}
              onCancel={handleCancelMigration}
            />
          )}

          {/* Re-upload spinner */}
          {isReUploading && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Spinner />
              <span className="text-sm">Uploading data to cloud...</span>
            </div>
          )}

          {/* Migration result */}
          {migrationResult && (
            <div className={`p-3 rounded-lg text-sm ${
              migrationResult.errors.length > 0
                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            }`}>
              {migrationResult.errors.length > 0 ? (
                <>
                  <p className="font-medium text-spert-text dark:text-gray-200">Migration failed</p>
                  {migrationResult.errors.map((err, i) => (
                    <p key={i} className="text-red-700 dark:text-red-300 mt-1">{err}</p>
                  ))}
                </>
              ) : (
                <>
                  <p className="font-medium text-spert-text dark:text-gray-200">Migration complete</p>
                  <p className="text-spert-text-muted dark:text-gray-400 mt-0.5">
                    {migrationResult.projectsUploaded > 0 &&
                      `${migrationResult.projectsUploaded} project${migrationResult.projectsUploaded !== 1 ? 's' : ''} uploaded`}
                    {migrationResult.projectsUploaded > 0 && migrationResult.projectsSkipped > 0 && '. '}
                    {migrationResult.projectsSkipped > 0 &&
                      `${migrationResult.projectsSkipped} skipped (already in cloud)`}
                    {migrationResult.settingsUploaded && '. Settings synced.'}
                  </p>
                </>
              )}
              <button
                onClick={() => setMigrationResult(null)}
                className="mt-2 text-xs text-spert-text-muted dark:text-gray-400 underline hover:text-spert-text dark:hover:text-gray-200 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Re-upload button (when in cloud mode, not re-uploading, no pending result) */}
          {mode === 'cloud' && !isReUploading && !migrationResult && !showMigrationPrompt && user && (
            <button
              onClick={handleReUpload}
              className="text-sm text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
            >
              Upload local data to cloud
            </button>
          )}

          {/* Current status */}
          {user && (
            <div className="flex items-center gap-1.5 text-xs text-spert-text-muted dark:text-gray-400">
              <span className={`w-2 h-2 rounded-full ${mode === 'cloud' ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span>
                {mode === 'cloud' ? `Connected to cloud as ${user.email}` : 'Local storage'}
              </span>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        isOpen={showLocalConfirm}
        title="Switch to local storage?"
        message="Any projects created only in cloud mode won't be accessible in local storage. Your cloud data will remain in Firebase but won't sync until you switch back."
        confirmLabel="Switch to Local"
        cancelLabel="Stay in Cloud"
        onConfirm={handleConfirmLocal}
        onCancel={() => setShowLocalConfirm(false)}
        variant="default"
      />
    </>
  )
}
