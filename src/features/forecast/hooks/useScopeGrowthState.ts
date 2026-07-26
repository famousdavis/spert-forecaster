// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback } from 'react'
import { resolveScopeGrowthPerSprint } from '@/shared/lib/forecast-derivations'
import { useForecastResultsStore, VIEW_STATE_LITERAL_SEEDS } from '@/shared/state/forecast-results-store'

/**
 * Scope growth modeling state and resolution.
 *
 * The three cells moved into the forecast-results store's per-project view
 * state in v0.36.0 (they feed the run config, so the snapshot builder must
 * reach them from outside React). Per-project keying replaces the
 * project-change reset effect that used to clear them.
 *
 * BEHAVIOR CHANGE, accepted and reviewed: resetScopeGrowth used to reset
 * scopeGrowthMode and customScopeGrowth but NOT modelScopeGrowth, so that
 * toggle survived a project switch. Under per-project keying each project
 * keeps its own toggle instead.
 */
export function useScopeGrowthState(
  projectId: string | undefined,
  averageScopeInjection: number | undefined
) {
  const view = useForecastResultsStore((s) => (projectId ? s.viewState[projectId] : undefined))
  const patchViewState = useForecastResultsStore((s) => s.patchViewState)

  const modelScopeGrowth = view?.modelScopeGrowth ?? VIEW_STATE_LITERAL_SEEDS.modelScopeGrowth
  const scopeGrowthMode = view?.scopeGrowthMode ?? VIEW_STATE_LITERAL_SEEDS.scopeGrowthMode
  const customScopeGrowth = view?.customScopeGrowth ?? VIEW_STATE_LITERAL_SEEDS.customScopeGrowth

  const setModelScopeGrowth = useCallback(
    (value: boolean) => {
      if (projectId) patchViewState(projectId, { modelScopeGrowth: value })
    },
    [projectId, patchViewState]
  )
  const setScopeGrowthMode = useCallback(
    (value: 'calculated' | 'custom') => {
      if (projectId) patchViewState(projectId, { scopeGrowthMode: value })
    },
    [projectId, patchViewState]
  )
  const setCustomScopeGrowth = useCallback(
    (value: string) => {
      if (projectId) patchViewState(projectId, { customScopeGrowth: value })
    },
    [projectId, patchViewState]
  )

  /** Resolved value ready for the simulation engine. */
  const scopeGrowthPerSprint = resolveScopeGrowthPerSprint(
    modelScopeGrowth,
    scopeGrowthMode,
    customScopeGrowth,
    averageScopeInjection
  )

  /**
   * Retained for the ScopeGrowthSection "reset" affordance. Project switches
   * no longer need it — per-project keying handles that — so it resets only
   * the current project's cells.
   */
  const resetScopeGrowth = useCallback(() => {
    if (projectId) {
      patchViewState(projectId, { scopeGrowthMode: 'calculated', customScopeGrowth: '' })
    }
  }, [projectId, patchViewState])

  return {
    modelScopeGrowth,
    setModelScopeGrowth,
    scopeGrowthMode,
    setScopeGrowthMode,
    customScopeGrowth,
    setCustomScopeGrowth,
    scopeGrowthPerSprint,
    resetScopeGrowth,
  }
}
