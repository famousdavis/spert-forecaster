// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The project name and unit of measure stay within MAX_STRING_LENGTH, so no
 * project this form saves is refused when its file comes back.
 *
 * Two guards, each tested on its own:
 * - `maxLength` (the wiring): stops TYPING past the limit. It never flags a
 *   value that arrives already over it — an edit form pre-filled from stored
 *   data is not `tooLong` — and never cuts a value set by script, as these
 *   tests set theirs.
 * - `isValid`: keeps the button disabled while either value is over. It bounds
 *   the TRIMMED length, because the form stores `trim()`.
 *
 * Typing itself is checked in the browser; see the PR's evidence.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ProjectForm } from './ProjectForm'
import { MAX_STRING_LENGTH } from '@/shared/state/import-limits'
import { validateImportData } from '@/shared/state/import-validation'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const project = (over: Partial<Project>): Project => ({ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T, ...over })
type Submitted = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>

function renderForm(p: Project | null) {
  const onSubmit = vi.fn<(data: Submitted) => void>()
  render(<ProjectForm project={p} onSubmit={onSubmit} onCancel={() => {}} />)
  return {
    onSubmit,
    name: screen.getByLabelText('Project Name') as HTMLInputElement,
    unit: screen.getByLabelText('Unit of Measure') as HTMLInputElement,
    button: screen.getByRole('button', { name: p ? 'Update Project' : 'Add Project' }) as HTMLButtonElement,
  }
}

/** What the form saved, as a file the import validator judges. */
const verdict = (data: Submitted): string => {
  try {
    validateImportData({ version: '1.0', exportedAt: T, projects: [{ ...data, id: 'p', createdAt: T, updatedAt: T }], sprints: [] })
    return 'accepted'
  } catch (e) {
    return (e as Error).message
  }
}

const FIELDS = [
  { field: 'name', over: (s: string) => ({ name: s }) },
  { field: 'unitOfMeasure', over: (s: string) => ({ unitOfMeasure: s }) },
] as const

afterEach(() => cleanup())

describe('ProjectForm keeps the name and unit within MAX_STRING_LENGTH', () => {
  it('both inputs carry maxLength = MAX_STRING_LENGTH', () => {
    const { name, unit } = renderForm(null)
    expect(name.maxLength).toBe(MAX_STRING_LENGTH)
    expect(unit.maxLength).toBe(MAX_STRING_LENGTH)
  })

  it.each(FIELDS)('an edit form pre-filled with a $field one over the limit cannot be saved', ({ over }) => {
    const { onSubmit, button } = renderForm(project(over('N'.repeat(MAX_STRING_LENGTH + 1))))
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each(FIELDS)('an edit form pre-filled with a $field AT the limit saves it, and the validator accepts it', ({ field, over }) => {
    const { onSubmit, button } = renderForm(project(over('N'.repeat(MAX_STRING_LENGTH))))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const saved = onSubmit.mock.calls[0][0]
    expect(saved[field]).toHaveLength(MAX_STRING_LENGTH)
    expect(verdict(saved)).toBe('accepted')
  })

  it.each(['Project Name', 'Unit of Measure'] as const)('a %s changed to one over the limit disables Add; back to the limit enables it', (label) => {
    const { name, button } = renderForm(null)
    fireEvent.change(name, { target: { value: 'Alpha' } })
    const input = screen.getByLabelText(label)
    fireEvent.change(input, { target: { value: 'u'.repeat(MAX_STRING_LENGTH + 1) } })
    expect(button.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'u'.repeat(MAX_STRING_LENGTH) } })
    expect(button.disabled).toBe(false)
  })

  it('bounds the TRIMMED length: surrounding spaces do not count, and the saved value is accepted', () => {
    const padded = ` ${'N'.repeat(MAX_STRING_LENGTH)} `
    const { onSubmit, button } = renderForm(project({ name: padded, unitOfMeasure: padded }))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    const saved = onSubmit.mock.calls[0][0]
    expect(saved.name).toBe('N'.repeat(MAX_STRING_LENGTH))
    expect(verdict(saved)).toBe('accepted')
  })

  it('without the guard, the pre-filled value would be refused on re-import (the case this closes)', () => {
    expect(verdict({ name: 'N'.repeat(MAX_STRING_LENGTH + 1), unitOfMeasure: 'pts' }))
      .toBe(`Project at index 0 has a name exceeding ${MAX_STRING_LENGTH} characters.`)
  })

  it('form hygiene: each control has an id its label points at, the id is unique, and app-domain fields carry no autocomplete', () => {
    const { name, unit } = renderForm(null)
    for (const input of [name, unit]) {
      expect(input.id).not.toBe('')
      expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull()
      expect(document.querySelectorAll(`[id="${input.id}"]`)).toHaveLength(1)
      expect(input.getAttribute('autocomplete')).toBeNull()
    }
  })
})
