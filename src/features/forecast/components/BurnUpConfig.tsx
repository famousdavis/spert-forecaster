// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useMemo, type RefObject } from 'react'
import type { BurnUpConfig, DistributionType, ForecastLineConfig, ChartFontSize } from '../types'
import { DISTRIBUTION_LABELS, CHART_FONT_SIZE_LABELS } from '../types'
import { CopyImageButton } from '@/shared/components/CopyImageButton'
import { useSettingsStore } from '@/shared/state/settings-store'
// Slider-specific range: step by 5 from 5–95 for easier thumb control
const SLIDER_MIN = 5
const SLIDER_MAX = 95
const SLIDER_STEP = 5

const FONT_SIZES: ChartFontSize[] = ['small', 'medium', 'large']

interface BurnUpConfigProps {
  config: BurnUpConfig
  hasBootstrap: boolean
  onChange: (config: BurnUpConfig) => void
  fontSize?: ChartFontSize
  onFontSizeChange?: (size: ChartFontSize) => void
  chartRef?: RefObject<HTMLDivElement | null>
}

export function BurnUpConfigUI({ config, hasBootstrap, onChange, fontSize = 'small', onFontSizeChange, chartRef }: BurnUpConfigProps) {
  // Distribution availability is intentionally hardcoded here (not derived from
  // getVisibleDistributions) to preserve Triangular/Uniform visibility in BOTH forecast modes.
  // The Settings "Statistical methods to show" checkboxes further filter this list.
  // If you add a distribution, update this list AND the forecastMode matrix in
  // getVisibleDistributions AND DISTRIBUTION_TYPES in src/shared/types/burn-up.ts.
  const distributionsEnabled = useSettingsStore((s) => s.distributionsEnabled)

  const handleDistributionChange = (distribution: DistributionType) => {
    onChange({ ...config, distribution })
  }

  const handleLineChange = (index: 0 | 1 | 2, updates: Partial<ForecastLineConfig>) => {
    const newLines = [...config.lines] as [ForecastLineConfig, ForecastLineConfig, ForecastLineConfig]
    newLines[index] = { ...newLines[index], ...updates }
    onChange({ ...config, lines: newLines })
  }

  // Memoize the intersection of (hardcoded availability for burn-up) with (user's Settings).
  // CRITICAL: this MUST be a stable reference across renders or the fallback effect below
  // re-fires every render → onChange re-fires → parent rerenders → new array reference →
  // infinite loop. Do not drop deps — array reference stability is load-bearing.
  const availableDistributions = useMemo<DistributionType[]>(() => {
    const base: DistributionType[] = hasBootstrap
      ? ['truncatedNormal', 'lognormal', 'gamma', 'bootstrap', 'triangular', 'uniform']
      : ['truncatedNormal', 'lognormal', 'gamma', 'triangular', 'uniform']
    return base.filter((d) => distributionsEnabled.includes(d))
  }, [hasBootstrap, distributionsEnabled])

  // State-fallback: when the user disables the burn-up's current distribution via Settings,
  // reset to the first available option. burnUpConfigs is session-only (excluded from
  // partialize) so this only matters within a single session.
  //
  // Deps are deliberately ONLY [availableDistributions, config.distribution] — both stable
  // primitives/memoized refs. Including the full `config` object would re-fire the effect on
  // every parent render and risk an infinite loop with onChange. We read the latest config
  // inside the effect body via the closure (acceptable: the function reruns on each render
  // anyway, so the captured `config` is always current).
  useEffect(() => {
    if (availableDistributions.length === 0) return
    if (!availableDistributions.includes(config.distribution)) {
      onChange({ ...config, distribution: availableDistributions[0] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional dep stability; see comment above
  }, [availableDistributions, config.distribution])

  return (
    <div className="mb-4">
      {/* All controls in a single horizontal row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Distribution selector */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="burnup-distribution"
            className="text-[0.8125rem] font-semibold text-spert-text-muted"
          >
            Dist:
          </label>
          <select
            id="burnup-distribution"
            value={config.distribution}
            onChange={(e) => handleDistributionChange(e.target.value as DistributionType)}
            className="px-1.5 py-1 text-[0.8125rem] border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            {availableDistributions.map((dist) => (
              <option key={dist} value={dist}>
                {DISTRIBUTION_LABELS[dist]}
              </option>
            ))}
          </select>
        </div>

        {/* Scope line toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="burnup-scope-line"
            checked={config.showScopeLine !== false}
            onChange={(e) => onChange({ ...config, showScopeLine: e.target.checked })}
            className="h-4 w-4 cursor-pointer"
          />
          <label
            htmlFor="burnup-scope-line"
            className="text-[0.8125rem] font-semibold text-spert-text-muted cursor-pointer"
          >
            Show scope
          </label>
        </div>

        {/* Forecast line configuration - all inline */}
        {config.lines.map((line, index) => (
          <ForecastLineRow
            key={index}
            line={line}
            lineNumber={index + 1}
            onChange={(updates) => handleLineChange(index as 0 | 1 | 2, updates)}
          />
        ))}

        {/* Font size selector + copy image button */}
        {(onFontSizeChange || chartRef) && (
          <div className="copy-image-button flex items-center gap-2 ml-auto">
            {onFontSizeChange && (
              <>
                <label
                  htmlFor="burnup-font-size"
                  className="text-[0.8125rem] font-semibold text-spert-text-muted"
                >
                  Text:
                </label>
                <select
                  id="burnup-font-size"
                  value={fontSize}
                  onChange={(e) => onFontSizeChange(e.target.value as ChartFontSize)}
                  className="px-1.5 py-1 text-[0.8125rem] border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100"
                >
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {CHART_FONT_SIZE_LABELS[size]}
                    </option>
                  ))}
                </select>
              </>
            )}
            {chartRef && (
              <CopyImageButton targetRef={chartRef} title="Copy chart as image" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface ForecastLineRowProps {
  line: ForecastLineConfig
  lineNumber: number
  onChange: (updates: Partial<ForecastLineConfig>) => void
}

function ForecastLineRow({ line, lineNumber, onChange }: ForecastLineRowProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Color picker */}
      <input
        type="color"
        name={`burnup-line-${lineNumber}-color`}
        value={line.color}
        onChange={(e) => onChange({ color: e.target.value })}
        className="w-6 h-6 p-0 border border-spert-border dark:border-gray-600 rounded cursor-pointer"
        title={`Line ${lineNumber} color`}
      />

      {/* Label input */}
      <input
        type="text"
        name={`burnup-line-${lineNumber}-label`}
        value={line.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder={`Line ${lineNumber}`}
        maxLength={16}
        className="w-[88px] px-1.5 py-1 text-[0.8125rem] border border-spert-border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100"
        title="Forecast line label"
      />

      {/* Percentile slider */}
      <input
        type="range"
        name={`burnup-line-${lineNumber}-percentile`}
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        value={line.percentile}
        onChange={(e) => onChange({ percentile: Number(e.target.value) })}
        className="w-[60px] cursor-pointer"
        title={`Percentile: ${line.percentile}%`}
      />

      {/* Percentile value display */}
      <span
        className="text-[0.8125rem] font-semibold text-spert-text-muted min-w-[32px]"
      >
        P{line.percentile}
      </span>
    </div>
  )
}
