// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback } from 'react'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { useProjectStore } from '@/shared/state/project-store'
import { resolveAccess, type ProjectAccess } from '@/shared/state/project-access'

/**
 * The signed-in user's access to any project, as a function (Brief 39). It
 * re-renders its caller when the storage mode, the first-load state or any
 * role changes — a role change made by the owner while this tab is open
 * included.
 */
export function useProjectAccessOf(): (projectId: string) => ProjectAccess {
  const { mode } = useStorageMode()
  const cloudDataLoaded = useProjectStore((s) => s.cloudDataLoaded)
  const projectRoles = useProjectStore((s) => s.projectRoles)
  return useCallback(
    (projectId: string) => resolveAccess({ mode, cloudDataLoaded, entry: projectRoles[projectId] }),
    [mode, cloudDataLoaded, projectRoles],
  )
}

/** The access to one project; `owner` (no restriction) when there is none. */
export function useProjectAccess(projectId: string | undefined): ProjectAccess {
  const accessOf = useProjectAccessOf()
  return projectId === undefined ? 'owner' : accessOf(projectId)
}
