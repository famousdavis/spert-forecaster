// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { parseBulkEmails, mapInvitationError } from './firestore-invitations'

describe('parseBulkEmails', () => {
  it('returns empty {valid, invalid} for empty input', () => {
    expect(parseBulkEmails('')).toEqual({ valid: [], invalid: [] })
  })

  it('returns empty {valid, invalid} for whitespace-only input', () => {
    expect(parseBulkEmails('   \n\t')).toEqual({ valid: [], invalid: [] })
  })

  it('splits on commas', () => {
    expect(parseBulkEmails('a@x.com,b@x.com,c@x.com')).toEqual({
      valid: ['a@x.com', 'b@x.com', 'c@x.com'],
      invalid: [],
    })
  })

  it('splits on semicolons', () => {
    expect(parseBulkEmails('a@x.com;b@x.com;c@x.com')).toEqual({
      valid: ['a@x.com', 'b@x.com', 'c@x.com'],
      invalid: [],
    })
  })

  it('splits on newlines', () => {
    expect(parseBulkEmails('a@x.com\nb@x.com\nc@x.com')).toEqual({
      valid: ['a@x.com', 'b@x.com', 'c@x.com'],
      invalid: [],
    })
  })

  it('splits on mixed separators', () => {
    expect(parseBulkEmails('a@x.com, b@x.com;\nc@x.com\td@x.com')).toEqual({
      valid: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'],
      invalid: [],
    })
  })

  it('lowercases all addresses', () => {
    expect(parseBulkEmails('Alice@Example.COM, BOB@x.com')).toEqual({
      valid: ['alice@example.com', 'bob@x.com'],
      invalid: [],
    })
  })

  it('deduplicates after lowercasing', () => {
    expect(parseBulkEmails('a@x.com, A@X.COM, a@x.com')).toEqual({
      valid: ['a@x.com'],
      invalid: [],
    })
  })

  it('preserves first-seen order across duplicates', () => {
    expect(parseBulkEmails('b@x.com, a@x.com, b@x.com')).toEqual({
      valid: ['b@x.com', 'a@x.com'],
      invalid: [],
    })
  })

  it('routes malformed tokens to invalid (no @)', () => {
    expect(parseBulkEmails('alice, bob@x.com')).toEqual({
      valid: ['bob@x.com'],
      invalid: ['alice'],
    })
  })

  it('routes malformed tokens to invalid (no domain TLD)', () => {
    expect(parseBulkEmails('a@x, b@x.com')).toEqual({
      valid: ['b@x.com'],
      invalid: ['a@x'],
    })
  })

  it('routes malformed tokens to invalid (no local part)', () => {
    expect(parseBulkEmails('@x.com, valid@x.com')).toEqual({
      valid: ['valid@x.com'],
      invalid: ['@x.com'],
    })
  })

  it('returns all-invalid for entirely-malformed input', () => {
    expect(parseBulkEmails('alice, bob, charlie')).toEqual({
      valid: [],
      invalid: ['alice', 'bob', 'charlie'],
    })
  })

  it('preserves insertion order across both buckets', () => {
    expect(parseBulkEmails('a@x.com, broken, b@x.com, also-broken')).toEqual({
      valid: ['a@x.com', 'b@x.com'],
      invalid: ['broken', 'also-broken'],
    })
  })

  it('deduplicates invalid tokens too', () => {
    expect(parseBulkEmails('broken, BROKEN, broken')).toEqual({
      valid: [],
      invalid: ['broken'],
    })
  })
})

describe('mapInvitationError', () => {
  const err = (code: string, message?: string) => ({ code, message })

  it('defaults to send context when arg omitted', () => {
    expect(mapInvitationError(err('functions/permission-denied'))).toContain(
      'send'
    )
  })

  describe('functions/resource-exhausted', () => {
    it('maps to daily limit on send', () => {
      expect(
        mapInvitationError(err('functions/resource-exhausted'), 'send')
      ).toContain("today's invitation limit")
    })

    it('maps to resend cap on resend', () => {
      expect(
        mapInvitationError(err('functions/resource-exhausted'), 'resend')
      ).toContain('resend limit')
    })

    it('maps to daily limit on revoke (fallback)', () => {
      expect(
        mapInvitationError(err('functions/resource-exhausted'), 'revoke')
      ).toContain("today's invitation limit")
    })
  })

  describe('functions/permission-denied', () => {
    it('mentions sending on send', () => {
      expect(
        mapInvitationError(err('functions/permission-denied'), 'send')
      ).toMatch(/send/i)
    })
    it('mentions revoke on revoke', () => {
      expect(
        mapInvitationError(err('functions/permission-denied'), 'revoke')
      ).toMatch(/revoke/i)
    })
    it('mentions resend on resend', () => {
      expect(
        mapInvitationError(err('functions/permission-denied'), 'resend')
      ).toMatch(/resend/i)
    })
  })

  describe('functions/failed-precondition', () => {
    it('maps to MS-personal-account block on send', () => {
      expect(
        mapInvitationError(err('functions/failed-precondition'), 'send')
      ).toMatch(/Microsoft personal accounts/)
    })
    it('maps to no-longer-revokable on revoke', () => {
      expect(
        mapInvitationError(err('functions/failed-precondition'), 'revoke')
      ).toMatch(/no longer be revoked/)
    })
    it('maps to no-longer-resendable on resend', () => {
      expect(
        mapInvitationError(err('functions/failed-precondition'), 'resend')
      ).toMatch(/no longer be resent/)
    })
  })

  it('maps functions/not-found uniformly', () => {
    for (const ctx of ['send', 'revoke', 'resend'] as const) {
      expect(mapInvitationError(err('functions/not-found'), ctx)).toBe(
        'Invitation not found.'
      )
    }
  })

  it('maps functions/unauthenticated uniformly', () => {
    for (const ctx of ['send', 'revoke', 'resend'] as const) {
      expect(
        mapInvitationError(err('functions/unauthenticated'), ctx)
      ).toMatch(/signed in/)
    }
  })

  it('passes through invalid-argument message when provided', () => {
    expect(
      mapInvitationError(err('functions/invalid-argument', 'Bad email'), 'send')
    ).toBe('Bad email')
  })

  it('falls back on invalid-argument with empty message', () => {
    expect(
      mapInvitationError(err('functions/invalid-argument', ''), 'send')
    ).toMatch(/Invalid request/)
  })

  describe('unknown / unmapped codes', () => {
    it('returns send-flavored fallback on send', () => {
      expect(mapInvitationError(err('functions/internal'), 'send')).toBe(
        'Failed to send invitations. Please try again.'
      )
    })
    it('returns resend-flavored fallback on resend', () => {
      expect(mapInvitationError(err('functions/internal'), 'resend')).toBe(
        'Failed to resend invitation. Please try again.'
      )
    })
    it('returns revoke-flavored fallback on revoke', () => {
      expect(mapInvitationError(err('functions/internal'), 'revoke')).toBe(
        'Failed to revoke invitation. Please try again.'
      )
    })
    it('handles non-error inputs (no code/message)', () => {
      expect(mapInvitationError({}, 'send')).toMatch(/Failed to send/)
      expect(mapInvitationError(null, 'send')).toMatch(/Failed to send/)
    })
  })
})
