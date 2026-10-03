// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A milestone's Remaining Work stays within 0 to MAX_NUMERIC_VALUE, so no
 * milestone this form saves is refused when its file comes back.
 *
 * Two guards, each tested on its own: `max` (the wiring, which a browser
 * checks only on submit) and `isValid`, which keeps the button disabled —
 * including for an edit form pre-filled with a figure already over the limit.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MilestoneForm } from './MilestoneForm'
import { MAX_NUMERIC_VALUE } from '@/shared/state/import-limits'
import { validateImportData } from '@/shared/state/import-validation'
import type { Milestone } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
type Submitted = Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>
const milestone = (backlogSize: number): Milestone =>
  ({ id: 'm', name: 'MVP', backlogSize, color: '#3b82f6', createdAt: T, updatedAt: T })

function renderForm(m: Milestone | null) {
  const onSubmit = vi.fn<(data: Submitted) => void>()
  render(<MilestoneForm milestone={m} existingCount={0} unitOfMeasure="pts" onSubmit={onSubmit} onCancel={() => {}} />)
  return {
    onSubmit,
    figure: screen.getByLabelText(/Remaining Work/) as HTMLInputElement,
    button: screen.getByRole('button', { name: m ? 'Update' : 'Add' }) as HTMLButtonElement,
  }
}

/** What the form saved, inside a project, as a file the import validator judges. */
const verdict = (data: Submitted): string => {
  try {
    validateImportData({
      version: '1.0', exportedAt: T, sprints: [],
      projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T, milestones: [{ ...data, id: 'm', createdAt: T, updatedAt: T }] }],
    })
    return 'accepted'
  } catch (e) {
    return (e as Error).message
  }
}

afterEach(() => cleanup())

describe('MilestoneForm keeps Remaining Work within MAX_NUMERIC_VALUE', () => {
  it('the input carries max = MAX_NUMERIC_VALUE (and min = 0)', () => {
    const { figure } = renderForm(null)
    expect(figure.max).toBe(String(MAX_NUMERIC_VALUE))
    expect(figure.min).toBe('0')
  })

  it('an edit form pre-filled with a figure one over the limit cannot be saved', () => {
    const { onSubmit, button } = renderForm(milestone(MAX_NUMERIC_VALUE + 1))
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('an edit form pre-filled with a figure AT the limit saves it, and the validator accepts it', () => {
    const { onSubmit, button } = renderForm(milestone(MAX_NUMERIC_VALUE))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].backlogSize).toBe(MAX_NUMERIC_VALUE)
    expect(verdict(onSubmit.mock.calls[0][0])).toBe('accepted')
  })

  it('a figure changed to one over the limit disables Add; back to the limit enables it', () => {
    const { figure, button } = renderForm(null)
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'MVP' } })
    fireEvent.change(figure, { target: { value: String(MAX_NUMERIC_VALUE + 1) } })
    expect(button.disabled).toBe(true)
    fireEvent.change(figure, { target: { value: '1e7' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(figure, { target: { value: String(MAX_NUMERIC_VALUE) } })
    expect(button.disabled).toBe(false)
  })

  it('without the guard, the figure would be refused on re-import (the case this closes)', () => {
    expect(verdict({ name: 'MVP', backlogSize: MAX_NUMERIC_VALUE + 1, color: '#3b82f6' }))
      .toBe(`Project 0, milestone at index 0 has invalid backlogSize (must be >= 0 and <= ${MAX_NUMERIC_VALUE}).`)
  })

  it('form hygiene: the figure has an id its label points at, the id is unique, no autocomplete', () => {
    const { figure } = renderForm(null)
    expect(figure.id).toBe('milestoneBacklog')
    expect(document.querySelector(`label[for="${figure.id}"]`)).not.toBeNull()
    expect(document.querySelectorAll(`[id="${figure.id}"]`)).toHaveLength(1)
    expect(figure.getAttribute('autocomplete')).toBeNull()
  })
})
