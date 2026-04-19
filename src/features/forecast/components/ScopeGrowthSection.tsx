// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import type { ScopeChangeStats } from '../lib/statistics'

interface ScopeGrowthSectionProps {
  scopeChangeStats: ScopeChangeStats
  modelScopeGrowth: boolean
  scopeGrowthMode: 'calculated' | 'custom'
  customScopeGrowth: string
  effectiveMean: number
  unitOfMeasure: string
  onModelScopeGrowthChange: (value: boolean) => void
  onScopeGrowthModeChange: (mode: 'calculated' | 'custom') => void
  onCustomScopeGrowthChange: (value: string) => void
}

/**
 * Scope growth modeling controls (checkbox + radio options).
 *
 * Extracted from ForecastForm to keep it under the ~300 LOC guideline.
 */
export function ScopeGrowthSection({
  scopeChangeStats,
  modelScopeGrowth,
  scopeGrowthMode,
  customScopeGrowth,
  effectiveMean,
  unitOfMeasure,
  onModelScopeGrowthChange,
  onScopeGrowthModeChange,
  onCustomScopeGrowthChange,
}: ScopeGrowthSectionProps) {
  const activeScopeGrowth = scopeGrowthMode === 'custom'
    ? parseFloat(customScopeGrowth) || 0
    : scopeChangeStats.averageScopeInjection

  return (
    <div className="mt-3 rounded-md border border-border dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2">
      {/* Checkbox row */}
      <label htmlFor="modelScopeGrowth" className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          id="modelScopeGrowth"
          checked={modelScopeGrowth}
          onChange={(e) => onModelScopeGrowthChange(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-500"
        />
        <span className="text-sm font-medium text-spert-text-secondary dark:text-gray-300">
          Model scope growth{' '}
          <span className="text-xs font-normal text-spert-text-muted">
            (if backlog tends to grow each sprint)
          </span>
        </span>
      </label>

      {/* Radio options — only when checked */}
      {modelScopeGrowth && (
        <div className="mt-2 ml-6 space-y-1.5">
          {/* Calculated option */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="scopeGrowthMode"
              checked={scopeGrowthMode === 'calculated'}
              onChange={() => onScopeGrowthModeChange('calculated')}
              className="border-gray-300 dark:border-gray-500"
            />
            <span className="text-sm text-spert-text-secondary dark:text-gray-300">Calculated:</span>
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              scopeChangeStats.averageScopeInjection > 0
                ? 'text-amber-600 dark:text-amber-400'
                : scopeChangeStats.averageScopeInjection < 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-spert-text-muted'
            )}>
              {scopeChangeStats.averageScopeInjection > 0 ? '+' : ''}
              {scopeChangeStats.averageScopeInjection.toFixed(1)} {unitOfMeasure}/sprint
            </span>
            <span className="text-xs text-spert-text-muted dark:text-gray-400">
              from {scopeChangeStats.sprintsWithData} sprints
            </span>
          </label>

          {/* Custom option */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="scopeGrowthMode"
              checked={scopeGrowthMode === 'custom'}
              onChange={() => onScopeGrowthModeChange('custom')}
              className="border-gray-300 dark:border-gray-500"
            />
            <span className="text-sm text-spert-text-secondary dark:text-gray-300">Custom:</span>
            <input
              type="number"
              step="0.1"
              value={customScopeGrowth}
              onChange={(e) => onCustomScopeGrowthChange(e.target.value)}
              onFocus={() => onScopeGrowthModeChange('custom')}
              className="w-20 p-1 text-sm border border-spert-border dark:border-gray-500 rounded bg-white dark:bg-gray-600 text-spert-text dark:text-gray-100 tabular-nums"
              placeholder="0.0"
            />
            <span className="text-sm text-spert-text-muted dark:text-gray-400">{unitOfMeasure}/sprint</span>
          </label>

          {/* Warning — applies to whichever mode is active */}
          {activeScopeGrowth >= effectiveMean && effectiveMean > 0 && (
            <span className="text-xs text-spert-error dark:text-red-400 font-medium block ml-5">
              ⚠ Scope growth ≥ velocity
            </span>
          )}
        </div>
      )}
    </div>
  )
}
