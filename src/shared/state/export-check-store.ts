// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The export check's verdict, held ABOVE the tabs.
//
// Not persisted, and not in a tab: `ProjectsTab` unmounts on every tab switch,
// and the warning must stay until the user dismisses it. AppShell renders the
// one `ExportCheckWarning` from here, whichever of the three export entry
// points produced the verdict.

import { create } from 'zustand'
import { checkExportedFile, type ExportCheckItem } from './export-check'

interface ExportCheckState {
  /** null = nothing to warn about. */
  items: ExportCheckItem[] | null
  dismiss: () => void
}

export const useExportCheckStore = create<ExportCheckState>()((set) => ({
  items: null,
  dismiss: () => set({ items: null }),
}))

/**
 * Judge the file an export has ALREADY SAVED, and show (or clear) the warning.
 *
 * Call it after the download, never before: the save must not depend on it.
 * It never throws — a defect in the check is logged and leaves no warning,
 * because the file it would describe is already on disk either way. Each call
 * REPLACES the previous verdict, so a clean export clears a stale warning.
 */
export function reportExportCheck(json: string): void {
  let items: ExportCheckItem[] | null = null
  try {
    const result = checkExportedFile(json)
    items = result.ok ? null : result.items
  } catch (err) {
    console.error('[export-check] could not check the exported file:', err)
  }
  useExportCheckStore.setState({ items })
}
