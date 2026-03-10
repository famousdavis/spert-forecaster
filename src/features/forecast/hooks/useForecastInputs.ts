// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo } from 'react'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import type { VelocityStats, ForecastMode, Sprint } from '@/shared/types'
import { DEFAULT_CV, DEFAULT_VOLATILITY_MULTIPLIER, MIN_SPRINTS_FOR_HISTORY } from '../constants'

/**
 * Form state for the forecast: backlog, velocity overrides, subjective inputs,
 * and milestone-derived values. Persisted per project via the project store.
 */
export function useForecastInputs(calculatedStats: VelocityStats, includedSprintCount: number, sprints: Sprint[]) {
  const selectedProject = useProjectStore(selectViewingProject)
  const setForecastInput = useProjectStore((state) => state.setForecastInput)
  const forecastInputs = useProjectStore((state) =>
    selectedProject ? state.forecastInputs[selectedProject.id] : undefined
  )

  // Milestones
  const milestones = useMemo(
    () => selectedProject?.milestones ?? [],
    [selectedProject?.milestones]
  )

  const hasMilestones = milestones.length > 0

  const cumulativeThresholds = useMemo(() => {
    let cumulative = 0
    return milestones.map((m) => {
      cumulative += m.backlogSize
      return cumulative
    })
  }, [milestones])

  // Form values — pre-fill backlog from last sprint when user hasn't entered a value
  const lastSprintBacklog = sprints.length > 0 ? sprints[sprints.length - 1].backlogAtSprintEnd : undefined
  const storedBacklog = forecastInputs?.remainingBacklog
  const remainingBacklog = storedBacklog || (lastSprintBacklog !== undefined ? String(lastSprintBacklog) : '')
  const velocityMean = forecastInputs?.velocityMean ?? ''
  const velocityStdDev = forecastInputs?.velocityStdDev ?? ''

  // Subjective mode inputs
  const forecastMode = forecastInputs?.forecastMode as ForecastMode | undefined
  const velocityEstimate = forecastInputs?.velocityEstimate ?? ''
  const selectedCV = forecastInputs?.selectedCV ?? DEFAULT_CV

  // History mode volatility adjustment
  const volatilityMultiplier = forecastInputs?.volatilityMultiplier ?? DEFAULT_VOLATILITY_MULTIPLIER

  const setRemainingBacklog = (value: string) => {
    if (selectedProject) setForecastInput(selectedProject.id, 'remainingBacklog', value)
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

  // Resolve effective forecast mode: stored value or auto-detect from sprint count
  const canUseHistory = includedSprintCount >= MIN_SPRINTS_FOR_HISTORY
  const resolvedMode: ForecastMode = forecastMode
    ? forecastMode
    : (canUseHistory ? 'history' : 'subjective')

  // Effective values depend on forecast mode
  // In subjective mode: derived entirely from velocity estimate + CV (no fallthrough to calc stats)
  // In history mode: use calculated stats, manual overrides, or volatility multiplier
  const velocityEstimateNum = Number(velocityEstimate) || 0

  // In subjective mode, prefer the user's estimate; fall back to calculated mean if available
  const subjectiveMean = velocityEstimateNum > 0
    ? velocityEstimateNum
    : calculatedStats.mean                                       // pre-seed from history if available

  const effectiveMean = velocityMean
    ? Number(velocityMean)
    : resolvedMode === 'subjective'
      ? subjectiveMean
      : calculatedStats.mean

  const effectiveStdDev = velocityStdDev
    ? Number(velocityStdDev)
    : resolvedMode === 'subjective'
      ? subjectiveMean * selectedCV
      : calculatedStats.standardDeviation * volatilityMultiplier

  return {
    milestones,
    hasMilestones,
    cumulativeThresholds,
    remainingBacklog,
    lastSprintBacklog,
    velocityMean,
    velocityStdDev,
    effectiveMean,
    effectiveStdDev,
    forecastMode,
    velocityEstimate,
    selectedCV,
    setRemainingBacklog,
    setVelocityMean,
    setVelocityStdDev,
    setForecastMode,
    setVelocityEstimate,
    setSelectedCV,
    volatilityMultiplier,
    setVolatilityMultiplier,
  }
}
