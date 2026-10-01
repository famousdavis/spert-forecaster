// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useMemo, type RefObject } from 'react'
import type { ForecastResult, Milestone, ForecastMode } from '@/shared/types'
import { cn } from '@/lib/utils'
import { MIN_PERCENTILE, MAX_PERCENTILE } from '../constants'
import { CopyImageButton } from '@/shared/components/CopyImageButton'
import { formatDate } from '@/shared/lib/dates'
import { getVisibleDistributions, DISTRIBUTION_LABELS, type DistributionType } from '../types'
import { useSettingsStore } from '@/shared/state/settings-store'
import {
  type MilestoneCompletionInfo,
  buildMilestonePickerOptions,
  pickerFallback,
} from '../lib/milestones'

interface PercentileSelectorProps {
  percentile: number
  truncatedNormalResult: ForecastResult | null
  lognormalResult: ForecastResult | null
  gammaResult: ForecastResult | null
  bootstrapResult: ForecastResult | null
  triangularResult: ForecastResult | null
  uniformResult: ForecastResult | null
  forecastMode: ForecastMode
  completedSprintCount: number
  onPercentileChange: (percentile: number) => void
  selectorRef?: RefObject<HTMLDivElement | null>
  milestones?: Milestone[]
  /** 1:1 with `milestones`. Completed milestones are not offered — the same rule as the chart pickers. */
  milestoneCompletionInfo?: MilestoneCompletionInfo[]
  selectedMilestoneIndex?: number
  onMilestoneIndexChange?: (index: number) => void
  /** The run's Entire Project scope, offered last as "Entire Project (Total)" — null when it has none. */
  projectScopeIndex?: number | null
  // Second slider props
  percentile2?: number
  truncatedNormalResult2?: ForecastResult | null
  lognormalResult2?: ForecastResult | null
  gammaResult2?: ForecastResult | null
  bootstrapResult2?: ForecastResult | null
  triangularResult2?: ForecastResult | null
  uniformResult2?: ForecastResult | null
  onPercentile2Change?: (percentile: number) => void
}

interface DistCard {
  label: string
  result: ForecastResult | null
}

const RESULT_PROP_MAP: Record<DistributionType, keyof PercentileSelectorProps> = {
  truncatedNormal: 'truncatedNormalResult',
  lognormal: 'lognormalResult',
  gamma: 'gammaResult',
  bootstrap: 'bootstrapResult',
  triangular: 'triangularResult',
  uniform: 'uniformResult',
}

const RESULT_PROP_MAP_2: Record<DistributionType, keyof PercentileSelectorProps> = {
  truncatedNormal: 'truncatedNormalResult2',
  lognormal: 'lognormalResult2',
  gamma: 'gammaResult2',
  bootstrap: 'bootstrapResult2',
  triangular: 'triangularResult2',
  uniform: 'uniformResult2',
}

function getDistCards(
  forecastMode: ForecastMode,
  props: PercentileSelectorProps,
  propMap: Record<DistributionType, keyof PercentileSelectorProps>,
  enabledDistributions?: readonly DistributionType[]
): DistCard[] {
  const hasBootstrap = props.bootstrapResult !== null
  return getVisibleDistributions(forecastMode, hasBootstrap, enabledDistributions).map((key) => ({
    label: DISTRIBUTION_LABELS[key],
    result: props[propMap[key]] as ForecastResult | null,
  }))
}

