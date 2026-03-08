'use client'

import { useState } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { migrateLocalToCloud, type MigrationResult } from '@/shared/firebase/firestore-migration'
import { useProjectStore } from '@/shared/state/project-store'
import { SignInButtons } from './SignInButtons'

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
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false)

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
      setMode('local')
      setMigrationResult(null)
    }
  }

  const handleMigrate = async () => {
    if (!user) return
    setIsMigrating(true)
    setMigrationResult(null)
    try {
      const result = await migrateLocalToCloud(user.uid, {
        displayName: user.displayName || '',
        email: user.email || '',
        lastSignIn: new Date().toISOString(),
      })
      setMigrationResult(result)
      // Only switch to cloud if migration had no errors
      if (result.errors.length === 0) {
        setMode('cloud')
      }
    } catch (err) {
      setMigrationResult({
        projectsUploaded: 0,
        projectsSkipped: 0,
        settingsUploaded: false,
        errors: [`Migration failed: ${err}`],
      })
    } finally {
      setIsMigrating(false)
      setShowMigrationPrompt(false)
    }
  }

  const handleCancelMigration = () => {
    setShowMigrationPrompt(false)
    // Stay in local mode — do NOT switch to cloud without uploading
  }

  const handleReUpload = () => {
    setMigrationResult(null)
    handleMigrate()
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
                  {user.displayName || 'User'}
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
            <label className={`flex items-center gap-2 ${isMigrating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name="storageMode"
                value="local"
                checked={mode === 'local'}
                onChange={() => handleModeChange('local')}
                disabled={isMigrating}
                className={isMigrating ? 'cursor-not-allowed' : 'cursor-pointer'}
              />
              <span className="text-sm text-spert-text dark:text-gray-200">Local</span>
            </label>
            <label className={`flex items-center gap-2 ${!user || isMigrating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name="storageMode"
                value="cloud"
                checked={mode === 'cloud'}
                onChange={() => handleModeChange('cloud')}
                disabled={!user || isMigrating}
                className={!user || isMigrating ? 'cursor-not-allowed' : 'cursor-pointer'}
              />
              <span className="text-sm text-spert-text dark:text-gray-200">Cloud</span>
            </label>
          </div>

          {/* Inline spinner during migration */}
          {isMigrating && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Spinner />
              <span className="text-sm">Uploading data to cloud...</span>
            </div>
          )}

          {/* Migration prompt */}
          {showMigrationPrompt && !isMigrating && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg space-y-2">
              <p className="text-sm text-spert-text dark:text-gray-200">
                You have {projects.length} project{projects.length !== 1 ? 's' : ''} stored locally.
                Upload them to the cloud to continue in cloud mode.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleMigrate}
                  className="px-3 py-1.5 text-sm font-medium rounded bg-spert-blue text-white hover:bg-blue-600 cursor-pointer"
                >
                  Upload to Cloud
                </button>
                <button
                  onClick={handleCancelMigration}
                  className="px-3 py-1.5 text-sm font-medium rounded border border-spert-border dark:border-gray-600 text-spert-text dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
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

          {/* Re-upload button (when in cloud mode, not migrating, no pending result) */}
          {mode === 'cloud' && !isMigrating && !migrationResult && !showMigrationPrompt && user && (
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
    </>
  )
}
