// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What the signed-in user may do to each project (Brief 39). The cloud's rules
// already enforce it; this mirrors them so the app never offers a change the
// cloud will refuse.
//
// ⚠️ The role is DERIVED, never stored in a project document: from each cloud
// document's `owner` and `members` (useCloudSync), held in the project store's
// transient `projectRoles` map, never persisted and never written.

import type { StorageMode } from '@/shared/firebase/types'
import { NON_OWNER_DELETE_TEXT, NOT_IN_CLOUD_SAVE_TEXT, VIEW_ONLY_SAVE_TEXT } from '@/shared/firebase/firestore-errors'
import { useStorageModeStore } from './storage-mode-store'

/** The signed-in user's role on one project in a cloud view. */
export type CloudRole = 'owner' | 'editor' | 'viewer'

/**
 * What the app lets the user do to one project.
 *
 * `not-in-cloud`: the store holds the project, but no cloud view for this
 * account contains it, and this browser is not creating it. Brief 40's
 * zero-project guard keeps such projects after a load that found nothing: a
 * share removed while the user was away, a project deleted on another device,
 * or one made while signed out. Changes to it cannot be saved, so it is read
 * only; it can still be exported and cloned.
 */
export type ProjectAccess = CloudRole | 'not-in-cloud'

/**
 * The role a cloud document gives `uid`. Owner wins over any `members` entry.
 * A member entry other than 'editor' — 'viewer', or a value this app does not
 * know — reads as 'viewer': it fails closed.
 */
export function roleFromDoc(doc: { owner?: unknown; members?: unknown }, uid: string): CloudRole {
  if (doc.owner === uid) return 'owner'
  const members = doc.members
  const entry = typeof members === 'object' && members !== null ? (members as Record<string, unknown>)[uid] : undefined
  return entry === 'editor' ? 'editor' : 'viewer'
}

/**
 * The access the app grants to one project.
 *
 * - Local mode: full access (`owner`); there are no roles.
 * - Cloud mode before the first cloud load has succeeded: `owner` too. The
 *   project tabs are behind the loading panel, and Brief 40's hold keeps every
 *   project write in this browser. This also covers cloud mode signed out,
 *   which syncs nothing.
 * - Cloud mode, loaded: the project's entry — its role in the latest cloud
 *   view, or `not-in-cloud`. A project with NO entry is one this browser is
 *   creating and no cloud view contains yet: `owner`.
 */
export function resolveAccess(s: {
  mode: StorageMode
  cloudDataLoaded: boolean
  entry: ProjectAccess | undefined
}): ProjectAccess {
  if (s.mode !== 'cloud' || !s.cloudDataLoaded) return 'owner'
  return s.entry ?? 'owner'
}

/** May change the project's content (everything but its sharing). */
export const canEditProject = (access: ProjectAccess): boolean => access === 'owner' || access === 'editor'

/** May delete the project — and so may be offered anything that deletes it. */
export const canDeleteProject = (access: ProjectAccess): boolean => access === 'owner'

/**
 * Holding this project blocks Replace all: a Replace all would delete it, and
 * the cloud refuses that to anyone but its owner. A `not-in-cloud` project does
 * not block it — the import never sends a delete for a project no cloud view
 * for this account contains.
 */
export const blocksReplaceAll = (access: ProjectAccess): boolean => access === 'editor' || access === 'viewer'

/** The access for one project from store state, outside React (store guards, the import). */
export function accessFromState(
  state: { cloudDataLoaded: boolean; projectRoles: Record<string, ProjectAccess> },
  projectId: string,
): ProjectAccess {
  return resolveAccess({
    mode: useStorageModeStore.getState().mode,
    cloudDataLoaded: state.cloudDataLoaded,
    entry: state.projectRoles[projectId],
  })
}

/** Two role maps hold the same entries. */
export function sameRoles(a: Record<string, ProjectAccess>, b: Record<string, ProjectAccess>): boolean {
  const keysA = Object.keys(a)
  return keysA.length === Object.keys(b).length && keysA.every((id) => a[id] === b[id])
}

/**
 * Replace all is blocked while ANY held project blocks it (Brief 39). One
 * predicate for the store's refusal and the import preview's initial mode
 * (V9); ProjectsTab composes the same `blocksReplaceAll` reactively.
 */
export function replaceAllBlockedIn(state: {
  projects: { id: string }[]
  cloudDataLoaded: boolean
  projectRoles: Record<string, ProjectAccess>
}): boolean {
  return state.projects.some((p) => blocksReplaceAll(accessFromState(state, p.id)))
}

// Owner-approved wording (Brief 39 §7, T8, 2026-10-08). The reason Replace all
// data is unavailable, and the store's refusal if one is attempted anyway.
export const REPLACE_ALL_SHARED_TEXT =
  "Replace all data isn't available while your list includes projects shared with you: it would delete them, and only their owners can. Choose Merge into workspace instead."

// Owner-approved wording (Brief 39 §7, G4, 2026-10-08). The one refusal the
// store's guard has of its own: no delete is ever sent for a project no cloud
// view of this account contains, so the cloud has no refusal text for it.
export const NOT_IN_CLOUD_DELETE_TEXT = "The project wasn't deleted — this project isn't in your cloud account."

/**
 * What the store's guard says when it refuses a user's change (Brief 39, V2):
 * the click raced a role change and reached a control the UI had not yet
 * disabled. Called only for a change the access forbids.
 *
 * ⚠️ G1–G3 ARE the cloud-refusal texts (`firestore-errors.ts`), one string
 * each: a refusal reads the same whether the guard or the cloud made it.
 */
export function guardRefusalText(change: 'edit' | 'delete', access: ProjectAccess): string {
  if (change === 'delete') return access === 'not-in-cloud' ? NOT_IN_CLOUD_DELETE_TEXT : NON_OWNER_DELETE_TEXT
  return access === 'not-in-cloud' ? NOT_IN_CLOUD_SAVE_TEXT : VIEW_ONLY_SAVE_TEXT
}
