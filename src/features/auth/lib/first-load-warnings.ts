// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The two warnings shown before an action that removes this browser's copy of
// the user's cloud projects, while the first cloud load has not succeeded
// (Brief 40). Owner-approved wording: change it only with the owner.

export const EXPORT_BACKUP_LABEL = 'Export a backup'

export const SWITCH_TO_LOCAL_WARNING = {
  title: 'Switch to local storage?',
  message:
    "Switching to local storage removes this browser's copy of your cloud projects. Your projects in the cloud are not affected. Export a backup first if you want to keep this copy.",
  confirmLabel: 'Switch anyway',
  cancelLabel: 'Cancel',
} as const

export const SIGN_OUT_WARNING = {
  title: 'Sign out?',
  message:
    "Signing out removes this browser's copy of your cloud projects. Your projects in the cloud are not affected. Export a backup first if you want to keep this copy.",
  confirmLabel: 'Sign out anyway',
  cancelLabel: 'Cancel',
} as const
