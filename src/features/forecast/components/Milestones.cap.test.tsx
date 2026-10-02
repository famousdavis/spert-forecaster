// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Milestones panel at and above its add cap. Hand-adding stops at
 * MAX_MILESTONES; a project can still hold more, brought in by Story Map
 * Updates. The panel says so, and keeps its readability advice visible.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Milestones } from './Milestones'
import { ProductivityAdjustments } from './ProductivityAdjustments'
import { useProjectStore } from '@/shared/state/project-store'
import { MAX_MILESTONES, MILESTONE_SOFT_LIMIT } from '../constants'

const T = '2026-01-01T00:00:00.000Z'
const NOTICE =
  `You can add up to ${MAX_MILESTONES} milestones by hand — more than that makes the charts hard to read. ` +
  `The + Add Milestone button comes back when this project has fewer than ${MAX_MILESTONES}. ` +
  'Story Map updates can still bring in more, and the project keeps them.'
const advice = (n: number) => `You have ${n} milestones. Consider keeping it under ${MILESTONE_SOFT_LIMIT} for best chart readability.`

function seed(milestones: number, adjustments = 0): void {
  useProjectStore.setState({
    projects: [{
      id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T,
      milestones: Array.from({ length: milestones }, (_, k) => ({ id: `m${k}`, name: `M${k + 1}`, backlogSize: 5, color: '#3b82f6', showOnChart: true, createdAt: T, updatedAt: T })),
      productivityAdjustments: Array.from({ length: adjustments }, (_, k) => ({ id: `a${k}`, name: `A${k + 1}`, startDate: '2026-01-05', endDate: '2026-01-09', factor: 0.5, enabled: true, createdAt: T, updatedAt: T })),
    }],
    sprints: [],
  })
}

function openMilestones(count: number): HTMLElement {
  render(<Milestones projectId="p" unitOfMeasure="pts" />)
  fireEvent.click(screen.getByRole('button', { name: `Milestones (${count})` }))
  return screen.getByRole('region', { name: 'Milestones' })
}

afterEach(() => cleanup())

describe('the Milestones panel at and above the add cap', () => {
  it.each([MAX_MILESTONES, MAX_MILESTONES + 3])('at %i: explains the cap, keeps the advice, offers no add button', (n) => {
    seed(n)
    const panel = openMilestones(n)
    const text = panel.textContent ?? ''
    expect(text).toContain(NOTICE)
    expect(text).toContain(advice(n))
    expect(text.indexOf(NOTICE)).toBeLessThan(text.indexOf(advice(n)))
    expect(text).not.toContain('Maximum of')
    expect(screen.queryByRole('button', { name: '+ Add Milestone' })).toBeNull()
  })

  it('below the cap: the add button, the advice, and no notice', () => {
    seed(MAX_MILESTONES - 1)
    const panel = openMilestones(MAX_MILESTONES - 1)
    expect(screen.getByRole('button', { name: '+ Add Milestone' })).toBeTruthy()
    expect(panel.textContent).toContain(advice(MAX_MILESTONES - 1))
    expect(panel.textContent).not.toContain('You can add up to')
  })

  it('leaves Productivity Adjustments as it was: no cap, no advice, no notice, at any count', () => {
    seed(0, MAX_MILESTONES + 3)
    render(<ProductivityAdjustments projectId="p" />)
    fireEvent.click(screen.getByRole('button', { name: /^Productivity Adjustments/ }))
    expect(screen.getByRole('button', { name: '+ Add Adjustment' })).toBeTruthy()
    const text = screen.getByRole('region').textContent ?? ''
    expect(text).not.toContain('Maximum of')
    expect(text).not.toContain('You can add up to')
    expect(text).not.toContain('chart readability')
  })
})
