// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import { CV_OPTIONS, roundRange } from '../constants'

interface SubjectiveInputsProps {
  velocityEstimate: string
  selectedCV: number
  onVelocityEstimateChange: (value: string) => void
  onCVChange: (cv: number) => void
  unitOfMeasure: string
  calculatedMean?: number
  includedSprintCount?: number
}

export function SubjectiveInputs({
  velocityEstimate,
  selectedCV,
  onVelocityEstimateChange,
  onCVChange,
  unitOfMeasure,
  calculatedMean = 0,
  includedSprintCount = 0,
}: SubjectiveInputsProps) {
  // Use estimate if provided, otherwise fall back to calculated mean for range previews
  const estimateNum = Number(velocityEstimate) || calculatedMean

  // Divergence warning: fires when user's estimate is far from the historical mean.
  // Gated on meaningful history (2+ included sprints with a nonzero calculated mean).
  const rawEstimate = Number(velocityEstimate)
  const hasMeaningfulHistory = includedSprintCount >= 2 && calculatedMean > 0
  const showDivergenceWarning =
    hasMeaningfulHistory && rawEstimate > 0 && (rawEstimate > calculatedMean * 2 || rawEstimate < calculatedMean * 0.5)
  const divergenceDirection = rawEstimate > calculatedMean ? 'above' : 'below'

  return (
    <div className="mt-3 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3">
      <div className="flex items-start gap-4 flex-wrap">
        {/* Velocity estimate input */}
        <div className="flex-[0_0_200px]">
          <label htmlFor="velocityEstimate" className="block text-xs font-semibold text-spert-text-secondary dark:text-gray-300 mb-1">
            Estimated Velocity <span className="text-spert-error">*</span>
            <span className="block text-xs font-normal italic text-spert-text-muted">{unitOfMeasure} per sprint</span>
          </label>
          <input
            id="velocityEstimate"
            type="number"
            min="0"
            max="999999"
            step="any"
            value={velocityEstimate}
            onChange={(e) => onVelocityEstimateChange(e.target.value)}
            className={cn(
              'p-2 text-[0.9rem] rounded w-full dark:text-gray-100',
              velocityEstimate
                ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-blue-900/30'
            )}
            placeholder={calculatedMean > 0 ? `Calc: ${calculatedMean.toFixed(1)}` : 'e.g. 30'}
          />
          {showDivergenceWarning && (
            <p className="mt-1 text-xs text-spert-warning-dark dark:text-yellow-400">
              Your estimate ({rawEstimate.toFixed(0)}) is significantly {divergenceDirection} the historical average ({calculatedMean.toFixed(1)}). Verify this is intentional.
            </p>
          )}
        </div>

        {/* CV radio buttons */}
        <div className="flex-1 min-w-[300px]">
          <p className="text-xs font-semibold text-spert-text-secondary dark:text-gray-300 mb-1.5">
            How predictable is the team?
          </p>
          <div className="inline-grid grid-cols-3 gap-1.5">
            {CV_OPTIONS.map(({ label, cv }) => {
              const isSelected = cv === selectedCV
              let rangeText = ''
              if (estimateNum > 0) {
                const { displayLower, displayUpper } = roundRange(estimateNum, cv)
                rangeText = ` (${displayLower}–${displayUpper})`
              }

              return (
                <label
                  key={cv}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors duration-100 whitespace-nowrap',
                    isSelected
                      ? 'bg-spert-blue/10 dark:bg-blue-900/30 border border-spert-blue'
                      : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                  )}
                >
                  <input
                    type="radio"
                    name="cv-selection"
                    checked={isSelected}
                    onChange={() => onCVChange(cv)}
                    className="accent-spert-blue"
                  />
                  <span className={cn(
                    'font-medium',
                    isSelected ? 'text-spert-blue dark:text-blue-400' : 'text-spert-text dark:text-gray-300'
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
        </div>
      </div>
    </div>
  )
}
