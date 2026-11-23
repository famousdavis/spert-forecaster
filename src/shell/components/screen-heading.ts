// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { TabId } from './TabNavigation'

const TAB_NAMES = { 'sprint-history': 'Sprint History', forecast: 'Forecast' } as const

/**
 * The `h1` of Sprint History and Forecast (FRAME26 OP2, v0.52.0): the name of the project their pickers show, so the
 * heading always equals the picker's value. With no project to name (none yet, every one archived, before hydration,
 * or the first cloud load still pending) it is the tab's own name. Never empty: a blank name falls back too.
 */
export function projectViewHeading(tab: Extract<TabId, 'sprint-history' | 'forecast'>, projectName: string | undefined): string {
  return projectName?.trim() ? projectName : TAB_NAMES[tab]
}
