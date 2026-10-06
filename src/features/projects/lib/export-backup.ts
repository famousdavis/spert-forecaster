// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { toast } from 'sonner'
import { useProjectStore } from '@/shared/state/project-store'
import { reportExportCheck } from '@/shared/state/export-check-store'
import { today } from '@/shared/lib/dates'
import { downloadJson } from './export-project'

/**
 * The workspace export, as one helper: the Projects tab's Export button, and
 * "Export a backup" in the cloud loading panel and in the warnings before a
 * switch to local storage or a sign-out while the first cloud load has not
 * succeeded (Brief 40). It exports the store's current copy — before the first
 * load, this browser's persisted copy — and touches nothing in the cloud.
 */
export function exportWorkspaceBackup(): void {
  const json = downloadJson(`spert-forecaster-${today()}.json`, useProjectStore.getState().exportData())
  toast.success('Project data exported')
  // After the save, never before it: the check cannot block or undo the file.
  reportExportCheck(json)
}
