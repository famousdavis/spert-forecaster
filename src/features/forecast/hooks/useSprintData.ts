// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo } from 'react'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import { deriveSprintData } from '@/shared/lib/forecast-derivations'

/**
 * Derived sprint data for the selected project.
 * Pure calculations — no mutable state, no side effects.
 *
 * A thin useMemo wrapper over deriveSprintData (v0.36.0). The derivation moved
 * to shared/lib so the staleness comparand and the snapshot builder — both of
 * which run outside React and cannot call a hook — compute these values with
 * exactly the same code the render path uses. A second copy here is precisely
 * what would let the two drift.
 */
export function useSprintData() {
  const selectedProject = useProjectStore(selectViewingProject)
  const allSprints = useProjectStore((state) => state.sprints)

  return useMemo(
    () => deriveSprintData(selectedProject, allSprints),
    [selectedProject, allSprints]
  )
}
