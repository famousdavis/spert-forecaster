// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import type { Project } from '@/shared/types'
import { findTileControl } from '../lib/tile-focus'

interface UseProjectDeleteArgs {
  projects: Project[]
  /** The Projects tab's root, where the tiles are. */
  rootRef: RefObject<HTMLElement | null>
  /** The toolbar's New Project, always rendered. */
  newProjectRef: RefObject<HTMLButtonElement | null>
}

/** Where focus goes once the delete dialog has closed. */
type FocusTarget = { kind: 'open' | 'delete'; projectId: string } | { kind: 'new' }

/**
 * A tile's Delete, through the "Delete Project" confirmation.
 *
 * Focus after it closes (v0.49.0; until then it fell to <body>, B44): after a delete, the next
 * tile's name button, else the previous tile's, else New Project (GanttApp, B19 GO 4.7); after
 * Cancel or Escape, that tile's Delete. The move is made after the commit (the effect below),
 * once the deleted tile is gone and the dialog with it.
 */
export function useProjectDelete({ projects, rootRef, newProjectRef }: UseProjectDeleteArgs) {
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const [pending, setPending] = useState<{ projectId: string; projectName: string } | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null)

  const request = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      setPending({ projectId, projectName: project?.name ?? 'Unknown' })
    },
    [projects],
  )

  const confirm = useCallback(() => {
    if (pending) {
      const index = projects.findIndex((p) => p.id === pending.projectId)
      const neighbour = index === -1 ? undefined : (projects[index + 1] ?? projects[index - 1])
      if (deleteProject(pending.projectId)) {
        setFocusRequest({ target: neighbour ? { kind: 'open', projectId: neighbour.id } : { kind: 'new' } })
      } else {
        // Refused (the access dropped as they clicked): the tile stays, and focus goes back to it.
        setFocusRequest({ target: { kind: 'delete', projectId: pending.projectId } })
      }
    }
    setPending(null)
  }, [pending, projects, deleteProject])

  const cancel = useCallback(() => {
    if (pending) setFocusRequest({ target: { kind: 'delete', projectId: pending.projectId } })
    setPending(null)
  }, [pending])

  useEffect(() => {
    if (!focusRequest) return
    const { target } = focusRequest
    const el =
      target.kind === 'new'
        ? newProjectRef.current
        : findTileControl(rootRef.current, target.projectId, target.kind)
    // Neither may exist: in cloud mode the whole tab can be replaced. Then focus nothing.
    el?.focus()
  }, [focusRequest, rootRef, newProjectRef])

  return { pending, request, confirm, cancel }
}
