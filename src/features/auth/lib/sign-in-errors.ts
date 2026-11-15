// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Normalizes Firebase Auth sign-in errors for user display.
 *
 * - popup-closed-by-user, cancelled-popup-request → silent (returns null)
 * - popup-blocked → "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
 * - all others → sanitized fallback string
 */

const SILENT_CODES = new Set<string>([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
])

const POPUP_BLOCKED_MESSAGE = 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'

export function sanitizeFirebaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Sign-in failed. Please try again.'
  const code = (err as { code?: unknown }).code
  const message = (err as { message?: unknown }).message

  if (typeof code === 'string' && code.startsWith('auth/')) {
    const tail = code.slice('auth/'.length).replace(/-/g, ' ')
    return `Sign-in failed: ${tail}.`
  }

  if (typeof message === 'string' && message.trim()) {
    // Strip any Firebase-formatted prefix like "Firebase: " and trailing code parens.
    const cleaned = message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '')
    return cleaned || 'Sign-in failed. Please try again.'
  }

  return 'Sign-in failed. Please try again.'
}

/**
 * Normalize a sign-in error into a user-facing message or null for silent codes.
 */
export function normalizeSignInError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return sanitizeFirebaseError(err)
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string') {
    if (SILENT_CODES.has(code)) return null
    if (code === 'auth/popup-blocked') return POPUP_BLOCKED_MESSAGE
  }
  return sanitizeFirebaseError(err)
}
