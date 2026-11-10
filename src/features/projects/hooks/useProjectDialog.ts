// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import type { ProjectAccess } from '@/shared/state/project-access'
import { accessReason } from '@/features/auth/lib/access-texts'
import type { Project } from '@/shared/types'
import { findTileControl } from '../lib/tile-focus'

interface UseProjectDialogArgs {
  accessOf: (projectId: string) => ProjectAccess
  /** The Projects tab's root, where the tiles are. */
  rootRef: RefObject<HTMLElement | null>
  /** The toolbar's New Project, always rendered. */
  newProjectRef: RefObject<HTMLButtonElement | null>
}

/**
 * The New Project / Edit Project dialog's state (v0.49.0: one dialog for both, D16; until then an
 * inline form above the list). Opened by New Project, the welcome panel's "Create New Project",
 * another tab's call to action (`shouldFocusNewProjectForm`), or a tile's Edit.
 *
 * The edited project is held as it was when Edit was pressed, as the inline form held it: if it
 * leaves the list while open, the dialog stays until closed (and focus then falls back to New
 * Project).
 *
 * ⚠️ Nothing here calls focus(). The page behind the dialog is still `inert` while a submit or
 * cancel handler runs, so a browser would ignore it; the dialog returns focus as it closes,
 * through `returnFocusTo`.
 */
export function useProjectDialog({ accessOf, rootRef, newProjectRef }: UseProjectDialogArgs) {
  const addProject = useProjectStore((state) => state.addProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const shouldFocusNewProjectForm = useProjectStore((s) => s.shouldFocusNewProjectForm)
  const setShouldFocusNewProjectForm = useProjectStore((s) => s.setShouldFocusNewProjectForm)

  const [editingProject, setEditingProject] = useState<Project | null>(null)
  // Persists through the flag reset below, so the create dialog doesn't unmount mid-render.
  const [wantsToCreateNew, setWantsToCreateNew] = useState(false)

  // Tab-switch handoff: a sibling tab's empty-state CTA sets the shouldFocusNewProjectForm flag
  // and switches to this tab. v0.33.3: the in-tab "Create New Project" CTA sets the same flag,
  // and v0.48.0's New Project button does too, so every way in shares one pipeline. On render
  // with the flag set, we (1) flip wantsToCreateNew so the dialog stays mounted after we reset
  // the flag, and (2) reset it so later renders don't reopen it. The dialog itself puts focus
  // in Project Name as it opens (before v0.49.0, this effect focused the inline form's field).
  // Strict Mode double-fires this in dev; the flag reset makes the second fire a no-op.
  //
  // The gate (`open` below) includes the flag, so the dialog IS mounted, and has focused its
  // first field, by the time this effect runs.
  useEffect(() => {
    if (shouldFocusNewProjectForm) {
      // setWantsToCreateNew flips a sibling state synchronously inside an effect.
      // react-hooks/set-state-in-effect flags this as a cascading-renders smell, but
      // here the setState is a one-shot intent transition driven by an external trigger
      // (a Zustand-store flag set from outside this component), not a derivation that
      // would loop. Matches the same eslint-disable pattern adopted in v0.31.5 for
      // useForecastState's project-change reset effect.
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setWantsToCreateNew(true)
      setShouldFocusNewProjectForm(false)
    }
  }, [shouldFocusNewProjectForm, setShouldFocusNewProjectForm])

  // New Project (toolbar) and the welcome panel's "Create New Project" share this, and
  // delegate to the global flag, matching the cross-tab path. It ends any edit first, so the
  // flag always opens a create dialog. Since v0.49.0 an open dialog makes the page behind it
  // inert, so New Project cannot be pressed while an edit is open; until then, New Project
  // while editing discarded the edit (B13).
  const openNew = useCallback(() => {
    setEditingProject(null)
    setShouldFocusNewProjectForm(true)
  }, [setShouldFocusNewProjectForm])

  const openEdit = useCallback((project: Project) => setEditingProject(project), [])

  const close = useCallback(() => {
    setEditingProject(null)
    setWantsToCreateNew(false)
  }, [])

  const submit = (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingProject) {
      // Refused — the user's access dropped as they clicked, and the store said
      // so: the dialog stays open with what they typed (V2).
      if (updateProject(editingProject.id, data)) close()
    } else {
      addProject(data)
      close()
    }
  }

  // The gate (v0.49.0; the inline form's since v0.33.3): open only when asked for. A populated
  // list never keeps it open (William, 2026-11-08).
  const open = editingProject !== null || wantsToCreateNew || shouldFocusNewProjectForm
  const editId = editingProject?.id ?? null
  // After Update, Cancel, Close or Escape: an Edit dialog's focus goes to that tile's Edit, or
  // to New Project if the tile is gone; a create dialog's, to New Project, whatever opened it
  // (B11): the welcome panel's button is gone after Add, and another tab's button unmounted with
  // the tab switch. Either may be null (in cloud mode the whole tab can be replaced): then nothing.
  const returnFocusTo = () =>
    (editId !== null ? findTileControl(rootRef.current, editId, 'edit') : null) ?? newProjectRef.current

  return {
    open,
    editingProject,
    /** 'new', or the edited project's id prefixed, so no project id can read as 'new'. */
    identity: editId === null ? 'new' : `edit:${editId}`,
    readOnlyReason: editingProject ? accessReason(accessOf(editingProject.id)) : null,
    returnFocusTo,
    openNew,
    openEdit,
    close,
    submit,
  }
}
