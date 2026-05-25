// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useEffect, useRef } from 'react'
import { useSettingsStore, TRIAL_COUNT_OPTIONS, type TrialCount } from '@/shared/state/settings-store'
import { CHART_FONT_SIZE_LABELS, type ChartFontSize, DISTRIBUTION_TYPES, DISTRIBUTION_LABELS, type DistributionType } from '@/shared/types/burn-up'
import { useTheme, type Theme } from '@/shared/hooks/useTheme'
import { MIN_PERCENTILE, MAX_PERCENTILE, SELECTABLE_PERCENTILES } from '@/features/forecast/constants'
import { cn } from '@/lib/utils'
import { StorageModeSection } from '@/features/auth/components/StorageModeSection'
import { ExportProjectsSection } from './ExportProjectsSection'

const sectionHeaderClass = 'text-lg font-semibold text-spert-blue mb-4'
const labelClass = 'text-sm font-semibold text-spert-text-secondary dark:text-gray-300'
const descriptionClass = 'text-xs text-spert-text-muted dark:text-gray-400 mt-0.5'
const selectClass = 'p-2 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 cursor-pointer'
const inputClass = 'p-2 text-sm border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 w-20'

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const FONT_SIZE_OPTIONS: { value: ChartFontSize; label: string }[] = [
  { value: 'small', label: CHART_FONT_SIZE_LABELS.small },
  { value: 'medium', label: CHART_FONT_SIZE_LABELS.medium },
  { value: 'large', label: CHART_FONT_SIZE_LABELS.large },
]

// One-line description per distribution for the "Statistical methods to show" section.
// Lognormal is the v0.32.0 default; T-Normal is an opt-in classical alternative.
const DISTRIBUTION_DESCRIPTIONS: Record<DistributionType, string> = {
  lognormal:
    'Lognormal — right-skewed curve always above zero, with a long upper tail; the recommended default because it matches the empirical right-skew of sprint velocity and remains well-calibrated even when sprint-to-sprint variation is large.',
  truncatedNormal:
    'Truncated normal — symmetric bell curve restricted to non-negative velocities; classical PERT-style shape. A reasonable alternative when sprint variability is low and approximately symmetric — at high variability the lower-bound truncation biases the mean upward and makes forecasts artificially optimistic.',
  gamma:
    'Gamma — right-skewed like Lognormal but with a thinner upper tail; useful when faster sprints happen but extreme breakouts are unlikely.',
  bootstrap:
    'Bootstrap — resamples directly from your actual sprint history; the most data-driven option, assuming only that future sprints will look like past ones, but needs 5+ recorded sprints.',
  triangular:
    'Triangular — a simple peaked shape with hard limits at ±3 standard deviations from the mean; useful when you want a transparent, bounded forecast without long tails.',
  uniform:
    'Uniform — every velocity in the range equally likely; the most conservative shape, useful when you have little basis to prefer any one value.',
}

