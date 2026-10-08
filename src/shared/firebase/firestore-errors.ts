// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What a failed project write tells the user (Brief 39).
//
// A write the cloud REFUSES fails with `permission-denied`. That code does not
// say why: the user may only view the project, their access may have changed,
// the document may be gone (any write to a deleted project is refused, the
// owner's included), or the write may carry a field the rules do not allow.
// So the text is chosen by the user's ACCESS when the write was issued, and
// only a non-owner is ever told about their access — an owner never is.
//
// ⚠️ Offline is not a failure here: the SDK queues writes while offline and
// sends them later. Every failure other than a refusal keeps its old text.

import type { ProjectAccess } from '@/shared/state/project-access'

/** The cloud refused the write under its rules. */
export function isPermissionDenied(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'permission-denied'
}

// Owner-approved wording (Brief 39 §7, 2026-10-08). Change it only with the owner.
export const SAVE_FAILED_TEXT = 'Failed to save changes to the cloud. Please check your connection.'
export const DELETE_FAILED_TEXT = 'Failed to delete project from the cloud.'
export const importSaveFailedText = (name: string) => `Failed to save imported project "${name}" to the cloud.`

const SAVE_REFUSED: Record<ProjectAccess, string> = {
  owner:
    "Your change wasn't saved — the cloud refused it. If this project was deleted on another device, it will leave your list.",
  editor: "Your change wasn't saved — the cloud refused it. Your access to this project may have changed.",
  viewer: "Your change wasn't saved — you can only view this project.",
  'not-in-cloud': "Your change wasn't saved — this project isn't in your cloud account.",
}

/**
 * An edit to a project no cloud view of this account contains: nothing was
 * sent (useCloudSync never creates such a project from an edit). The same
 * string as a refused save of one.
 */
export const NOT_IN_CLOUD_SAVE_TEXT = SAVE_REFUSED['not-in-cloud']

/** A brand-new project's first write, refused: it will not reach any cloud view, so it leaves the list. */
export const CREATE_REFUSED_TEXT = "Your new project wasn't saved — the cloud refused it, so it will leave your list."

const DELETE_REFUSED: Record<ProjectAccess, string> = {
  owner: 'The cloud refused to delete this project. If it was already deleted on another device, there is nothing more to do.',
  editor: "The project wasn't deleted — only its owner can delete it.",
  viewer: "The project wasn't deleted — only its owner can delete it.",
  'not-in-cloud': "This project isn't in your cloud account, so it was removed from this browser only.",
}

/** The toast for a failed save of a project that exists in the cloud, by the access the user had when they made it. */
export const saveFailureText = (err: unknown, access: ProjectAccess): string =>
  isPermissionDenied(err) ? SAVE_REFUSED[access] : SAVE_FAILED_TEXT

/**
 * The toast for a failed first write of a project (Branch A's create). With no
 * role entry the project is one this browser was creating: `owner`.
 */
export const createFailureText = (err: unknown, access: ProjectAccess): string =>
  isPermissionDenied(err) ? (access === 'owner' ? CREATE_REFUSED_TEXT : SAVE_REFUSED[access]) : SAVE_FAILED_TEXT

/** The toast for a failed project delete, by the access the user had when they made it. */
export const deleteFailureText = (err: unknown, access: ProjectAccess): string =>
  isPermissionDenied(err) ? DELETE_REFUSED[access] : DELETE_FAILED_TEXT

/**
 * The toast for a failed save of an imported project. `isCreate`: no cloud view
 * contained the project, so a refused write leaves it out of every later view.
 */
export function importSaveFailureText(err: unknown, name: string, access: ProjectAccess, isCreate: boolean): string {
  if (!isPermissionDenied(err)) return importSaveFailedText(name)
  if (isCreate) return `"${name}" wasn't saved — the cloud refused it, so it will leave your list.`
  if (access === 'owner') return `"${name}" wasn't saved — the cloud refused it, so your list keeps the version in the cloud.`
  return `"${name}" wasn't saved — the cloud refused it. Your access to this project may have changed.`
}
