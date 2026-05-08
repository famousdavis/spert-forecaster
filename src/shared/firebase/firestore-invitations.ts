// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Bulk-invitation Firestore queries, callable wrappers, and email-parsing
// utilities. Writes go through Cloud Functions (Admin SDK); the client only
// reads the spertsuite_invitations collection directly.

import { collection, getDocs, query, where, type Timestamp } from 'firebase/firestore'
import { db } from './config'
import { callRevokeInvite, callResendInvite } from './callables'
import type { PendingInvite } from './types'

function tsToMillis(value: unknown): number {
  if (value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis()
  }
  if (typeof value === 'number') return value
  return 0
}

/**
 * List pending invitations sent by `uid` for a given project (`modelId`).
 *
 * Filters `status === 'pending'` in code rather than via a where() clause so
 * the existing (inviterUid, modelId, createdAt) composite index is sufficient.
 * Sorts newest-first.
 *
 * Note: the Firestore field is `modelId` regardless of what each app calls
 * the entity (project / model / scenario) — schema is shared across the suite.
 */
export async function listPendingInvites(
  uid: string,
  modelId: string
): Promise<PendingInvite[]> {
  if (!db) return []
  const q = query(
    collection(db, 'spertsuite_invitations'),
    where('inviterUid', '==', uid),
    where('modelId', '==', modelId)
  )
  const snap = await getDocs(q)
  const results: PendingInvite[] = []
  for (const docSnap of snap.docs) {
    const d = docSnap.data()
    if (d.status !== 'pending') continue
    results.push({
      tokenId: docSnap.id,
      modelId: d.modelId as string,
      modelName: d.modelName as string,
      inviteeEmail: d.inviteeEmail as string,
      role: d.role as 'editor' | 'viewer',
      isVoting: (d.isVoting as boolean) ?? false,
      inviterUid: d.inviterUid as string,
      inviterName: d.inviterName as string,
      inviterEmail: d.inviterEmail as string,
      status: d.status as 'pending',
      createdAt: tsToMillis(d.createdAt),
      expiresAt: tsToMillis(d.expiresAt),
      acceptedAt: d.acceptedAt ? tsToMillis(d.acceptedAt) : undefined,
      lastEmailSentAt: tsToMillis(d.lastEmailSentAt),
      emailSendCount: (d.emailSendCount as number) ?? 0,
      updatedAt: tsToMillis(d.updatedAt),
    })
  }
  results.sort((a, b) => b.createdAt - a.createdAt)
  return results
}

export async function revokeInviteToken(tokenId: string): Promise<void> {
  await callRevokeInvite(tokenId)
}

export async function resendInviteToken(tokenId: string): Promise<void> {
  await callResendInvite(tokenId)
}

/**
 * Basic email-format guard for client-side bulk-input parsing. Not RFC-strict
 * (the Cloud Function validates authoritatively); just enough to catch obvious
 * junk so it can be reported back to the user as "invalid format" instead of
 * silently dropped.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Parse a bulk-paste email string into deduplicated, lowercased valid and
 * invalid subsets (Lesson 42).
 *
 * Splits on commas, semicolons, and any whitespace (including newlines).
 * Tokens that fail the basic email-format guard are returned in `invalid` so
 * the UI can render them as red chips with `reason: 'invalid-format'` rather
 * than silently filtering — silent filtering of user input always looks like
 * a bug, regardless of what the documentation says.
 *
 * Insertion order is preserved across both arrays. Empty input returns
 * `{ valid: [], invalid: [] }`.
 */
export function parseBulkEmails(raw: string): { valid: string[]; invalid: string[] } {
  const tokens = [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
  const valid: string[] = []
  const invalid: string[] = []
  for (const token of tokens) {
    ;(EMAIL_RE.test(token) ? valid : invalid).push(token)
  }
  return { valid, invalid }
}

export type InvitationErrorContext = 'send' | 'resend' | 'revoke'

/**
 * Map a Firebase callable HttpsError to a user-facing message.
 *
 * The same error code (e.g. `functions/permission-denied`) carries different
 * meaning across send / resend / revoke flows, so the context discriminator
 * is required. The `failed-precondition` code, in particular, signals the
 * Microsoft-personal-account block on send but "no longer revokable/resendable"
 * on the other two flows.
 */
export function mapInvitationError(
  err: unknown,
  context: InvitationErrorContext = 'send'
): string {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''

  switch (code) {
    case 'functions/resource-exhausted':
      if (context === 'resend') {
        return 'This invitation has reached its resend limit (5). Revoke and re-invite to start over.'
      }
      return "You've reached today's invitation limit (25). Try again tomorrow."
    case 'functions/permission-denied':
      if (context === 'revoke') return 'Only the project owner can revoke invitations.'
      if (context === 'resend') return 'Only the project owner can resend invitations.'
      return 'Only the project owner can send invitations.'
    case 'functions/failed-precondition':
      if (context === 'revoke') return 'This invitation can no longer be revoked.'
      if (context === 'resend') return 'This invitation can no longer be resent.'
      return 'Could not verify your email address. Microsoft personal accounts (@outlook.com, @hotmail.com) are not supported.'
    case 'functions/not-found':
      return 'Invitation not found.'
    case 'functions/unauthenticated':
      return 'You must be signed in to perform this action.'
    case 'functions/invalid-argument':
      return message || 'Invalid request. Please check your input and try again.'
    default:
      if (context === 'resend') return 'Failed to resend invitation. Please try again.'
      if (context === 'revoke') return 'Failed to revoke invitation. Please try again.'
      return 'Failed to send invitations. Please try again.'
  }
}
