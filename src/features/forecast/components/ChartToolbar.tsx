// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useMemo } from 'react'
import type { Milestone } from '@/shared/types'
import {
  type MilestoneCompletionInfo,
  buildMilestonePickerOptions,
  pickerFallback,
} from '../lib/milestones'
import { type ChartFontSize, CHART_FONT_SIZE_LABELS } from '../types'

const FONT_SIZES: ChartFontSize[] = ['small', 'medium', 'large']

interface ChartToolbarProps {
  idPrefix: string
  milestones?: Milestone[]
  milestoneCompletionInfo?: MilestoneCompletionInfo[]
  selectedMilestoneIndex?: number
  onMilestoneIndexChange?: (index: number) => void
  fontSize?: ChartFontSize
  onFontSizeChange?: (size: ChartFontSize) => void
}

export function ChartToolbar({
  idPrefix,
  milestones = [],
  milestoneCompletionInfo = [],
  selectedMilestoneIndex = 0,
  onMilestoneIndexChange,
  fontSize = 'small',
  onFontSizeChange,
}: ChartToolbarProps) {
  // One builder for every forecast-control picker — see
  // buildMilestonePickerOptions in ../lib/milestones for why it is shared.
  const options = useMemo(
    () => buildMilestonePickerOptions(milestones, milestoneCompletionInfo),
    [milestones, milestoneCompletionInfo]
  )

  // Move a selection the picker no longer offers to its LAST option — see
  // pickerFallback for why not the first.
  useEffect(() => {
    if (!onMilestoneIndexChange) return
    if (options.some((o) => o.value === selectedMilestoneIndex)) return
    const fallback = pickerFallback(options)
    if (fallback !== null) onMilestoneIndexChange(fallback)
  }, [options, selectedMilestoneIndex, onMilestoneIndexChange])

  const showMilestoneSelector = options.length > 0 && onMilestoneIndexChange
  const showFontSize = !!onFontSizeChange

  if (!showMilestoneSelector && !showFontSize) return null

  return (
    <div className="flex items-center gap-2 mb-4 justify-end mr-10">
      {showMilestoneSelector && (
        <>
          <label
            htmlFor={`${idPrefix}-milestone-select`}
            className="text-[0.8125rem] font-semibold text-spert-text-muted"
          >
            Milestone:
          </label>
          <select
            id={`${idPrefix}-milestone-select`}
            value={selectedMilestoneIndex}
            onChange={(e) => onMilestoneIndexChange(Number(e.target.value))}
            className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="mx-1" />
        </>
      )}
      {showFontSize && (
        <>
          <label
            htmlFor={`${idPrefix}-font-size`}
            className="text-[0.8125rem] font-semibold text-spert-text-muted"
          >
            Text:
          </label>
          <select
            id={`${idPrefix}-font-size`}
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
    </div>
  )
}
