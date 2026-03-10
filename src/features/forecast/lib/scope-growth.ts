// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Resolve the effective scope growth per sprint from UI state.
 *
 * Centralises the logic that was previously duplicated as inline IIFEs in
 * useForecastState (forecast run + CSV export) and ForecastTab (burn-up prop).
 */
export function resolveScopeGrowthPerSprint(
  modelScopeGrowth: boolean,
  scopeGrowthMode: 'calculated' | 'custom',
  customScopeGrowth: string,
  averageScopeInjection: number | undefined
): number | undefined {
  if (!modelScopeGrowth) return undefined
  if (scopeGrowthMode === 'custom') {
    const parsed = parseFloat(customScopeGrowth)
    return isNaN(parsed) ? undefined : parsed
  }
  return averageScopeInjection
}
