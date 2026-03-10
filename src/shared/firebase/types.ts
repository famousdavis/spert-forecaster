// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firestore document schemas and Firebase-related types

import type { Project, Sprint, ProductivityAdjustment, Milestone } from '@/shared/types'
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
  lastSignIn: string
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