export function SettingsTab() {
  const {
    autoRecalculate,
    setAutoRecalculate,
    trialCount,
    setTrialCount,
    defaultChartFontSize,
    setDefaultChartFontSize,
    defaultCustomPercentile,
    setDefaultCustomPercentile,
    defaultCustomPercentile2,
    setDefaultCustomPercentile2,
    defaultResultsPercentiles,
    setDefaultResultsPercentiles,
    distributionsEnabled,
    setDistributionsEnabled,
    exportName,
    setExportName,
    exportId,
    setExportId,
    suppressLocalStorageWarning,
    setSuppressLocalStorageWarning,
  } = useSettingsStore()

  const { theme, setTheme } = useTheme()

  // A3 — buffer the two custom-percentile inputs locally and commit on blur.
  // The store setter clamps via Math.max(1, Math.min(99, Math.round(value))),
  // which made typing "07" over "85" snap to "1" mid-keystroke (the first
  // digit '0' clamped to 1 before the second arrived). Buffering in local
  // useState lets the user finish typing before clamping happens.
  //
  // Focus refs prevent incoming cloud restores from overwriting the in-progress
  // draft: the sync useEffects below run on every store change, but skip when
  // the input owns the user's attention.
  const [percentile1Draft, setPercentile1Draft] = useState(String(defaultCustomPercentile))
  const [percentile2Draft, setPercentile2Draft] = useState(String(defaultCustomPercentile2))
  const isFocused1Ref = useRef(false)
  const isFocused2Ref = useRef(false)
  // The lint rule warns against derived-state-in-effect; here we are
  // synchronizing the local draft with an external source (the Zustand store,
  // which can update via cloud restore or external setter) — which is exactly
  // the documented exception in the rule's description. The focus guard avoids
  // overwriting user input mid-keystroke.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isFocused1Ref.current) setPercentile1Draft(String(defaultCustomPercentile))
  }, [defaultCustomPercentile])
  useEffect(() => {
    if (!isFocused2Ref.current) setPercentile2Draft(String(defaultCustomPercentile2))
  }, [defaultCustomPercentile2])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleToggleResultsPercentile = (p: number) => {
    const isSelected = defaultResultsPercentiles.includes(p)
    if (isSelected) {
      // Don't allow deselecting the last one
      if (defaultResultsPercentiles.length <= 1) return
      setDefaultResultsPercentiles(defaultResultsPercentiles.filter((v) => v !== p))
    } else {
      setDefaultResultsPercentiles([...defaultResultsPercentiles, p])
    }
  }

  const handleToggleDistribution = (d: DistributionType) => {
    const isSelected = distributionsEnabled.includes(d)
    if (isSelected) {
      // Validation: must keep at least one enabled
      if (distributionsEnabled.length <= 1) return
      setDistributionsEnabled(distributionsEnabled.filter((v) => v !== d))
    } else {
      // Preserve canonical order (DISTRIBUTION_TYPES) when adding
      const next = DISTRIBUTION_TYPES.filter(
        (t) => t === d || distributionsEnabled.includes(t)
      )
      setDistributionsEnabled([...next])
    }
  }

  return (
    <div className="space-y-8 max-w-[800px]">
      <div>
        <h2 className="text-xl font-semibold text-spert-text dark:text-gray-100">Settings</h2>
        <p className="text-sm text-spert-text-muted dark:text-gray-400 italic">
          Global preferences for simulation and display
        </p>
      </div>

      {/* Storage */}
      <StorageModeSection />

      {/* Simulation Settings */}
      <section>
        <h3 className={sectionHeaderClass}>Simulation</h3>
        <div className="space-y-5">
          {/* Auto-recalculate */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="autoRecalculate"
              checked={autoRecalculate}
              onChange={(e) => setAutoRecalculate(e.target.checked)}
              className="mt-1 rounded border-gray-300 dark:border-gray-500 cursor-pointer"
            />
            <div>
              <label htmlFor="autoRecalculate" className={`${labelClass} cursor-pointer`}>
                Auto-recalculate
              </label>
              <p className={descriptionClass}>
                Automatically re-run the forecast when inputs change. Takes effect after the first manual run.
              </p>
            </div>
          </div>

          {/* Trial count */}
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor="trialCount" className={labelClass}>
                Number of simulations
              </label>
              <select
                id="trialCount"
                value={trialCount}
                onChange={(e) => setTrialCount(Number(e.target.value) as TrialCount)}
                className={selectClass}
              >
                {TRIAL_COUNT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className={descriptionClass}>
              More trials produce smoother distributions but take longer. Each distribution runs this many trials.
            </p>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section>
        <h3 className={sectionHeaderClass}>Notifications</h3>
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="warnLocalStorage"
              checked={!suppressLocalStorageWarning}
              onChange={(e) => setSuppressLocalStorageWarning(!e.target.checked)}
              className="mt-1 rounded border-gray-300 dark:border-gray-500 cursor-pointer"
            />
            <div>
              <label htmlFor="warnLocalStorage" className={`${labelClass} cursor-pointer`}>
                Warn me on startup when using local storage
              </label>
              <p className={descriptionClass}>
                Shows a caution banner each time the app opens while your data is stored locally in this browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Chart Defaults */}
      <section>
        <h3 className={sectionHeaderClass}>Chart Defaults</h3>
        <div className="space-y-5">
          {/* Default chart font size */}
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor="defaultFontSize" className={labelClass}>
                Chart font size
              </label>
              <select
                id="defaultFontSize"
                value={defaultChartFontSize}
                onChange={(e) => setDefaultChartFontSize(e.target.value as ChartFontSize)}
                className={selectClass}
              >
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className={descriptionClass}>
              Default font size for new chart sessions. Individual charts can still be overridden.
            </p>
          </div>

          {/* Default results table percentiles */}
          <div>
            <span className={labelClass}>
              Default results table percentiles
            </span>
            <p className={descriptionClass}>
              Which confidence percentiles to show in the Forecast Results table for new sessions.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SELECTABLE_PERCENTILES.map((p) => {
                const isSelected = defaultResultsPercentiles.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleToggleResultsPercentile(p)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-full border cursor-pointer transition-colors duration-150',
                      isSelected
                        ? 'bg-spert-blue text-white border-spert-blue'
                        : 'bg-transparent text-muted-foreground border-spert-border dark:border-gray-600 hover:border-spert-blue hover:text-spert-blue'
                    )}
                  >
                    P{p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Default custom percentile 1 */}
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor="defaultPercentile" className={labelClass}>
                Default custom percentile 1
              </label>
              <input
                id="defaultPercentile"
                type="number"
                min={MIN_PERCENTILE}
                max={MAX_PERCENTILE}
                value={percentile1Draft}
                onChange={(e) => setPercentile1Draft(e.target.value)}
                onFocus={() => { isFocused1Ref.current = true }}
                onBlur={() => {
                  isFocused1Ref.current = false
                  const val = parseInt(percentile1Draft, 10)
                  if (!isNaN(val)) {
                    setDefaultCustomPercentile(val)
                  } else {
                    setPercentile1Draft(String(defaultCustomPercentile))
                  }
                }}
                className={inputClass}
              />
            </div>
            <p className={descriptionClass}>
              Initial percentile for the first custom percentile slider ({MIN_PERCENTILE}&ndash;{MAX_PERCENTILE}).
            </p>
          </div>

          {/* Default custom percentile 2 */}
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor="defaultPercentile2" className={labelClass}>
                Default custom percentile 2
              </label>
              <input
                id="defaultPercentile2"
                type="number"
                min={MIN_PERCENTILE}
                max={MAX_PERCENTILE}
                value={percentile2Draft}
                onChange={(e) => setPercentile2Draft(e.target.value)}
                onFocus={() => { isFocused2Ref.current = true }}
                onBlur={() => {
                  isFocused2Ref.current = false
                  const val = parseInt(percentile2Draft, 10)
                  if (!isNaN(val)) {
                    setDefaultCustomPercentile2(val)
                  } else {
                    setPercentile2Draft(String(defaultCustomPercentile2))
                  }
                }}
                className={inputClass}
              />
            </div>
            <p className={descriptionClass}>
              Initial percentile for the second custom percentile slider ({MIN_PERCENTILE}&ndash;{MAX_PERCENTILE}).
            </p>
          </div>

          {/* Statistical methods to show */}
          <div>
            <span className={labelClass}>
              Statistical methods to show
            </span>
            <p className={descriptionClass}>
              Which simulation methods to include in the forecast. At least one must remain enabled.
            </p>
            <div className="mt-3 space-y-2">
              {DISTRIBUTION_TYPES.map((d) => {
                const isChecked = distributionsEnabled.includes(d)
                const isLastChecked = isChecked && distributionsEnabled.length === 1
                const checkboxId = `distribution-${d}`
                return (
                  <div key={d} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={checkboxId}
                      checked={isChecked}
                      disabled={isLastChecked}
                      onChange={() => handleToggleDistribution(d)}
                      className="mt-1 rounded border-gray-300 dark:border-gray-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div>
                      <label
                        htmlFor={checkboxId}
                        className={cn(
                          `${labelClass} cursor-pointer`,
                          isLastChecked && 'cursor-not-allowed opacity-80'
                        )}
                      >
                        {DISTRIBUTION_LABELS[d]}
                      </label>
                      <p className={descriptionClass}>
                        {DISTRIBUTION_DESCRIPTIONS[d]}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section>
        <h3 className={sectionHeaderClass}>Appearance</h3>
        <div className="space-y-5">
          {/* Theme */}
          <div>
            <div className="flex items-center gap-3">
              <label htmlFor="theme" className={labelClass}>
                Theme
              </label>
              <select
                id="theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as Theme)}
                className={selectClass}
              >
                {THEME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className={descriptionClass}>
              Choose between light, dark, or system-default appearance.
            </p>
          </div>
        </div>
      </section>

      {/* Export Attribution */}
      <section>
        <h3 className={sectionHeaderClass}>Export Attribution</h3>
        <p className={`${descriptionClass} mb-4`}>
          Identify yourself on exported files. These fields are included in JSON exports for traceability.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="exportName" className={`${labelClass} block mb-1`}>
              Name
            </label>
            <input
              id="exportName"
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              placeholder="e.g., Jane Smith"
              autoComplete="name"
              maxLength={100}
              className={`${selectClass} w-full max-w-[400px]`}
            />
          </div>
          <div>
            <label htmlFor="exportId" className={`${labelClass} block mb-1`}>
              Identifier
            </label>
            <input
              id="exportId"
              type="text"
              value={exportId}
              onChange={(e) => setExportId(e.target.value)}
              placeholder="e.g., student ID, email, or team name"
              maxLength={100}
              className={`${selectClass} w-full max-w-[400px]`}
            />
          </div>
        </div>
      </section>

      {/* Export Projects */}
      <ExportProjectsSection />
    </div>
  )
}
