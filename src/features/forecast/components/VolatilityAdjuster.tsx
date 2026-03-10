// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import { VOLATILITY_OPTIONS, roundRange } from '../constants'

interface VolatilityAdjusterProps {
  calculatedStdDev: number
  effectiveMean: number
  selectedMultiplier: number
  onMultiplierChange: (multiplier: number) => void
}

export function VolatilityAdjuster({
  calculatedStdDev,
  effectiveMean,
  selectedMultiplier,
  onMultiplierChange,
}: VolatilityAdjusterProps) {
  return (
    <div className="mt-5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
      <div className="flex-1 min-w-[300px]">
        <p className="text-xs font-semibold text-spert-text-secondary dark:text-gray-300 mb-1.5">
          How volatile will your team be going forward?
        </p>
        <div className="inline-grid grid-cols-4 gap-1.5">
          {VOLATILITY_OPTIONS.map(({ label, multiplier }) => {
            const isSelected = multiplier === selectedMultiplier
            const adjustedSD = calculatedStdDev * multiplier
            let rangeText = ''
            if (effectiveMean > 0) {
              const cv = adjustedSD / effectiveMean
              const { displayLower, displayUpper } = roundRange(effectiveMean, cv)
              rangeText = ` (${displayLower}\u2013${displayUpper})`
            }

            return (
              <label
                key={multiplier}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors duration-100 whitespace-nowrap',
                  isSelected
                    ? 'bg-amber-100 dark:bg-amber-900/30 border border-amber-500'
                    : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <input
                  type="radio"
                  name="volatility-selection"
                  checked={isSelected}
                  onChange={() => onMultiplierChange(multiplier)}
                  className="accent-amber-500"
                />
                <span className={cn(
                  'font-medium',
                  isSelected ? 'text-amber-700 dark:text-amber-400' : 'text-spert-text dark:text-gray-300'
                )}>
                  {label}
                </span>
                {rangeText && (
                  <span className="text-spert-text-muted dark:text-gray-500 whitespace-nowrap">
                    {rangeText}
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <p className="text-xs text-spert-text-muted dark:text-gray-500 mt-2">
          Based on your team&apos;s historical std dev of {calculatedStdDev.toFixed(1)}
        </p>
      </div>
    </div>
  )
}
