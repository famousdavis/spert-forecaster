// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import type { Project } from '@/shared/types'
import { focusAfterTileLeaves, resolveFocusTarget, type TileFocusTarget } from '../lib/tile-focus'

interface UseProjectDeleteArgs {
  /**
   * The tiles on screen, in order (v0.50.0: archived ones hidden unless "Show archived" is on).
   * The neighbour that takes focus after a delete comes from this list, never from every project:
   * a hidden neighbour has no tile to focus.
   */
  shown: Project[]
  /** The Projects tab's root, where the tiles are. */
  rootRef: RefObject<HTMLElement | null>
  /** The toolbar's New Project, always rendered. */
  newProjectRef: RefObject<HTMLButtonElement | null>
}

/**
 * A tile's Delete, through the "Delete Project" confirmation.
 *
 * Focus after it closes (v0.49.0; until then it fell to <body>, B44): after a delete, the next
 * shown tile's name button, else the previous shown tile's, else New Project (GanttApp, B19 GO
 * 4.7; the same rule as an Archive, `focusAfterTileLeaves`); after Cancel or Escape, that tile's
 * Delete. The move is made after the commit (the effect below), once the deleted tile is gone and
 * the dialog with it. A deleted project's tile colour and archive go with it (v0.50.0).
 */
export function useProjectDelete({ shown, rootRef, newProjectRef }: UseProjectDeleteArgs) {
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const [pending, setPending] = useState<{ projectId: string; projectName: string } | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ target: TileFocusTarget } | null>(null)

  const request = useCallback(
    (projectId: string) => {
      const project = shown.find((p) => p.id === projectId)
      setPending({ projectId, projectName: project?.name ?? 'Unknown' })
    },
    [shown],
  )

  const confirm = useCallback(() => {
    if (pending) {
      const target = focusAfterTileLeaves(shown, pending.projectId)
      if (deleteProject(pending.projectId)) {
        useSettingsStore.getState().dropProjectPref(pending.projectId)
        setFocusRequest({ target })
      } else {
        // Refused (the access dropped as they clicked): the tile stays, and focus goes back to it.
        setFocusRequest({ target: { kind: 'delete', projectId: pending.projectId } })
      }
    }
    setPending(null)
  }, [pending, shown, deleteProject])

  const cancel = useCallback(() => {
    if (pending) setFocusRequest({ target: { kind: 'delete', projectId: pending.projectId } })
    setPending(null)
  }, [pending])

  useEffect(() => {
    if (!focusRequest) return
    // Neither may exist: in cloud mode the whole tab can be replaced. Then focus nothing.
    resolveFocusTarget(rootRef.current, focusRequest.target, newProjectRef.current)?.focus()
  }, [focusRequest, rootRef, newProjectRef])

  return { pending, request, confirm, cancel }
}
