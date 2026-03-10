// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useMemo } from 'react'
import type { Milestone } from '@/shared/types'
import { type ChartFontSize, CHART_FONT_SIZE_LABELS } from '../types'

const FONT_SIZES: ChartFontSize[] = ['small', 'medium', 'large']

interface ChartToolbarProps {
  idPrefix: string
  milestones?: Milestone[]
  selectedMilestoneIndex?: number
  onMilestoneIndexChange?: (index: number) => void
  fontSize?: ChartFontSize
  onFontSizeChange?: (size: ChartFontSize) => void
}

export function ChartToolbar({
  idPrefix,
  milestones = [],
  selectedMilestoneIndex = 0,
  onMilestoneIndexChange,
  fontSize = 'small',
  onFontSizeChange,
}: ChartToolbarProps) {
  // Filter to only milestones checked for chart display, preserving original indices
  const visibleMilestones = useMemo(
    () => milestones
      .map((m, idx) => ({ milestone: m, originalIndex: idx }))
      .filter(({ milestone: m }) => m.showOnChart !== false),
    [milestones]
  )

  // Auto-correct selected index when it's not among the visible milestones
  useEffect(() => {
    if (visibleMilestones.length === 0 || !onMilestoneIndexChange) return
    const isValid = visibleMilestones.some((v) => v.originalIndex === selectedMilestoneIndex)
    if (!isValid) {
      onMilestoneIndexChange(visibleMilestones[0].originalIndex)
    }
  }, [visibleMilestones, selectedMilestoneIndex, onMilestoneIndexChange])

  const lastVisibleIdx = visibleMilestones.length > 0
    ? visibleMilestones[visibleMilestones.length - 1].originalIndex
    : -1

  const showMilestoneSelector = visibleMilestones.length > 0 && onMilestoneIndexChange
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
            {visibleMilestones.map(({ milestone: m, originalIndex }) => (
              <option key={m.id} value={originalIndex}>
                {m.name}{originalIndex === lastVisibleIdx && visibleMilestones.length > 1 ? ' (Total)' : ''}
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
