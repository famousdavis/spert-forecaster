// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { RefObject } from 'react'
import type { BurnUpConfig, DistributionType, ForecastLineConfig, ChartFontSize } from '../types'
import { DISTRIBUTION_LABELS, CHART_FONT_SIZE_LABELS } from '../types'
import { CopyImageButton } from '@/shared/components/CopyImageButton'
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
  const handleDistributionChange = (distribution: DistributionType) => {
    onChange({ ...config, distribution })
  }

  const handleLineChange = (index: 0 | 1 | 2, updates: Partial<ForecastLineConfig>) => {
    const newLines = [...config.lines] as [ForecastLineConfig, ForecastLineConfig, ForecastLineConfig]
    newLines[index] = { ...newLines[index], ...updates }
    onChange({ ...config, lines: newLines })
  }

  // Available distributions (all 6 always available; bootstrap only if historical data exists)
  const availableDistributions: DistributionType[] = hasBootstrap
    ? ['truncatedNormal', 'lognormal', 'gamma', 'bootstrap', 'triangular', 'uniform']
    : ['truncatedNormal', 'lognormal', 'gamma', 'triangular', 'uniform']

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
        value={line.color}
        onChange={(e) => onChange({ color: e.target.value })}
        className="w-6 h-6 p-0 border border-spert-border dark:border-gray-600 rounded cursor-pointer"
        title={`Line ${lineNumber} color`}
      />

      {/* Label input */}
      <input
        type="text"
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
