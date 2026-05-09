// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firestore document schemas and Firebase-related types

import type { Sprint, ProductivityAdjustment, Milestone } from '@/shared/types'
import type { ChangeLogEntry } from '@/shared/state/storage'

export type ProjectRole = 'editor' | 'viewer'
export type StorageMode = 'local' | 'cloud'

export const SCHEMA_VERSION = 1

// --- Firestore Document Schemas ---

export interface FirestoreProjectDoc {
  // Core data (maps to Project + denormalized sprints)
  name: string
  unitOfMeasure: string
  sprintCadenceWeeks?: number
  projectStartDate?: string
  projectFinishDate?: string
  firstSprintStartDate?: string
  productivityAdjustments?: ProductivityAdjustment[]
  milestones?: Milestone[]
  sprints: Sprint[]
  createdAt: string
  updatedAt: string

  // Ownership & sharing
  owner: string
  members: Record<string, ProjectRole>

  // Academic integrity (per-project in cloud mode)
  _originRef?: string
  _changeLog?: ChangeLogEntry[]

  schemaVersion: number
}

export interface FirestoreSettingsDoc {
  autoRecalculate: boolean
  trialCount: number
  defaultChartFontSize: string
  defaultCustomPercentile: number
  defaultCustomPercentile2: number
  defaultResultsPercentiles: number[]
  // exportName/exportId NOT synced (local-only, per-device)
  // theme NOT synced (per-device preference)
}

export interface FirestoreProfileDoc {
  displayName: string
  email: string
  // Suite-wide schema field; null when the OAuth provider returns no avatar.
  // Use `?? null` at all call sites — never undefined.
  photoURL: string | null
  lastSignIn: string
}

// --- Suite-wide custom event payload ---

/**
 * Payload for the `spert:models-changed` CustomEvent dispatched by AuthProvider
 * after a successful claimPendingInvitations callable. Consumed by
 * useInvitationLanding to flip the InvitationBanner to its `claimed` state.
 *
 * The event name `spert:models-changed` is a suite-wide contract — do not
 * rename in any SPERT app.
 */
export interface SpertModelsChangedDetail {
  claimed: { appId: string; modelId: string; modelName: string }[]
}

// --- Bulk invitation types ---

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

/**
 * One row of `spertsuite_invitations`. Schema is shared across SPERT apps,
 * so fields like `isVoting` (AHP-only) appear here for parity even though
 * Forecaster never sets them to anything other than `false`.
 *
 * `*At` fields are stored in Firestore as Timestamps and coerced to millis
 * by the listPendingInvites loader.
 */
export interface PendingInvite {
  tokenId: string
  modelId: string
  modelName: string
  inviteeEmail: string
  role: 'editor' | 'viewer'
  isVoting: boolean
  inviterUid: string
  inviterName: string
  inviterEmail: string
  status: InvitationStatus
  createdAt: number
  expiresAt: number
  acceptedAt?: number
  lastEmailSentAt: number
  emailSendCount: number
  updatedAt: number
}

// --- Cloud Function callable I/O ---

export interface SendInvitationEmailInput {
  // Hardcoded literal — NOT TOS_APP_ID. The two app-id strings differ
  // ('spertforecaster' vs 'spert-forecaster') and registering the wrong one
  // with the callable will fail the appId allowlist check.
  appId: 'spertforecaster'
  modelId: string
  emails: string[]
  role: 'editor' | 'viewer'
  // Forecaster has no voting model — always false.
  isVoting: false
}

export interface SendInvitationEmailResult {
  added: string[]
  invited: string[]
  failed: { email: string; reason: string }[]
}

export interface ClaimPendingInvitationsResult {
  claimed: { appId: string; modelId: string; modelName: string }[]
}

export interface RevokeInviteResult {
  revoked: true
}

export interface ResendInviteResult {
  resent: true
  emailSendCount: number
}

// --- Sync Bus Event Types ---

export type SyncEvent =
  | { type: 'project:save'; projectId: string }
  | { type: 'project:delete'; projectId: string }
  | { type: 'project:import' }
  | { type: 'settings:save' }

// --- Collection Names ---

export const COLLECTIONS = {
  projects: 'spertforecaster_projects',
  settings: 'spertforecaster_settings',
  profiles: 'spertforecaster_profiles',
} as const

// --- Project Member Info (for sharing UI) ---

export interface ProjectMember {
  uid: string
  email: string
  displayName: string
  role: ProjectRole | 'owner'
}
