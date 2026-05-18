// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { MilestoneList } from './MilestoneList'
import type { Milestone } from '@/shared/types'

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm-1',
    name: 'MVP Release',
    backlogSize: 100,
    color: '#10b981',
    createdAt: 't',
    updatedAt: 't',
    ...overrides,
  }
}

const NOOP = () => {}

describe('MilestoneList — inline rename (v0.33.5)', () => {
  it('renders the milestone name as a click-to-rename button when onRename is provided', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'MVP Release' })
    expect(trigger.getAttribute('title')).toBe('Click to rename')
  })

  it('falls back to plain text when onRename is not provided (backward compatibility)', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
      />,
    )
    // No click-to-rename button when the feature is unwired.
    expect(screen.queryByRole('button', { name: 'MVP Release' })).toBeNull()
    expect(screen.getByText('MVP Release')).not.toBeNull()
  })

  it('swaps to a text input on click and focuses it', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' }) as HTMLInputElement
    expect(input.value).toBe('MVP Release')
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('maxLength')).toBe('50')
    expect(input.getAttribute('name')).toBe('milestoneName')
  })

  it('Enter commits a changed, non-empty trimmed value via onRename', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: '  Renamed Milestone  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('m-1', 'Renamed Milestone')
    // Editor exits.
    expect(screen.queryByRole('textbox', { name: 'Rename MVP Release' })).toBeNull()
  })

  it('Escape reverts without calling onRename', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: 'Half-typed' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    // Editor exits; the original name is back as a button.
    expect(screen.queryByRole('textbox', { name: 'Rename MVP Release' })).toBeNull()
    expect(screen.getByRole('button', { name: 'MVP Release' })).not.toBeNull()
  })

  it('blur saves when the trimmed value is non-empty and changed', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: 'Renamed via blur' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('m-1', 'Renamed via blur')
  })

  it('blur reverts when the trimmed value is empty (forgiving fallback, no save)', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    fireEvent.change(input, { target: { value: '   ' } }) // whitespace-only
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
    // Original name is restored as the click trigger.
    expect(screen.getByRole('button', { name: 'MVP Release' })).not.toBeNull()
  })

  it('blur is a no-op when the value is unchanged (no spurious save)', () => {
    const onRename = vi.fn()
    render(
      <MilestoneList
        milestones={[makeMilestone({ name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const input = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    // No edit; blur immediately.
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
  })

  it('disables the click-to-rename target while the row is in full-form edit (no double-edit affordance)', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone({ id: 'm-1', name: 'MVP Release' })]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        editingId="m-1"
      />,
    )
    // No rename button while the row is in full-form edit; name shows as plain text.
    expect(screen.queryByRole('button', { name: 'MVP Release' })).toBeNull()
    expect(screen.getByText('MVP Release')).not.toBeNull()
  })

  it('each row gets a unique input id when multiple milestones are in the list (form-hygiene rule 5)', () => {
    render(
      <MilestoneList
        milestones={[
          makeMilestone({ id: 'm-1', name: 'MVP Release' }),
          makeMilestone({ id: 'm-2', name: 'Beta Release' }),
        ]}
        unitOfMeasure="story points"
        onEdit={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'MVP Release' }))
    const inputA = screen.getByRole('textbox', { name: 'Rename MVP Release' })
    const idA = inputA.getAttribute('id')
    expect(idA).toBeTruthy()
    expect(idA?.endsWith('m-1')).toBe(true)
    // Escape out and switch to the other row.
    fireEvent.keyDown(inputA, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Beta Release' }))
    const inputB = screen.getByRole('textbox', { name: 'Rename Beta Release' })
    const idB = inputB.getAttribute('id')
    expect(idB).toBeTruthy()
    expect(idB?.endsWith('m-2')).toBe(true)
    expect(idA).not.toBe(idB)
  })
})