function PercentileSliderRow({
  sliderNumber,
  percentile,
  cards,
  completedSprintCount,
  onPercentileChange,
}: {
  sliderNumber: number
  percentile: number
  cards: DistCard[]
  completedSprintCount: number
  onPercentileChange: (percentile: number) => void
}) {
  const baseResult = cards[0]?.result
  const hasResults = cards.every((c) => c.result !== null)
  const sliderId = `customPercentile${sliderNumber === 1 ? '' : '2'}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2">
          <label htmlFor={sliderId} className="text-sm font-medium">
            Select Percentile {sliderNumber} (P{MIN_PERCENTILE}-P{MAX_PERCENTILE})
          </label>
          <div className="flex items-center gap-4">
            <input
              id={sliderId}
              type="range"
              min={MIN_PERCENTILE}
              max={MAX_PERCENTILE}
              value={percentile}
              onChange={(e) => onPercentileChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-right text-sm font-medium">P{percentile}</span>
          </div>
        </div>
      </div>

      {hasResults && (
        <div className={cn('grid gap-4', {
          'sm:grid-cols-3': cards.length === 3,
          'sm:grid-cols-4': cards.length === 4,
          'sm:grid-cols-5': cards.length === 5,
        })}>
          {cards.map((card, idx) => {
            const result = card.result!
            const isDiff = idx > 0 && baseResult && result.finishDate !== baseResult.finishDate
            return (
              <div key={card.label} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {card.label}
                </p>
                <div
                  className={cn(
                    'rounded-lg bg-muted/50 p-3',
                    isDiff && 'border-l-[3px] border-l-spert-blue'
                  )}
                >
                  <p className="text-sm text-muted-foreground">Finish Date</p>
                  <p
                    className={cn(
                      'text-base font-semibold',
                      isDiff && 'text-spert-blue'
                    )}
                  >
                    {formatDate(result.finishDate)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sprint {result.sprintsRequired + completedSprintCount}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PercentileSelector(props: PercentileSelectorProps) {
  const {
    percentile,
    forecastMode,
    completedSprintCount,
    onPercentileChange,
    selectorRef,
    milestones = [],
    milestoneCompletionInfo = [],
    selectedMilestoneIndex = 0,
    onMilestoneIndexChange,
    projectScopeIndex = null,
    percentile2,
    onPercentile2Change,
  } = props

  const distributionsEnabled = useSettingsStore((s) => s.distributionsEnabled)

  const cards1 = getDistCards(forecastMode, props, RESULT_PROP_MAP, distributionsEnabled)
  const cards2 = percentile2 !== undefined ? getDistCards(forecastMode, props, RESULT_PROP_MAP_2, distributionsEnabled) : []
  const hasResults = cards1.every((c) => c.result !== null)
  const hasSecondSlider = percentile2 !== undefined && onPercentile2Change !== undefined

  // The same options as the chart pickers, from the same builder. This picker
  // kept its own filter until v0.44.1 and never learned to hide completed
  // milestones — see buildMilestonePickerOptions in ../lib/milestones.
  const options = useMemo(
    () => buildMilestonePickerOptions(milestones, milestoneCompletionInfo, projectScopeIndex),
    [milestones, milestoneCompletionInfo, projectScopeIndex]
  )

  // Move a selection the picker no longer offers to its LAST option — see
  // pickerFallback for why not the first.
  useEffect(() => {
    if (!onMilestoneIndexChange) return
    if (options.some((o) => o.value === selectedMilestoneIndex)) return
    const fallback = pickerFallback(options)
    if (fallback !== null) onMilestoneIndexChange(fallback)
  }, [options, selectedMilestoneIndex, onMilestoneIndexChange])

  return (
    <div className="relative">
      <div ref={selectorRef} className="space-y-4 rounded-lg border border-border dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <h3 className="font-medium dark:text-gray-100">
            Custom Percentile{hasSecondSlider ? 's' : ''}
          </h3>
          {options.length > 0 && onMilestoneIndexChange && (
            <select
              name="customPercentileMilestone"
              value={selectedMilestoneIndex}
              onChange={(e) => onMilestoneIndexChange(Number(e.target.value))}
              className="text-sm border border-spert-border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
              aria-label="Select milestone for custom percentile"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* First slider */}
        <PercentileSliderRow
          sliderNumber={1}
          percentile={percentile}
          cards={cards1}
          completedSprintCount={completedSprintCount}
          onPercentileChange={onPercentileChange}
        />

        {/* Second slider */}
        {hasSecondSlider && (
          <>
            <hr className="border-border dark:border-gray-700" />
            <PercentileSliderRow
              sliderNumber={2}
              percentile={percentile2}
              cards={cards2}
              completedSprintCount={completedSprintCount}
              onPercentileChange={onPercentile2Change}
            />
          </>
        )}
      </div>
      {selectorRef && hasResults && (
        <div className="absolute top-2 right-2">
          <CopyImageButton
            targetRef={selectorRef}
            title="Copy custom percentile as image"
          />
        </div>
      )}
    </div>
  )
}
