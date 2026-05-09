// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from 'vitest'
import { captureInviteTokenFromUrl, SESSION_KEY } from './inviteCapture'

// Lesson 58: captureInviteTokenFromUrl is exported with an optional `enabled`
// parameter so tests can call it directly without module mocking and without
// the fragile `vi.resetModules()` re-trigger pattern an IIFE would force.

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('captureInviteTokenFromUrl', () => {
  it('returns false and writes nothing when URL has no invite param', () => {
    window.history.replaceState({}, '', '/')
    expect(captureInviteTokenFromUrl(true)).toBe(false)
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('captures the token to sessionStorage when ?invite=<tok> is present', () => {
    window.history.replaceState({}, '', '/?invite=tok-abc')
    expect(captureInviteTokenFromUrl(true)).toBe(true)
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-abc')
  })

  it('preserves other query params in window.location (capture is read-only)', () => {
    window.history.replaceState({}, '', '/?invite=tok-abc&tab=settings')
    captureInviteTokenFromUrl(true)
    // Capture does not strip — the hook's Effect 1 handles URL strip via
    // router.replace (App Router-friendly). window.location must be
    // unchanged after capture.
    expect(window.location.search).toBe('?invite=tok-abc&tab=settings')
  })

  it('is a no-op when enabled=false (flag-off path)', () => {
    window.history.replaceState({}, '', '/?invite=tok-abc')
    expect(captureInviteTokenFromUrl(false)).toBe(false)
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('is idempotent: repeated calls with the same URL produce the same result', () => {
    window.history.replaceState({}, '', '/?invite=tok-abc')
    captureInviteTokenFromUrl(true)
    captureInviteTokenFromUrl(true)
    captureInviteTokenFromUrl(true)
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-abc')
  })

  it('overwrites a stale session token when URL carries a newer one', () => {
    sessionStorage.setItem(SESSION_KEY, 'tok-old')
    window.history.replaceState({}, '', '/?invite=tok-new')
    expect(captureInviteTokenFromUrl(true)).toBe(true)
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-new')
  })

  it('leaves an existing session token untouched when URL has no invite param', () => {
    sessionStorage.setItem(SESSION_KEY, 'tok-from-redirect')
    window.history.replaceState({}, '', '/')
    expect(captureInviteTokenFromUrl(true)).toBe(false)
    // Capture should not delete a pre-existing token (post-OAuth restore path).
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('tok-from-redirect')
  })
})
