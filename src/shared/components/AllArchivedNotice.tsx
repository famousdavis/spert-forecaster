// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

/** GanttApp's all-archived look (`.pt-empty`): the meta colour, italic, line-height normal. Also the Projects tab's line. */
export const ALL_ARCHIVED_CLASS = 'leading-[normal] text-[#666] dark:text-[#a0aec0] italic'

/** GanttApp's text (`ReleasesTab.tsx:22` at d437e84). */
export const ALL_ARCHIVED_ELSEWHERE_TEXT = 'All projects are archived. Unarchive one on the Projects tab to see it here.'

/**
 * What Sprint History and Forecast show when every project is archived (v0.50.0, D30). With no
 * projects at all, each tab keeps its own empty state.
 */
export function AllArchivedNotice() {
  return <p className={ALL_ARCHIVED_CLASS}>{ALL_ARCHIVED_ELSEWHERE_TEXT}</p>
}
