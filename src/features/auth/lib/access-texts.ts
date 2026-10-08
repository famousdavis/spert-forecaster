// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What the app tells a user about their access to a project, and where
// (Brief 39 §7). Owner-approved wording (2026-10-08): change it only with the owner.

/** Import preview (T6): why a conflict with a project the user can only view offers only Keep and Copy. */
export const importViewerNote = (name: string) => `You can only view "${name}", so this file can't update or replace it.`

/** Import preview (T6b): the same, for a project no cloud view for this account contains (V1). */
export const importNotInCloudNote = (name: string) =>
  `"${name}" isn't in your cloud account, so this file can't update or replace it.`

/** Import preview (T7): why an editor is not offered Replace on a name conflict. */
export const importEditorReplaceNote = (name: string) =>
  `Replace isn't offered: it would delete "${name}", and only its owner can delete it.`
