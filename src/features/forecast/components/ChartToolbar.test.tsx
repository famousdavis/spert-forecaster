// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ChartToolbar } from './ChartToolbar'
import type { Milestone } from '@/shared/types'
import { computeMilestoneCompletionInfo } from '../lib/milestones'

function ms(sizes: number[], hidden: number[] = []): Milestone[] {
  return sizes.map((backlogSize, i) => ({
    id: `m${i}`, name: ['MVP', 'Beta', 'GA', 'v2'][i], backlogSize,
    color: '#10b981', showOnChart: !hidden.includes(i), createdAt: '', updatedAt: '',
  }))
}

function renderToolbar(milestones: Milestone[], selectedMilestoneIndex: number, projectScopeIndex: number | null = null) {
  const onMilestoneIndexChange = vi.fn()
  const view = render(
    <ChartToolbar
      idPrefix="cdf"
      milestones={milestones}
      milestoneCompletionInfo={computeMilestoneCompletionInfo(milestones)}
      selectedMilestoneIndex={selectedMilestoneIndex}
      onMilestoneIndexChange={onMilestoneIndexChange}
      projectScopeIndex={projectScopeIndex}
    />
  )
  const select = view.container.querySelector('select#cdf-milestone-select') as HTMLSelectElement | null
  const options = select ? [...select.options].map((o) => [Number(o.value), o.text] as const) : []
  return { onMilestoneIndexChange, options }
}

describe('ChartToolbar — milestone picker', () => {
  it('offers charted, not-completed milestones, with "(Total)" on the last', () => {
    const { options } = renderToolbar(ms([10, 30, 0]), 1)
    expect(options).toEqual([[0, 'MVP'], [1, 'Beta (Total)']])
  })

  it('moves an invalid selection to the LAST visible milestone, not the first', () => {
    // After a run the selection is the last scope — here GA, which is complete.
    // The last visible milestone (Beta) shares GA's cumulative threshold, so
    // the chart still shows the "(Total)"; the first (MVP) is a different
    // forecast entirely.
    const { onMilestoneIndexChange } = renderToolbar(ms([10, 30, 0]), 2)
    expect(onMilestoneIndexChange).toHaveBeenCalledTimes(1)
    expect(onMilestoneIndexChange).toHaveBeenCalledWith(1)
  })

  it('leaves a valid selection alone', () => {
    const { onMilestoneIndexChange } = renderToolbar(ms([10, 30, 20]), 0)
    expect(onMilestoneIndexChange).not.toHaveBeenCalled()
  })

  it('treats a chart-hidden milestone like a completed one', () => {
    // Values only: which option carries "(Total)" when a milestone with work
    // left is hidden is not settled by this test.
    const { options, onMilestoneIndexChange } = renderToolbar(ms([10, 30, 20], [2]), 2)
    expect(options.map(([value]) => value)).toEqual([0, 1])
    expect(onMilestoneIndexChange).toHaveBeenCalledWith(1)
  })
})

describe('ChartToolbar — with an Entire Project scope', () => {
  it('offers it last as the total, and keeps a selection on it', () => {
    const { options, onMilestoneIndexChange } = renderToolbar(ms([10, 30]), 2, 2)
    expect(options).toEqual([[0, 'MVP'], [1, 'Beta'], [2, 'Entire Project (Total)']])
    expect(onMilestoneIndexChange).not.toHaveBeenCalled()
  })

  it('moves an invalid selection to it', () => {
    const { onMilestoneIndexChange } = renderToolbar(ms([10, 30, 0]), 2, 3)
    expect(onMilestoneIndexChange).toHaveBeenCalledWith(3)
  })
})
