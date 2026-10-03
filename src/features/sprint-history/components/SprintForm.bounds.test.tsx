// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SprintForm saves nothing the import validator refuses:
 * - Done and Backlog at End stay within 0 to MAX_NUMERIC_VALUE;
 * - the Finish Date passes the validator's own date rule (`isValidIsoDate`),
 *   so a five-digit year — which passes the form's ≥-start-date string
 *   comparison — is refused.
 *
 * Two guards per input, each tested on its own: the attribute (the wiring; a
 * browser checks `min`/`max` only on submit) and `isValid`, which keeps the
 * button disabled — including for an edit form pre-filled with a stored value
 * that is already out of bounds.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SprintForm } from './SprintForm'
import { MAX_NUMERIC_VALUE } from '@/shared/state/import-limits'
import { validateImportData, isValidIsoDate, MAX_ISO_DATE } from '@/shared/state/import-validation'
import type { Project, Sprint } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
// Sprint 1 starts Monday 2026-01-05; with a 2-week cadence it computes to Friday 2026-01-16.
const PROJECT: Project = { id: 'p', name: 'P', unitOfMeasure: 'pts', firstSprintStartDate: '2026-01-05', sprintCadenceWeeks: 2, createdAt: T, updatedAt: T }
const COMPUTED_FINISH = '2026-01-16'
type Submitted = Omit<Sprint, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
const sprint = (over: Partial<Sprint>): Sprint => ({
  id: 's1', projectId: 'p', sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: COMPUTED_FINISH,
  doneValue: 10, includedInForecast: true, createdAt: T, updatedAt: T, ...over,
})

function renderForm(s: Sprint | null) {
  const onSubmit = vi.fn<(data: Submitted) => void>()
  render(
    <SprintForm sprint={s} project={PROJECT} existingSprintCount={s ? 1 : 0} allSprints={s ? [s] : []} onSubmit={onSubmit} onCancel={() => {}} />,
  )
  return {
    onSubmit,
    done: screen.getByLabelText(/Done this sprint/) as HTMLInputElement,
    backlog: screen.getByLabelText(/Backlog at End/) as HTMLInputElement,
    finish: screen.getByLabelText('Finish Date') as HTMLInputElement,
    button: screen.getByRole('button', { name: s ? 'Update' : 'Add' }) as HTMLButtonElement,
  }
}

/** What the form saved, as sprint 1 of a file the import validator judges. */
const verdict = (data: Submitted): string => {
  try {
    validateImportData({
      version: '1.0', exportedAt: T, projects: [PROJECT],
      sprints: [{ ...data, id: 's1', projectId: 'p', createdAt: T, updatedAt: T }],
    })
    return 'accepted'
  } catch (e) {
    return (e as Error).message
  }
}

afterEach(() => cleanup())

