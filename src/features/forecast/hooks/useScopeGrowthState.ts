// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useCallback } from 'react'
import { resolveScopeGrowthPerSprint } from '../lib/scope-growth'

/**
 * Manages scope growth modeling state and resolution.
 *
 * Extracted from useForecastState to isolate this independent concern.
 * State is session-only (not persisted) and resets when the project changes.
 */
export function useScopeGrowthState(averageScopeInjection: number | undefined) {
  const [modelScopeGrowth, setModelScopeGrowth] = useState(false)
  const [scopeGrowthMode, setScopeGrowthMode] = useState<'calculated' | 'custom'>('calculated')
  const [customScopeGrowth, setCustomScopeGrowth] = useState('')

  /** Resolved value ready for the simulation engine */
  const scopeGrowthPerSprint = resolveScopeGrowthPerSprint(
    modelScopeGrowth, scopeGrowthMode, customScopeGrowth, averageScopeInjection
  )

  /** Reset to defaults (called on project change) */
  const resetScopeGrowth = useCallback(() => {
    setScopeGrowthMode('calculated')
    setCustomScopeGrowth('')
  }, [])

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
