// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo } from 'react'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import { calculateVelocityStats, calculateScopeChangeStats } from '../lib/statistics'
import { today, calculateSprintStartDate } from '@/shared/lib/dates'
import { MIN_SPRINTS_FOR_BOOTSTRAP } from '../constants'

/**
 * Derived sprint data for the selected project.
 * Pure calculations — no mutable state, no side effects.
 */
export function useSprintData() {
  const selectedProject = useProjectStore(selectViewingProject)
  const allSprints = useProjectStore((state) => state.sprints)

  const projectSprints = useMemo(
    () => selectedProject
      ? allSprints.filter((s) => s.projectId === selectedProject.id)
      : [],
    [allSprints, selectedProject]
  )

  const includedSprints = useMemo(
    () => projectSprints.filter((s) => s.includedInForecast),
    [projectSprints]
  )

  const calculatedStats = useMemo(
    () => calculateVelocityStats(includedSprints),
    [includedSprints]
  )

  const scopeChangeStats = useMemo(
    () => calculateScopeChangeStats(projectSprints),
    [projectSprints]
  )

  const completedSprintCount = useMemo(() => {
    if (projectSprints.length === 0) return 0
    return Math.max(...projectSprints.map((s) => s.sprintNumber))
  }, [projectSprints])

  const forecastStartDate = useMemo(() => {
    if (!selectedProject?.firstSprintStartDate || !selectedProject?.sprintCadenceWeeks) return today()
    if (projectSprints.length === 0) return today()

    return calculateSprintStartDate(
      selectedProject.firstSprintStartDate,
      completedSprintCount + 1,
      selectedProject.sprintCadenceWeeks
    )
  }, [selectedProject, projectSprints, completedSprintCount])

  const canUseBootstrap = includedSprints.length >= MIN_SPRINTS_FOR_BOOTSTRAP

  const historicalVelocities = useMemo(
    () => includedSprints.map((s) => s.doneValue),
    [includedSprints]
  )

  return {
    projectSprints,
    includedSprints,
    includedSprintCount: includedSprints.length,
    calculatedStats,
    scopeChangeStats,
    completedSprintCount,
    forecastStartDate,
    canUseBootstrap,
    historicalVelocities,
  }
}
