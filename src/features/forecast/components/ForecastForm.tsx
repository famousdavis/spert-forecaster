// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ScopeChangeStats } from '../lib/statistics'
import type { Sprint, ForecastMode } from '@/shared/types'
import { VelocitySparkline } from './VelocitySparkline'
import { ScopeGrowthSection } from './ScopeGrowthSection'
import { ForecastModeToggle } from './ForecastModeToggle'
import { SubjectiveInputs } from './SubjectiveInputs'
import { VolatilityAdjuster } from './VolatilityAdjuster'
import { DEFAULT_VOLATILITY_MULTIPLIER } from '../constants'

interface ForecastFormProps {
  remainingBacklog: string
  velocityMean: string
  velocityStdDev: string
  startDate: string
  sprintCadenceWeeks: number | undefined
  calculatedMean: number
  calculatedStdDev: number
  effectiveMean: number
  effectiveStdDev: number
  unitOfMeasure: string
  lastSprintBacklog?: number
  sprints: Sprint[]
  scopeChangeStats?: ScopeChangeStats | null
  modelScopeGrowth: boolean
  scopeGrowthMode: 'calculated' | 'custom'
  customScopeGrowth: string
  forecastMode: ForecastMode
  includedSprintCount: number
  velocityEstimate: string
  selectedCV: number
  onForecastModeChange: (mode: ForecastMode) => void
  onVelocityEstimateChange: (value: string) => void
  onCVChange: (cv: number) => void
  onModelScopeGrowthChange: (value: boolean) => void
  onScopeGrowthModeChange: (mode: 'calculated' | 'custom') => void
  onCustomScopeGrowthChange: (value: string) => void
  onRemainingBacklogChange: (value: string) => void
  onVelocityMeanChange: (value: string) => void
  onVelocityStdDevChange: (value: string) => void
  volatilityMultiplier: number
  onVolatilityMultiplierChange: (multiplier: number) => void
  onRunForecast: () => void
  canRun: boolean
  isSimulating: boolean
}

// Shared label style: fixed height for consistent alignment, text pinned to bottom
const labelClass = 'flex items-end mb-1 text-sm font-semibold text-spert-text-secondary min-h-[1.75rem]'
// Shared helper text style: fixed height for consistent bottom alignment
const helperClass = 'text-xs text-spert-text-muted mt-1 h-4'

