// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useExportCheckStore } from '@/shared/state/export-check-store'
import { displayName } from '@/shared/state/refusal-reasons'
import type { ExportCheckItem } from '@/shared/state/export-check'

/**
 * Shown after an export whose file will not import again. The file is already
 * saved. It stays until Dismiss — no timer — and the next export replaces it.
 */
export function ExportCheckWarning() {
  const items = useExportCheckStore((s) => s.items)
  const dismiss = useExportCheckStore((s) => s.dismiss)
  if (!items) return null

  return (
    // An app-wide notice in the frame's slot (FRAME26, v0.52.0): exports from the toolbar, a tile and Settings raise
    // it, and it outlives the tab that raised it. `.sf-notice--caution` gives the box and the text colours; "Dismiss"
    // is the frame's dismiss button, its wording kept.
    <div role="alert" className="sf-notice sf-notice--caution">
      <div className="space-y-2">
        <p>
          <strong>Your file was saved, but it will not restore.</strong>
        </p>
        <p>
          Importing is all-or-nothing, so the whole file — every project in it — will be refused
          until these are fixed:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          {items.map((item, k) => (
            <li key={k}>
              <ItemText item={item} />
            </li>
          ))}
        </ul>
        <p>
          Fix the named field in each project. If you can&apos;t edit a project, ask its owner. To
          back up your other projects now, select them in <strong>Settings → Export Projects</strong>.
        </p>
      </div>
      <button type="button" onClick={dismiss} className="sf-notice-dismiss">
        Dismiss
      </button>
    </div>
  )
}

function ItemText({ item }: { item: ExportCheckItem }) {
  if (item.kind === 'file') {
    return (
      <>
        <strong>The file as a whole</strong> — {item.reason}.
      </>
    )
  }
  const name = item.sprintCount === undefined
    ? displayName(item.name)
    : `${displayName(item.name)} · ${item.sprintCount} sprint${item.sprintCount === 1 ? '' : 's'}`
  return (
    <>
      <strong title={item.name}>{name}</strong>
      {item.sprintNumber === undefined ? '' : `, sprint ${item.sprintNumber}`} — {item.reason}.
    </>
  )
}