describe('SprintForm keeps Done and Backlog at End within MAX_NUMERIC_VALUE', () => {
  it('both inputs carry max = MAX_NUMERIC_VALUE (and min = 0)', () => {
    const { done, backlog } = renderForm(null)
    for (const input of [done, backlog]) {
      expect(input.max).toBe(String(MAX_NUMERIC_VALUE))
      expect(input.min).toBe('0')
    }
  })

  it.each([
    ['Done', { doneValue: MAX_NUMERIC_VALUE + 1 }],
    ['Backlog at End', { backlogAtSprintEnd: MAX_NUMERIC_VALUE + 1 }],
    ['Backlog at End (negative)', { backlogAtSprintEnd: -1 }],
  ] as const)('an edit form pre-filled with %s out of bounds cannot be saved', (_label, over) => {
    const { onSubmit, button } = renderForm(sprint(over))
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('an edit form pre-filled with both AT the limit saves them, and the validator accepts them', () => {
    const { onSubmit, button } = renderForm(sprint({ doneValue: MAX_NUMERIC_VALUE, backlogAtSprintEnd: MAX_NUMERIC_VALUE }))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    const saved = onSubmit.mock.calls[0][0]
    expect([saved.doneValue, saved.backlogAtSprintEnd]).toEqual([MAX_NUMERIC_VALUE, MAX_NUMERIC_VALUE])
    expect(verdict(saved)).toBe('accepted')
  })

  it.each(['done', 'backlog'] as const)('%s changed to one over the limit disables Add; back to the limit enables it', (which) => {
    const inputs = renderForm(null)
    fireEvent.change(inputs.done, { target: { value: '5' } })
    expect(inputs.button.disabled).toBe(false)
    fireEvent.change(inputs[which], { target: { value: String(MAX_NUMERIC_VALUE + 1) } })
    expect(inputs.button.disabled).toBe(true)
    fireEvent.change(inputs[which], { target: { value: String(MAX_NUMERIC_VALUE) } })
    expect(inputs.button.disabled).toBe(false)
  })

  it('without the guard, the figure would be refused on re-import (the case this closes)', () => {
    expect(verdict({ sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: COMPUTED_FINISH, doneValue: MAX_NUMERIC_VALUE + 1, includedInForecast: true }))
      .toBe(`Sprint at index 0 has invalid doneValue (must be 0-${MAX_NUMERIC_VALUE}).`)
  })
})

describe('SprintForm applies the validator\'s date rule to the Finish Date', () => {
  it('max is MAX_ISO_DATE, the latest date the rule accepts: the rule takes it, and refuses the day after', () => {
    const { finish } = renderForm(null)
    expect(finish.max).toBe(MAX_ISO_DATE)
    expect(MAX_ISO_DATE).toBe('9999-12-31')
    expect(isValidIsoDate(MAX_ISO_DATE)).toBe(true)
    expect(isValidIsoDate('10000-01-01')).toBe(false)
  })

  it('an edit form pre-filled with a five-digit year cannot be saved until the date is fixed', () => {
    const bad = '20276-01-16'
    const { onSubmit, finish, button } = renderForm(sprint({ sprintFinishDate: bad, customFinishDate: bad }))
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(finish, { target: { value: '2026-01-20' } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    const saved = onSubmit.mock.calls[0][0]
    expect([saved.sprintFinishDate, saved.customFinishDate]).toEqual(['2026-01-20', '2026-01-20'])
    expect(verdict(saved)).toBe('accepted')
  })

  it.each([
    ['a five-digit year', '20276-01-16', true],
    ['the day after MAX_ISO_DATE', '10000-01-01', true],
    ['MAX_ISO_DATE itself', MAX_ISO_DATE, false],
    ['an ordinary later date', '2026-01-20', false],
  ] as const)('a Finish Date changed to %s: disabled = %s', (_label, value, disabled) => {
    const { done, finish, button } = renderForm(null)
    fireEvent.change(done, { target: { value: '5' } })
    fireEvent.change(finish, { target: { value } })
    expect(finish.value).toBe(value)
    expect(button.disabled).toBe(disabled)
  })

  it('a date the rule accepts saves, and the validator accepts the sprint (MAX_ISO_DATE included)', () => {
    const { onSubmit, done, finish, button } = renderForm(null)
    fireEvent.change(done, { target: { value: '5' } })
    fireEvent.change(finish, { target: { value: MAX_ISO_DATE } })
    fireEvent.click(button)
    const saved = onSubmit.mock.calls[0][0]
    expect([saved.sprintFinishDate, saved.customFinishDate]).toEqual([MAX_ISO_DATE, MAX_ISO_DATE])
    expect(verdict(saved)).toBe('accepted')
  })

  it('without the guard, the five-digit year passes the ≥-start comparison and is refused on re-import', () => {
    expect('20276-01-16' >= '2026-01-05').toBe(true)
    expect(verdict({ sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '20276-01-16', customFinishDate: '20276-01-16', doneValue: 5, includedInForecast: true }))
      .toBe('Sprint at index 0 has invalid sprintFinishDate (must be YYYY-MM-DD format).')
  })
})

describe('SprintForm form hygiene on the controls this release touched', () => {
  it('each has an id its label points at, the id is unique, and none carries autocomplete', () => {
    const { done, backlog, finish } = renderForm(null)
    for (const input of [done, backlog, finish]) {
      expect(input.id).not.toBe('')
      expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull()
      expect(document.querySelectorAll(`[id="${input.id}"]`)).toHaveLength(1)
      expect(input.getAttribute('autocomplete')).toBeNull()
    }
  })
})