export function ForecastForm({
  remainingBacklog,
  velocityMean,
  velocityStdDev,
  startDate,
  sprintCadenceWeeks,
  calculatedMean,
  calculatedStdDev,
  effectiveMean,
  effectiveStdDev,
  unitOfMeasure,
  lastSprintBacklog,
  sprints,
  scopeChangeStats,
  modelScopeGrowth,
  scopeGrowthMode,
  customScopeGrowth,
  forecastMode,
  includedSprintCount,
  velocityEstimate,
  selectedCV,
  onForecastModeChange,
  onVelocityEstimateChange,
  onCVChange,
  onModelScopeGrowthChange,
  onScopeGrowthModeChange,
  onCustomScopeGrowthChange,
  onRemainingBacklogChange,
  onVelocityMeanChange,
  onVelocityStdDevChange,
  volatilityMultiplier,
  onVolatilityMultiplierChange,
  onRunForecast,
  canRun,
  isSimulating,
}: ForecastFormProps) {
  const isSubjective = forecastMode === 'subjective'
  const [adjusterOpen, setAdjusterOpen] = useState(false)
  const isAdjusterActive = !isSubjective && adjusterOpen && calculatedStdDev > 0

  const handleToggleAdjuster = () => {
    if (adjusterOpen) {
      // Collapsing: reset multiplier to 1.0
      onVolatilityMultiplierChange(DEFAULT_VOLATILITY_MULTIPLIER)
      setAdjusterOpen(false)
    } else {
      // Expanding: clear any manual SD override so multiplier takes effect
      onVelocityStdDevChange('')
      setAdjusterOpen(true)
    }
  }

  return (
    <div className="rounded-lg border border-border dark:border-gray-700 p-4 bg-spert-bg-input dark:bg-gray-800">
      <ForecastModeToggle
        mode={forecastMode}
        onModeChange={onForecastModeChange}
        includedSprintCount={includedSprintCount}
        calculatedStdDev={calculatedStdDev}
      />
      <div className="flex gap-4 items-end flex-wrap">
        {/* Remaining Backlog */}
        <div className="flex-[1.5_1_170px] min-w-[120px]">
          <label htmlFor="remainingBacklog" className={labelClass}>
            Backlog <span className="text-spert-error ml-0.5">*</span><span className="ml-auto text-xs font-normal italic text-spert-text-muted">{unitOfMeasure}</span>
          </label>
          <input
            id="remainingBacklog"
            type="number"
            min="0"
            max="999999"
            step="any"
            value={remainingBacklog}
            onChange={(e) => onRemainingBacklogChange(e.target.value)}
            className={cn(
              'p-2 text-[0.9rem] rounded w-full dark:text-gray-100',
              remainingBacklog
                ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-blue-900/30'
            )}
            placeholder="Required"
          />
          <p className={helperClass}>
            {lastSprintBacklog !== undefined
              ? `Last sprint: ${lastSprintBacklog.toLocaleString()}`
              : '\u00A0'}
          </p>
        </div>

        {/* Velocity */}
        <div className="flex-[1_1_140px] min-w-[120px]">
          <label htmlFor="velocityMean" className={labelClass}>
            Velocity
          </label>
          <input
            id="velocityMean"
            type="number"
            min="0"
            max="999999"
            step="any"
            value={
              isSubjective
                ? (effectiveMean > 0 ? effectiveMean.toFixed(1) : '')
                : velocityMean || (calculatedMean > 0 ? calculatedMean.toFixed(1) : '')
            }
            onChange={(e) => onVelocityMeanChange(e.target.value)}
            disabled={isSubjective}
            className={cn(
              'p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-full text-spert-text dark:text-gray-100',
              isSubjective
                ? 'bg-spert-bg-disabled dark:bg-gray-700 cursor-not-allowed'
                : 'bg-white dark:bg-gray-700'
            )}
            placeholder={isSubjective ? 'From estimate' : (calculatedMean > 0 ? '' : 'No data')}
          />
          <p className={helperClass}>
            {isSubjective
              ? (calculatedMean > 0 ? `Calc: ${calculatedMean.toFixed(1)}` : '\u00A0')
              : calculatedMean > 0
                ? `Calc: ${calculatedMean.toFixed(1)}`
                : 'Add sprints to calculate'}
          </p>
        </div>

        {/* Velocity Std Dev */}
        <div className="flex-[0_0_120px]">
          <label htmlFor="velocityStdDev" className={labelClass}>
            Std Dev
          </label>
          <input
            id="velocityStdDev"
            type="number"
            min="0"
            max="999999"
            step="any"
            value={
              isAdjusterActive
                ? effectiveStdDev.toFixed(1)
                : isSubjective
                  ? (effectiveMean > 0 ? effectiveStdDev.toFixed(1) : '')
                  : velocityStdDev || (calculatedStdDev > 0 ? calculatedStdDev.toFixed(1) : '')
            }
            onChange={(e) => onVelocityStdDevChange(e.target.value)}
            disabled={isSubjective || isAdjusterActive}
            className={cn(
              'p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-full text-spert-text dark:text-gray-100',
              (isSubjective || isAdjusterActive)
                ? 'bg-spert-bg-disabled dark:bg-gray-700 cursor-not-allowed'
                : 'bg-white dark:bg-gray-700'
            )}
            placeholder={isSubjective ? (effectiveMean > 0 ? '' : 'From CV') : (calculatedStdDev > 0 ? '' : 'No data')}
          />
          <p className={helperClass}>
            {isSubjective
              ? (effectiveMean > 0 ? `From CV: ${effectiveStdDev.toFixed(1)}` : '\u00A0')
              : isAdjusterActive && volatilityMultiplier !== DEFAULT_VOLATILITY_MULTIPLIER
                ? `Adj: ${effectiveStdDev.toFixed(1)} (\u00D7${volatilityMultiplier})`
                : calculatedStdDev > 0
                  ? `Calc: ${calculatedStdDev.toFixed(1)}`
                  : 'Need 2+ sprints'}
            {!isSubjective && calculatedStdDev > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={handleToggleAdjuster}
                  className="text-xs text-spert-text-muted dark:text-gray-400 hover:text-spert-text dark:hover:text-gray-200 transition-colors cursor-pointer bg-transparent border-none p-0 underline"
                >
                  {adjusterOpen ? 'Close' : 'Adjust'}
                </button>
              </>
            )}
          </p>
        </div>

        {/* Velocity Sparkline — nudged up to visually center with input fields */}
        {!isSubjective && sprints.length >= 2 && (
          <div className="flex-[0_0_auto] relative -top-2">
            <VelocitySparkline sprints={sprints} />
          </div>
        )}

        {/* Forecast Start Date */}
        <div className="flex-[0_0_130px]">
          <label htmlFor="startDate" className={labelClass}>
            Start Date
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            readOnly
            tabIndex={-1}
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded w-[130px] bg-spert-bg-disabled dark:bg-gray-700 cursor-not-allowed text-spert-text dark:text-gray-100"
          />
          <p className={helperClass}>
            Next sprint start
          </p>
        </div>

        {/* Sprint Cadence (display only) */}
        <div className="flex-[0_0_80px]">
          <label className={labelClass}>
            Cadence
          </label>
          <div
            className="p-2 text-[0.9rem] border border-spert-border dark:border-gray-600 rounded bg-spert-bg-disabled dark:bg-gray-700 text-spert-text dark:text-gray-100 text-center"
          >
            {sprintCadenceWeeks ? `${sprintCadenceWeeks} Week${sprintCadenceWeeks > 1 ? 's' : ''}` : '—'}
          </div>
          <p className={helperClass}>
            &nbsp;
          </p>
        </div>

        {/* Run Forecast Button — same label/content/helper structure */}
        <div className="flex-[0_0_auto]">
          <div className="min-h-[1.75rem] mb-1" />
          <button
            onClick={onRunForecast}
            disabled={!canRun || isSimulating}
            className={cn(
              'px-4 py-2 text-white border-none rounded text-[0.9rem] font-semibold h-[38px] w-[140px] transition-[background-color,transform] duration-150 ease-in-out',
              isSimulating
                ? 'bg-spert-success cursor-not-allowed scale-[0.97]'
                : canRun
                  ? 'bg-spert-blue dark:bg-blue-700 cursor-pointer scale-100'
                  : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed scale-100'
            )}
          >
            {isSimulating ? 'Running…' : 'Run Forecast'}
          </button>
          <p className="h-4 mt-1">
            {!canRun && remainingBacklog && effectiveMean <= 0 && (
              <span className="text-xs text-spert-error">
                Velocity must be &gt; 0
              </span>
            )}
            {canRun && '\u00A0'}
          </p>
        </div>
      </div>

      {/* Subjective Inputs — shown in subjective mode */}
      {isSubjective && (
        <SubjectiveInputs
          velocityEstimate={velocityEstimate}
          selectedCV={selectedCV}
          onVelocityEstimateChange={onVelocityEstimateChange}
          onCVChange={onCVChange}
          unitOfMeasure={unitOfMeasure}
          calculatedMean={calculatedMean}
        />
      )}

      {/* Volatility Adjuster panel — shown when toggle is open in history mode */}
      {isAdjusterActive && (
        <VolatilityAdjuster
          calculatedStdDev={calculatedStdDev}
          effectiveMean={effectiveMean}
          selectedMultiplier={volatilityMultiplier}
          onMultiplierChange={onVolatilityMultiplierChange}
        />
      )}

      {/* Scope Growth Modeling */}
      {scopeChangeStats && (
        <ScopeGrowthSection
          scopeChangeStats={scopeChangeStats}
          modelScopeGrowth={modelScopeGrowth}
          scopeGrowthMode={scopeGrowthMode}
          customScopeGrowth={customScopeGrowth}
          effectiveMean={effectiveMean}
          unitOfMeasure={unitOfMeasure}
          onModelScopeGrowthChange={onModelScopeGrowthChange}
          onScopeGrowthModeChange={onScopeGrowthModeChange}
          onCustomScopeGrowthChange={onCustomScopeGrowthChange}
        />
      )}
    </div>
  )
}
