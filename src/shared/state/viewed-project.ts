// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The project Sprint History, Forecast and Connect AI show (v0.50.0, D30): `viewingProjectId` if
// that project is unarchived, else the first unarchived project, else none. Derived, never
// written back: `viewingProjectId` itself is not rewritten (GanttApp `pages/index.tsx:80-86`), so
// unarchiving a project brings its selection back.
//
// ⚠️ It reads TWO stores: the projects and the selection from the project store, and this
// person's archive map from the settings store. A `useProjectStore` selector that read
// `useSettingsStore.getState()` inside would not re-render when the map changed, and Connect AI
// is always mounted. So there is one plain resolver for the getState() readers, and one hook that
// subscribes to both stores for the hook readers. Every reader gets the same answer.

import { useCallback, useMemo } from 'react'
import type { Project } from '@/shared/types'
import { shownProjects, type ProjectPrefs } from '@/shared/lib/project-prefs'
import { useProjectStore, selectViewingProjectIgnoringArchive, type ProjectState } from './project-store'
import { useSettingsStore } from './settings-store'

/** The viewed project, archive-aware: the project store's rule applied to the unarchived projects. */
export function resolveViewedProject(
  state: Pick<ProjectState, 'projects' | 'viewingProjectId'>,
  prefs: ProjectPrefs,
): Project | undefined {
  return selectViewingProjectIgnoringArchive({
    projects: shownProjects(state.projects, prefs, false),
    viewingProjectId: state.viewingProjectId,
  })
}

/** The viewed project now, for code outside React's render (timers, callbacks). */
export function getViewedProject(): Project | undefined {
  return resolveViewedProject(useProjectStore.getState(), useSettingsStore.getState().projectPrefs)
}

/**
 * The viewed project, re-rendering when the projects, the selection OR the archive map change.
 * The selector returns one element of `state.projects` (never a new object), so Zustand 5's
 * snapshot stays stable between calls.
 */
export function useViewedProject(): Project | undefined {
  const prefs = useSettingsStore((state) => state.projectPrefs)
  const select = useCallback((state: ProjectState) => resolveViewedProject(state, prefs), [prefs])
  return useProjectStore(select)
}

/**
 * The projects the Sprint History and Forecast pickers list: every unarchived one, in order.
 * ⚠️ Derived in useMemo, never in a selector: a Zustand 5 selector returning a new array on every
 * call throws "Maximum update depth exceeded".
 */
export function useUnarchivedProjects(): Project[] {
  const projects = useProjectStore((state) => state.projects)
  const prefs = useSettingsStore((state) => state.projectPrefs)
  return useMemo(() => shownProjects(projects, prefs, false), [projects, prefs])
}
