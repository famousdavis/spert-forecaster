// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { reportExportCheck } from '@/shared/state/export-check-store'
import { getWorkspaceId, getStorageMode } from '@/shared/state/storage'
import { auth } from '@/shared/firebase/config'
import type { Project } from '@/shared/types'
import { exportSingleProject } from '../lib/export-project'

/**
 * A tile's Clone and Export, each with its toast (moved out of ProjectsTab.tsx unchanged in
 * v0.49.0). Export also hands the file to the export check (`reportExportCheck`). Clone copies
 * the source's tile colour to the copy (v0.50.0); exported files carry neither colour nor
 * archive (D29).
 */
export function useProjectTileActions() {
  const projects = useProjectStore((state) => state.projects)
  const sprints = useProjectStore((state) => state.sprints)
  const cloneProject = useProjectStore((state) => state.cloneProject)
  const originRef = useProjectStore((state) => state._originRef)
  const changeLog = useProjectStore((state) => state._changeLog)

  const clone = useCallback(
    (project: Project) => {
      const newId = cloneProject(project.id)
      if (newId) {
        // v0.50.0: a clone takes this person's tile colour, never the archive.
        useSettingsStore.getState().copyProjectColor(project.id, newId)
        toast.success(`Cloned: ${project.name}`)
      } else {
        toast.error('Clone failed: project not found')
      }
    },
    [cloneProject],
  )

  const exportProject = useCallback(
    (projectId: string) => {
      try {
        const settings = useSettingsStore.getState()
        const storageRef =
          (getStorageMode() === 'cloud' && auth?.currentUser?.uid) || getWorkspaceId()
        const { json } = exportSingleProject(projectId, {
          projects,
          sprints,
          originRef: originRef || getWorkspaceId(),
          storageRef,
          changeLog,
          exportedBy: settings.exportName || undefined,
          exportedById: settings.exportId || undefined,
        })
        toast.success('Project exported')
        reportExportCheck(json)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Export failed: ${message}`)
      }
    },
    [projects, sprints, originRef, changeLog],
  )

  return { clone, exportProject }
}
