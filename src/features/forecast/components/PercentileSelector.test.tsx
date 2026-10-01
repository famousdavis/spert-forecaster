// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Custom Percentile picker offers what the chart pickers offer (v0.44.1).
//
// It kept its own copy of the milestone filter, and the copies drifted: when
// v0.32.1 hid completed milestones from the CDF and Histogram pickers, this
// one kept offering them. Picking a completed milestone showed its forecast —
// a threshold of zero, so the first forecast sprint — and with a chart open,
// the chart's own picker snapped the choice straight back.

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PercentileSelector } from './PercentileSelector'
import type { Milestone } from '@/shared/types'
import { computeMilestoneCompletionInfo } from '../lib/milestones'

function ms(sizes: number[]): Milestone[] {
  return sizes.map((backlogSize, i) => ({
    id: `m${i}`, name: ['MVP', 'Beta', 'GA'][i], backlogSize,
    color: '#10b981', createdAt: '', updatedAt: '',
  }))
}

function renderSelector(milestones: Milestone[], selectedMilestoneIndex: number, projectScopeIndex: number | null = null) {
  const onMilestoneIndexChange = vi.fn()
  const view = render(
    <PercentileSelector
      percentile={85}
      truncatedNormalResult={null}
      lognormalResult={null}
      gammaResult={null}
      bootstrapResult={null}
      triangularResult={null}
      uniformResult={null}
      forecastMode="history"
      completedSprintCount={8}
      onPercentileChange={vi.fn()}
      milestones={milestones}
      milestoneCompletionInfo={computeMilestoneCompletionInfo(milestones)}
      selectedMilestoneIndex={selectedMilestoneIndex}
      onMilestoneIndexChange={onMilestoneIndexChange}
      projectScopeIndex={projectScopeIndex}
    />
  )
  const select = view.container.querySelector('select[name="customPercentileMilestone"]') as HTMLSelectElement | null
  const options = select ? [...select.options].map((o) => [Number(o.value), o.text] as const) : []
  return { onMilestoneIndexChange, options }
}

describe('PercentileSelector — milestone picker', () => {
  it('does not offer a completed milestone', () => {
    const { options } = renderSelector(ms([0, 100, 150]), 2)
    expect(options).toEqual([[1, 'Beta'], [2, 'GA (Total)']])
  })

  it('moves a completed selection to the LAST visible milestone', () => {
    const { onMilestoneIndexChange } = renderSelector(ms([0, 100, 150]), 0)
    expect(onMilestoneIndexChange).toHaveBeenCalledTimes(1)
    expect(onMilestoneIndexChange).toHaveBeenCalledWith(2)
  })

  it('offers exactly what ChartToolbar offers for the same milestones', () => {
    // One helper builds both lists now; this pins that they cannot drift again.
    const { options } = renderSelector(ms([10, 30, 0]), 1)
    expect(options).toEqual([[0, 'MVP'], [1, 'Beta (Total)']])
  })
})

describe('PercentileSelector — with an Entire Project scope', () => {
  it('offers it last as the total, exactly as the chart pickers do', () => {
    const { options, onMilestoneIndexChange } = renderSelector(ms([0, 100, 150]), 3, 3)
    expect(options).toEqual([[1, 'Beta'], [2, 'GA'], [3, 'Entire Project (Total)']])
    expect(onMilestoneIndexChange).not.toHaveBeenCalled()
  })
})
