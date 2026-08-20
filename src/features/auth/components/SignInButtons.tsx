// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { signInWithGoogle as firebaseSignInWithGoogle, signInWithMicrosoft as firebaseSignInWithMicrosoft } from '@/shared/firebase/auth'
import { isTosCached, cacheTos, setPendingWrite } from '@/features/auth/lib/tos'
import { normalizeSignInError } from '@/features/auth/lib/sign-in-errors'
import { ConsentModal } from './ConsentModal'

interface SignInButtonsProps {
  /**
   * When true, buttons show full "Sign in with Google" / "Sign in with Microsoft"
   * labels in a side-by-side equal-width layout with primary-blue styling.
   * When false (default), the compact chip layout used by the Settings section
   * is preserved.
   */
  fullLabel?: boolean
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

export function SignInButtons({ fullLabel = false }: SignInButtonsProps = {}) {
  const { user, isFirebaseAvailable } = useAuth()
  const [pendingProvider, setPendingProvider] = useState<'google' | 'microsoft' | null>(null)
  const [showConsent, setShowConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isFirebaseAvailable || user) return null

  // Call firebase auth directly so we can observe errors for normalization.
  // AuthProvider's wrappers swallow errors via console.error.
  const invokeProvider = async (provider: 'google' | 'microsoft') => {
    setError(null)
    try {
      if (provider === 'google') {
        await firebaseSignInWithGoogle()
      } else {
        await firebaseSignInWithMicrosoft()
      }
    } catch (err) {
      const msg = normalizeSignInError(err)
      if (msg !== null) setError(msg)
    }
  }

  const handleClick = (provider: 'google' | 'microsoft') => {
    if (isTosCached()) {
      void invokeProvider(provider)
    } else {
      setPendingProvider(provider)
      setShowConsent(true)
    }
  }

  const handleConsentAccept = () => {
    cacheTos()
    setPendingWrite()
    setShowConsent(false)
    if (pendingProvider) {
      void invokeProvider(pendingProvider)
    }
  }

  const handleConsentCancel = () => {
    setShowConsent(false)
    setPendingProvider(null)
  }

  const compactBtnClass =
    'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer'

  const fullBtnClass =
    'flex-1 min-w-0 flex items-center justify-start gap-2 px-3 py-2 text-sm font-medium rounded bg-spert-blue text-white hover:bg-spert-blue-dark transition-colors cursor-pointer'

  return (
    <>
      {fullLabel ? (
        <div className="flex flex-wrap items-stretch gap-2">
          <button
            onClick={() => handleClick('google')}
            className={fullBtnClass}
            title="Sign in with Google"
          >
            <span className="inline-flex items-center justify-center rounded bg-white p-0.5">
              <GoogleIcon />
            </span>
            <span>Sign in with Google</span>
          </button>
          <button
            onClick={() => handleClick('microsoft')}
            className={fullBtnClass}
            title="Sign in with Microsoft"
          >
            <span className="inline-flex items-center justify-center">
              <MicrosoftIcon />
            </span>
            <span>Sign in with Microsoft</span>
          </button>
          {/* Only in the verbose branch, where a provider is actually being
              chosen. Microsoft is restricted to work/school accounts at the
              app registration, so a personal account is refused by Microsoft
              before a password is entered. */}
          <p className="w-full text-xs text-gray-500 dark:text-gray-400">
            Microsoft sign-in requires a work or school account. For a personal
            account, use Google.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleClick('google')}
            className={compactBtnClass}
            title="Sign in with Google"
          >
            <GoogleIcon />
            <span className="hidden sm:inline">Google</span>
          </button>
          <button
            onClick={() => handleClick('microsoft')}
            className={compactBtnClass}
            title="Sign in with Microsoft"
          >
            <MicrosoftIcon />
            <span className="hidden sm:inline">Microsoft</span>
          </button>
        </div>
      )}
      {error && (
        <p
          className="mt-3 text-xs text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
      {showConsent && (
        <ConsentModal
          onAccept={handleConsentAccept}
          onCancel={handleConsentCancel}
        />
      )}
    </>
  )
}
