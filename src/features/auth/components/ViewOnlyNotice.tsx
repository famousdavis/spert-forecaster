// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { ProjectAccess } from '@/shared/state/project-access'
import { accessBanner } from '../lib/access-texts'

/**
 * The note at the top of Sprint History and Forecast while the project shown
 * is read only (Brief 39 PR B, T1/T1b): the user can only view it, or no cloud
 * view for this account contains it. Nothing for an owner, an editor, or local
 * mode.
 */
export function ViewOnlyNotice({ access }: { access: ProjectAccess }) {
  const text = accessBanner(access)
  if (text === null) return null
  return (
    <div
      role="note"
      className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-spert-text dark:text-gray-100"
    >
      {text}
    </div>
  )
}
