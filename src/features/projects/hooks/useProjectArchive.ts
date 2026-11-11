// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/shared/state/settings-store'
import { isProjectArchived, shownProjects, type ProjectColor } from '@/shared/lib/project-prefs'
import type { Project } from '@/shared/types'
import { focusAfterTileLeaves, resolveFocusTarget, type TileFocusTarget } from '../lib/tile-focus'

interface UseProjectArchiveArgs {
  /** Every project, in order. */
  projects: Project[]
  /** The Projects tab's root, where the tiles are. */
  rootRef: RefObject<HTMLElement | null>
  /** The toolbar's New Project, always rendered. */
  newProjectRef: RefObject<HTMLButtonElement | null>
  /** Opens Sprint History for a project (the tab's navigation). */
  onViewHistory?: (projectId: string) => void
  /** A dialog has taken over the tab: the colour popover closes and does not come back with it. */
  dialogOpen: boolean
}

/**
 * Archive, "Show archived (N)" and tile colour on the Projects tab (v0.50.0), GanttApp's
 * (`ProjectsTab.tsx` at d437e84, `:218-255`, `:359-395`):
 * - "Show archived (N)" is shown when N > 0, off by default, not saved, and off again when N
 *   returns to 0. Counts come from the projects, never from the map.
 * - Focus after Archive with the filter off: the next shown tile's name button, else the
 *   previous, else New Project (the delete's rule); with the filter on, that tile's Unarchive.
 *   After Unarchive: that tile's Archive.
 * - Archive and Unarchive speak through the tab's polite live region (`status`). A click on an
 *   archived tile unarchives it and opens Sprint History, which leaves the tab, so it says so in
 *   a toast (D30).
 */
export function useProjectArchive({ projects, rootRef, newProjectRef, onViewHistory, dialogOpen }: UseProjectArchiveArgs) {
  const prefs = useSettingsStore((state) => state.projectPrefs)
  const setProjectArchived = useSettingsStore((state) => state.setProjectArchived)
  const setProjectColor = useSettingsStore((state) => state.setProjectColor)
  const [showArchived, setShowArchived] = useState(false)
  const [colorOpenFor, setColorOpenFor] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [focusRequest, setFocusRequest] = useState<{ target: TileFocusTarget } | null>(null)

  const archivedCount = useMemo(() => projects.filter((p) => isProjectArchived(prefs, p.id)).length, [projects, prefs])
  // GanttApp's rule (`:252`): off again once the last archived project is back. A guarded update
  // during render (React's "storing information from previous renders"); it runs at most once.
  if (showArchived && archivedCount === 0) setShowArchived(false)
  // What this person sees. Reordering, focus and counts on this tab read this list; a save always
  // gets the full one.
  const shown = useMemo(() => shownProjects(projects, prefs, showArchived), [projects, prefs, showArchived])
  // A dialog has taken over, or the tile has gone: the popover must not come back with it.
  if (colorOpenFor !== null && (dialogOpen || !shown.some((p) => p.id === colorOpenFor))) setColorOpenFor(null)

  useEffect(() => {
    if (!focusRequest) return
    resolveFocusTarget(rootRef.current, focusRequest.target, newProjectRef.current)?.focus()
  }, [focusRequest, rootRef, newProjectRef])

  const archive = useCallback(
    (project: Project) => {
      if (!setProjectArchived(project.id, true)) return
      setColorOpenFor(null)
      if (showArchived) {
        setFocusRequest({ target: { kind: 'named', projectId: project.id, name: `Unarchive ${project.name}` } })
        setStatus(`Archived "${project.name}".`)
        return
      }
      setFocusRequest({ target: focusAfterTileLeaves(shown, project.id) })
      setStatus(`Archived "${project.name}". Show archived (${archivedCount + 1}) lists it.`)
    },
    [setProjectArchived, showArchived, shown, archivedCount],
  )

  const unarchive = useCallback(
    (project: Project) => {
      if (!setProjectArchived(project.id, false)) return
      setFocusRequest({ target: { kind: 'named', projectId: project.id, name: `Archive ${project.name}` } })
      setStatus(`Unarchived "${project.name}".`)
    },
    [setProjectArchived],
  )

  /** A tile's click: an archived project is unarchived first (D30), then Sprint History opens. */
  const openProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (project && isProjectArchived(prefs, projectId)) {
        if (!setProjectArchived(projectId, false)) return
        toast.success(`Unarchived "${project.name}" and opened its sprint history.`)
      }
      onViewHistory?.(projectId)
    },
    [projects, prefs, setProjectArchived, onViewHistory],
  )

  const pickColor = useCallback(
    (projectId: string, color: ProjectColor | null) => setProjectColor(projectId, color),
    [setProjectColor],
  )

  const setColorOpen = useCallback((projectId: string, open: boolean) => {
    setColorOpenFor((current) => (open ? projectId : current === projectId ? null : current))
  }, [])

  return {
    prefs,
    showArchived,
    setShowArchived,
    archivedCount,
    shown,
    status,
    colorOpenFor,
    setColorOpen,
    pickColor,
    archive,
    unarchive,
    openProject,
  }
}
