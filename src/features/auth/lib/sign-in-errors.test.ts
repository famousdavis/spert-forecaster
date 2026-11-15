// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { normalizeSignInError, sanitizeFirebaseError } from './sign-in-errors'

describe('normalizeSignInError', () => {
  it('returns null for popup-closed-by-user (silent)', () => {
    expect(normalizeSignInError({ code: 'auth/popup-closed-by-user' })).toBeNull()
  })

  it('returns null for cancelled-popup-request (silent)', () => {
    expect(normalizeSignInError({ code: 'auth/cancelled-popup-request' })).toBeNull()
  })

  it('returns pop-up message for popup-blocked', () => {
    expect(normalizeSignInError({ code: 'auth/popup-blocked' })).toBe(
      'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
    )
  })

  it('falls back to sanitized message for other codes', () => {
    const msg = normalizeSignInError({ code: 'auth/network-request-failed' })
    expect(msg).toBe('Sign-in failed: network request failed.')
  })

  it('falls back to sanitized message for non-auth errors', () => {
    const msg = normalizeSignInError(new Error('Something broke'))
    expect(msg).toBe('Something broke')
  })

  it('returns generic fallback for unknown shapes', () => {
    expect(normalizeSignInError(null)).toBe('Sign-in failed. Please try again.')
    expect(normalizeSignInError(undefined)).toBe('Sign-in failed. Please try again.')
  })
})

describe('sanitizeFirebaseError', () => {
  it('strips "Firebase:" prefix and trailing code', () => {
    const err = { message: 'Firebase: Something happened (auth/internal-error).' }
    expect(sanitizeFirebaseError(err)).toBe('Something happened')
  })

  it('formats auth/* codes as human-readable', () => {
    expect(sanitizeFirebaseError({ code: 'auth/network-request-failed' })).toBe(
      'Sign-in failed: network request failed.'
    )
  })
})
