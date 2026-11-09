// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The dashboard toolbar's four icons, shared across the SPERT® apps. Copied exactly from
 * GanttApp's `ICON_PATHS` (`src/features/projects/ProjectsTab.tsx`). Change them there first,
 * never here alone.
 *
 * Kept apart from `ToolbarIcon.tsx` so that file exports a component and nothing else.
 */
export const TOOLBAR_ICON_PATHS = {
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  import: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  sample: 'M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3M7.2 15h9.6',
  plus: 'M12 5v14M5 12h14',
} as const
