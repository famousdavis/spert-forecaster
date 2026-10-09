// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What the app tells a user about their access to a project, and where
// (Brief 39 §7). Owner-approved wording (2026-10-08): change it only with the owner.

import { canDeleteProject, canEditProject, type ProjectAccess } from '@/shared/state/project-access'

/** Import preview (T6): why a conflict with a project the user can only view offers only Keep and Copy. */
export const importViewerNote = (name: string) => `You can only view "${name}", so this file can't update or replace it.`

/** Import preview (T6b): the same, for a project no cloud view for this account contains (V1). */
export const importNotInCloudNote = (name: string) =>
  `"${name}" isn't in your cloud account, so this file can't update or replace it.`

/** Import preview (T7): why an editor is not offered Replace on a name conflict. */
export const importEditorReplaceNote = (name: string) =>
  `Replace isn't offered: it would delete "${name}", and only its owner can delete it.`

// Read-only projects (Brief 39 PR B): a project the user can only view
// (`viewer`), or one no cloud view for this account contains (`not-in-cloud`,
// V1). Every control that would change it stays in place, disabled, and says
// why; nothing is hidden but Share.

/** The banner at the top of Sprint History and Forecast (T1, T1b). Neither names Clone (V7). */
export const VIEW_ONLY_BANNER =
  'View only — this project is shared with you as a viewer. You can run forecasts, export and copy charts. To change it, ask its owner for edit access.'
export const NOT_IN_CLOUD_BANNER =
  'Not in your cloud account — this project is view only. It may have been unshared from you or deleted, or made while you were signed out. You can still export it. It leaves this list when your projects next update.'

/** Why a control that would change the project is disabled (T2, T2b): its tooltip and its description. */
export const VIEW_ONLY_REASON = 'View only — this project is shared with you as a viewer.'
export const NOT_IN_CLOUD_REASON = "View only — this project isn't in your cloud account."

/** Why Delete project is disabled for an editor or a viewer (T3). */
export const OWNER_ONLY_DELETE_REASON =
  "Only the project's owner can delete it. To remove it from your list, ask the owner to stop sharing it with you."

/** The badge beside the project's name in the Projects list (T4, T4b). */
export const VIEW_ONLY_BADGE = 'View only'
export const NOT_IN_CLOUD_BADGE = 'Not in cloud'

/** The Projects tab's note while its list holds a project no cloud view for this account contains (T4c, V6). */
export const NOT_IN_CLOUD_LIST_NOTE =
  'Projects marked "Not in cloud" aren\'t in your cloud account and are view only. Export any you want to keep: they leave this list when your projects next update — adding, copying or importing a project counts.'

/** Sprint History's sprint settings, beside the locked cadence and first sprint date (T5). */
export const VIEW_ONLY_LOCK_NOTE = '(View only)'

/**
 * A sprint, milestone or productivity-adjustment form closed because the
 * project it was opened for left the list (T15, V10). `name` is the name the
 * project had when the form opened.
 */
export const PROJECT_LEFT_TEXT = (name: string) =>
  `"${name}" is no longer in your list, so what you were typing wasn't saved. It may have been unshared from you or deleted.`

// Each reads the store guard's own predicates (project-access.ts), so the UI
// disables exactly what the guard refuses, and an access this file does not
// name fails closed, as the guard does.

/** Why the user may not change this project; null when they may (owner, editor, local mode). */
export function accessReason(access: ProjectAccess): string | null {
  if (canEditProject(access)) return null
  return access === 'not-in-cloud' ? NOT_IN_CLOUD_REASON : VIEW_ONLY_REASON
}

/** Why the user may not delete this project; null for its owner (and in local mode). */
export function deleteReason(access: ProjectAccess): string | null {
  if (canDeleteProject(access)) return null
  return access === 'not-in-cloud' ? NOT_IN_CLOUD_REASON : OWNER_ONLY_DELETE_REASON
}

/** The read-only banner for this project; null when it is not read only. */
export function accessBanner(access: ProjectAccess): string | null {
  if (canEditProject(access)) return null
  return access === 'not-in-cloud' ? NOT_IN_CLOUD_BANNER : VIEW_ONLY_BANNER
}

/** The Projects list's badge for this project; null when it is not read only. */
export function accessBadge(access: ProjectAccess): string | null {
  if (canEditProject(access)) return null
  return access === 'not-in-cloud' ? NOT_IN_CLOUD_BADGE : VIEW_ONLY_BADGE
}
