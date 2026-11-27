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

  // The frame's notice box (FRAME26, v0.52.0): one box at the full column width for every notice in every app
  // (William's decision for the suite frame), so the centred `max-w-lg` card of Lesson 56 is gone: the contract wins
  // over it. `.sf-notice--info` (invited) and `--success` (added) give the box and the text colours. The "✕" keeps its
  // own look, anchored to the box by absolute positioning; the inner content keeps pr-6 so text doesn't slide under it.
  if (state === 'pre_auth') {
    return (
      <div className="sf-notice sf-notice--info relative">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss invitation banner"
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
        >
          ✕
        </button>
        <div className="flex-1 space-y-3 pr-6">
          <p>
            You&apos;ve been invited to collaborate on a project. Sign in with the
            email address that received this invitation.
          </p>
          {isFirebaseAvailable ? (
            // O8 / Lesson 56: no inner max-w-md wrapper — the max-w-lg card
            // already constrains width; nesting another constraint orphans
            // the SignInButtons.
            <SignInButtons fullLabel />
          ) : (
            <p>
              Cloud sign-in is unavailable in this build.
            </p>
          )}
        </div>
      </div>
    )
  }

  // state === 'claimed'
  return (
    <div className="sf-notice sf-notice--success relative">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
      >
        ✕
      </button>
      <div className="flex-1 space-y-2 pr-6">
        <p>
          You&apos;ve been added to: <strong>{claimedNames.join(', ')}</strong>
        </p>
        {mode === 'local' && (
          <p className="text-xs">
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
