// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import type { ForecastMode } from '@/shared/types'

interface ForecastModeToggleProps {
  mode: ForecastMode
  onModeChange: (mode: ForecastMode) => void
  includedSprintCount: number
  calculatedStdDev: number
}

export function ForecastModeToggle({
  mode,
  onModeChange,
  includedSprintCount,
  calculatedStdDev,
}: ForecastModeToggleProps) {
  // Need 2+ sprints AND non-zero SD (identical velocities → SD=0 → false certainty)
  const canSelectHistory = includedSprintCount >= 2 && calculatedStdDev > 0

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-medium text-spert-text-muted">Mode:</span>
      <div className="inline-flex rounded-full border border-spert-border dark:border-gray-600 overflow-hidden">
        <button
          type="button"
          onClick={() => onModeChange('history')}
          disabled={!canSelectHistory}
          title={
            canSelectHistory
              ? 'Forecast from sprint history'
              : includedSprintCount < 2
                ? 'Need 2+ sprints for history mode'
                : 'Sprints have identical velocity — use Subjective mode to express uncertainty'
          }
          className={cn(
            'px-3 py-1 text-xs font-medium transition-colors duration-150',
            mode === 'history'
              ? 'bg-spert-blue text-white'
              : canSelectHistory
                ? 'bg-transparent text-spert-text-muted dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                : 'bg-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
          )}
        >
          History
        </button>
        <button
          type="button"
          onClick={() => onModeChange('subjective')}
          className={cn(
            'px-3 py-1 text-xs font-medium transition-colors duration-150',
            mode === 'subjective'
              ? 'bg-spert-blue text-white'
              : 'bg-transparent text-spert-text-muted dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          )}
        >
          Subjective
        </button>
      </div>
    </div>
  )
}
