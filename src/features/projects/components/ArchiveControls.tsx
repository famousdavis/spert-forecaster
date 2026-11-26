// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { ALL_ARCHIVED_CLASS } from '@/shared/components/AllArchivedNotice'
import { CHECK, CHECKBOX } from './dashboard-styles'

/**
 * "Show archived (N)" (v0.50.0): the collection's one filter row (contract §3, "Filter row"), hooked
 * `data-sf="filters"`, 16 px below the heading row (the frame's `.sf-below`) and 16 px above the grid or the
 * all-archived line (`mb-4`, which beats the tab's `space-y-6`). The caller renders it only while something is
 * archived. Until v0.53.0 (FRAME26 clean-up A) it was not hooked and sat 12 px below the row (`-mt-1`), GanttApp's
 * `.pt-filter` place, so the frame read the grid under it as 31.5 px too low.
 */
export function ShowArchivedFilter({
  id,
  count,
  checked,
  onChange,
}: {
  id: string
  count: number
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    // leading-[normal]: GanttApp's row is line-height normal (19.5 px at DPR 1); the page's 24 px line-height made it 24 (measured).
    <div className="sf-below mb-4 leading-[normal]" data-sf="filters">
      <label className={CHECK} htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name="showArchived"
          className={CHECKBOX}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        Show archived ({count})
      </label>
    </div>
  )
}

/** Where Archive and Unarchive speak: polite, visually hidden, and no role="status" (Orch-29 answer 7). */
export function ArchiveAnnouncer({ text }: { text: string }) {
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  )
}

/**
 * Every project archived and the filter off: GanttApp's line, where the grid would be. Never the
 * welcome panel, which is for no projects at all, and not a `role="note"`.
 */
export function AllArchivedLine({ count }: { count: number }) {
  return <p className={ALL_ARCHIVED_CLASS} data-sf="empty">{`All projects are archived. Select "Show archived (${count})" to see them.`}</p>
}
