// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { INVITATIONS_ENABLED } from '@/lib/feature-flags'

/** Must match the SESSION_KEY in useInvitationLanding + AuthProvider. */
export const SESSION_KEY = 'spert_invite_token'

/**
 * Capture an `?invite=<token>` URL parameter to sessionStorage so it
 * survives the OAuth round-trip (Lesson 58).
 *
 * Pure capture — does NOT strip the URL or transition any React state.
 * The URL strip is handled by useInvitationLanding's Effect 1 via
 * `router.replace` (App Router-friendly; using `window.history.replaceState`
 * here would race with Next.js's router state).
 *
 * Returns `true` if a token was found and persisted; `false` otherwise.
 *
 * Lesson 66 enabler: by capturing at module load, the hook's
 * `useState` initializer can read `sessionStorage` synchronously without
 * needing a `setState`-in-effect bridge for the URL-token path.
 *
 * Tests can call this function directly with `enabled: true` after
 * mutating `window.location.search` — no module mocking required.
 */
export function captureInviteTokenFromUrl(
  enabled: boolean = INVITATIONS_ENABLED
): boolean {
  if (!enabled) return false
  if (typeof window === 'undefined') return false // SSR guard
  try {
    const token = new URLSearchParams(window.location.search).get('invite')
    if (!token) return false
    sessionStorage.setItem(SESSION_KEY, token)
    return true
  } catch {
    return false // jsdom edge cases / locked-down browsers
  }
}

// Module-load capture with the live flag value. Runs once when this module
// is first imported. Subsequent calls are idempotent (sessionStorage write).
captureInviteTokenFromUrl()
