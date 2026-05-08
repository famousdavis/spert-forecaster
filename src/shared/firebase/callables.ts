// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Centralized wrappers for the bulk-invitation Cloud Functions (Lesson 61).
//
// `requireFunctions()` provides a single guard with a descriptive error
// message in place of the Firebase SDK's opaque
// `TypeError: Cannot read properties of null (reading 'name')` that bubbles
// up from a non-null assertion on an unconfigured `functions` instance.
//
// Each wrapper unboxes `r.data` so callers receive the typed result directly.
// In production these code paths are gated by cloud-mode + signed-in-user
// checks at the UI layer, so a `requireFunctions()` throw is purely a
// diagnostic aid for local-dev misconfiguration.

import { httpsCallable } from 'firebase/functions'
import { functionsInstance } from './config'
import type {
  SendInvitationEmailInput,
  SendInvitationEmailResult,
  ClaimPendingInvitationsResult,
  RevokeInviteResult,
  ResendInviteResult,
} from './types'

function requireFunctions() {
  if (!functionsInstance) throw new Error('Firebase Functions not initialized.')
  return functionsInstance
}

export async function callSendInvitationEmail(
  input: SendInvitationEmailInput
): Promise<SendInvitationEmailResult> {
  const r = await httpsCallable<SendInvitationEmailInput, SendInvitationEmailResult>(
    requireFunctions(),
    'sendInvitationEmail'
  )(input)
  return r.data
}

export async function callClaimPendingInvitations(): Promise<ClaimPendingInvitationsResult> {
  const r = await httpsCallable<Record<string, never>, ClaimPendingInvitationsResult>(
    requireFunctions(),
    'claimPendingInvitations'
  )({})
  return r.data
}

export async function callRevokeInvite(tokenId: string): Promise<RevokeInviteResult> {
  const r = await httpsCallable<{ tokenId: string }, RevokeInviteResult>(
    requireFunctions(),
    'revokeInvite'
  )({ tokenId })
  return r.data
}

export async function callResendInvite(tokenId: string): Promise<ResendInviteResult> {
  const r = await httpsCallable<{ tokenId: string }, ResendInviteResult>(
    requireFunctions(),
    'resendInvite'
  )({ tokenId })
  return r.data
}
