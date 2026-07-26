// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo } from 'react'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import type { VelocityStats, ForecastMode, Sprint } from '@/shared/types'
import { deriveForecastInputs } from '@/shared/lib/forecast-derivations'

// getLastSprintBacklog moved to @/shared/lib/forecast-derivations with the rest
// of this hook's derivations. Re-exported so existing import sites (and its
// unit tests) keep resolving through this module.
export { getLastSprintBacklog } from '@/shared/lib/forecast-derivations'

/**
 * Form state for the forecast: backlog, velocity overrides, subjective inputs,
 * and milestone-derived values. Persisted per project via the project store.
 *
 * The derivations are a useMemo wrapper over deriveForecastInputs (v0.36.0);
 * only the setters remain hook-local. See useSprintData for why.
 *
 * The `sprints` parameter should be the *included-in-forecast* subset so that
 * excluding a sprint correctly updates the derived backlog value.
 */
export function useForecastInputs(
  calculatedStats: VelocityStats,
  includedSprintCount: number,
  sprints: Sprint[]
) {
  const selectedProject = useProjectStore(selectViewingProject)
  const setForecastInput = useProjectStore((state) => state.setForecastInput)
  const forecastInputs = useProjectStore((state) =>
    selectedProject ? state.forecastInputs[selectedProject.id] : undefined
  )

  const milestones = useMemo(
    () => selectedProject?.milestones ?? [],
    [selectedProject?.milestones]
  )

  const derived = useMemo(
    () =>
      deriveForecastInputs(
        selectedProject,
        forecastInputs,
        calculatedStats,
        includedSprintCount,
        sprints
      ),
    [selectedProject, forecastInputs, calculatedStats, includedSprintCount, sprints]
  )

  const setRemainingBacklog = (value: string) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'remainingBacklog', value)
  }
  const resetRemainingBacklogToDerived = () => {
    if (!selectedProject || derived.derivedBacklogFromIncluded === undefined) return
    setForecastInput(
      selectedProject.id,
      'remainingBacklog',
      String(derived.derivedBacklogFromIncluded)
    )
  }
  const setVelocityMean = (value: string) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'velocityMean', value)
  }
  const setVelocityStdDev = (value: string) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'velocityStdDev', value)
  }
  const setForecastMode = (mode: ForecastMode) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'forecastMode', mode)
  }
  const setVelocityEstimate = (value: string) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'velocityEstimate', value)
  }
  const setSelectedCV = (cv: number) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'selectedCV', cv)
  }
  const setVolatilityMultiplier = (multiplier: number) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'volatilityMultiplier', multiplier)
  }

  return {
    milestones,
    hasMilestones: derived.hasMilestones,
    cumulativeThresholds: derived.cumulativeThresholds,
    remainingBacklog: derived.remainingBacklog,
    lastSprintBacklog: derived.lastSprintBacklog,
    derivedBacklogFromIncluded: derived.derivedBacklogFromIncluded,
    hasBacklogDrift: derived.hasBacklogDrift,
    velocityMean: derived.velocityMean,
    velocityStdDev: derived.velocityStdDev,
    effectiveMean: derived.effectiveMean,
    effectiveStdDev: derived.effectiveStdDev,
    forecastMode: derived.forecastMode,
    velocityEstimate: derived.velocityEstimate,
    selectedCV: derived.selectedCV,
    setRemainingBacklog,
    resetRemainingBacklogToDerived,
    setVelocityMean,
    setVelocityStdDev,
    setForecastMode,
    setVelocityEstimate,
    setSelectedCV,
    volatilityMultiplier: derived.volatilityMultiplier,
    setVolatilityMultiplier,
  }
}
