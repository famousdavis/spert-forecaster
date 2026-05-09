// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { Suspense } from 'react'
import { useInvitationLanding } from '@/features/auth/hooks/useInvitationLanding'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import { SignInButtons } from '@/features/auth/components/SignInButtons'

/**
 * Three-state landing banner for bulk invitations:
 *
 *   idle      — renders nothing
 *   pre_auth  — blue banner with sign-in CTAs (the SignInButtons component
 *               preserves the ToS consent gate and provider-logo styling)
 *   claimed   — green banner confirming the user was added to the project(s);
 *               when the local store is still in 'local' mode, also shows a
 *               "Switch to Cloud Storage in Settings" hint so the user knows
 *               where the project will appear
 *
 * Inner content is wrapped in `<Suspense fallback={null}>` because
 * useInvitationLanding calls `useSearchParams()`, which Next.js requires to
 * be inside a Suspense boundary in App Router builds.
 */
function InvitationBannerInner() {
  const { state, claimedNames, dismiss } = useInvitationLanding()
  const { isFirebaseAvailable } = useAuth()
  const mode = useStorageModeStore((s) => s.mode)

  if (state === 'idle') return null

  // Lesson 56: centered-card layout (max-w-lg mx-auto) for both branches —
  // InvitationBanner is a primary CTA, NOT a passive informational strip
  // like FirstRunBanner / LocalStorageWarningBanner. Dismiss button is
  // anchored to the card via absolute positioning; inner content has pr-6
  // so text doesn't slide under the dismiss target.
  if (state === 'pre_auth') {
    return (
      <div className="relative max-w-lg mx-auto mb-4 p-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shadow-sm">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss invitation banner"
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-pointer"
        >
          ✕
        </button>
        <div className="space-y-3 pr-6">
          <p className="text-sm text-spert-text dark:text-gray-200">
            You&apos;ve been invited to collaborate on a project. Sign in with the
            email address that received this invitation.
          </p>
          {isFirebaseAvailable ? (
            // O8 / Lesson 56: no inner max-w-md wrapper — the max-w-lg card
            // already constrains width; nesting another constraint orphans
            // the SignInButtons.
            <SignInButtons fullLabel />
          ) : (
            <p className="text-sm text-spert-text-muted dark:text-gray-400">
              Cloud sign-in is unavailable in this build.
            </p>
          )}
        </div>
      </div>
    )
  }

  // state === 'claimed'
  return (
    <div className="relative max-w-lg mx-auto mb-4 p-5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg shadow-sm">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-pointer"
      >
        ✕
      </button>
      <div className="space-y-2 pr-6">
        <p className="text-sm text-spert-text dark:text-gray-200">
          You&apos;ve been added to: <strong>{claimedNames.join(', ')}</strong>
        </p>
        {mode === 'local' && (
          <p className="text-xs text-spert-text-muted dark:text-gray-400">
            Switch to Cloud Storage in Settings to view this project.
          </p>
        )}
      </div>
    </div>
  )
}

export function InvitationBanner() {
  return (
    <Suspense fallback={null}>
      <InvitationBannerInner />
    </Suspense>
  )
}
