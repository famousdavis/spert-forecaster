// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/state/project-store'
import { PROJECT_LEFT_TEXT } from '@/features/auth/lib/access-texts'

/** An open add/edit form, tied to the project it was opened for (Brief 39, V10). */
export interface BoundForm<T> {
  projectId: string
  projectName: string
  /** The item being edited; null for an add form. */
  item: T | null
}

const projectIsListed = (projectId: string) =>
  useProjectStore.getState().projects.some((p) => p.id === projectId)

/**
 * Which add/edit form is open, tied to the project it was opened for (Brief 39,
 * V10). Sprint History's sprint form and Forecast's milestone and productivity
 * adjustment forms each keep one.
 *
 * - The form shows only while its project is in the list AND is the project on
 *   screen. When that project leaves the list (unshared, deleted), or the user
 *   picks another project, the form closes and nothing in it is saved. Before
 *   v0.47.0 it stayed open, now showing the project on screen, and saved there.
 * - When a form closes by any route while its project is gone, T15 says so, once.
 * - `targetId()` is the id every write from the form uses: the project the form
 *   was opened for, never the one on screen. It is null when that project is
 *   gone: write nothing — the close and T15 follow on the next render.
 */
export function useProjectBoundForm<T>(shownProjectId: string | undefined) {
  const projects = useProjectStore((s) => s.projects)
  const [form, setForm] = useState<BoundForm<T> | null>(null)

  // Adjusted during render — React's pattern for state that follows other state
  // ("Adjusting some state when a prop changes", react.dev): no effect sets
  // state, and no frame shows the form against another project.
  if (form !== null && (form.projectId !== shownProjectId || !projects.some((p) => p.id === form.projectId))) {
    setForm(null)
  }

  // Runs when this form closes or is replaced, and when the component unmounts
  // (ForecastTab drops the panels altogether once the list is empty). It sets
  // no state: it only says why a form vanished, when its project is gone.
  useEffect(() => {
    if (form === null) return undefined
    return () => {
      if (!projectIsListed(form.projectId)) toast.error(PROJECT_LEFT_TEXT(form.projectName))
    }
  }, [form])

  const open = useCallback(
    (project: { id: string; name: string }, item: T | null) =>
      setForm({ projectId: project.id, projectName: project.name, item }),
    [],
  )
  const close = useCallback(() => setForm(null), [])
  const targetId = useCallback(
    (): string | null => (form !== null && projectIsListed(form.projectId) ? form.projectId : null),
    [form],
  )

  return { form, open, close, targetId }
}
