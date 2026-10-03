// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REFUSAL_TEMPLATES, explainRefusal, describeImportRefusal, displayName, NAME_DISPLAY_LENGTH } from './refusal-reasons'
import { validateImportData } from './import-validation'

const VALIDATOR_SOURCE = readFileSync(join(import.meta.dirname, 'import-validation.ts'), 'utf8')

/** Every `throw new Error('…')` / `` `…` `` argument in the validator, in source order (as C4 reads them). */
function throwTemplates(source: string): string[] {
  return [...source.matchAll(/throw new Error\(\s*([`'])([\s\S]*?)\1\s*\)/g)].map((m) => m[2])
}

/** A concrete message for a template, the way the validator would fill it. */
const HOLE_VALUES: Record<string, string> = {
  i: '0', j: '0', 'p.id': 'dup', 'm.id': 'dup', 's.id': 'dup', limit: '10',
  MAX_STRING_LENGTH: '200', MAX_NUMERIC_VALUE: '999999', MIN_SPRINT_NUMBER: '1', MAX_SPRINT_NUMBER: '10000',
}
const concrete = (template: string): string => template.replace(/\$\{([^}]*)\}/g, (_, h: string) => HOLE_VALUES[h])

describe('the translator covers the validator — both directions', () => {
  it('finds the validator\'s throws at all (guards a vacuous pass)', () => {
    expect(throwTemplates(VALIDATOR_SOURCE)).toHaveLength(33)
  })

  it('has one entry per throw, and no entry without a throw, in source order', () => {
    expect([...REFUSAL_TEMPLATES]).toEqual(throwTemplates(VALIDATOR_SOURCE))
  })

  it.each(throwTemplates(VALIDATOR_SOURCE))('%s — matches exactly one entry, and its reason names no position', (template) => {
    const message = concrete(template)
    const matching = REFUSAL_TEMPLATES.filter((t) => concrete(t) === message)
    expect(matching).toEqual([template])
    const x = explainRefusal(message, { projects: [], sprints: [] })
    expect(x).not.toBeNull()
    expect(x!.reason).not.toMatch(/index/i)
    expect(x!.reason).not.toMatch(/\.$/)
  })

  it('returns null for a message that is not the validator\'s', () => {
    expect(explainRefusal('Something else entirely.', {})).toBeNull()
  })
})

describe('reasons in the user\'s words — the approved texts', () => {
  const file = (projects: unknown[], sprints: unknown[] = []) => ({ projects, sprints })
  const refusalOf = (payload: unknown): string => {
    try { validateImportData(payload) } catch (e) { return (e as Error).message }
    throw new Error('expected a refusal')
  }

  it('a long project name', () => {
    const payload = file([{ id: 'a', name: 'N'.repeat(245), unitOfMeasure: 'pts' }])
    expect(explainRefusal(refusalOf(payload), payload)).toEqual({
      scope: 'project', projectName: 'N'.repeat(245), sprintNumber: undefined,
      reason: 'Project name is 245 characters; the most allowed is 200',
    })
  })

  it('too many milestones — this app\'s own file, and any other file', () => {
    const ms = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `m${k}`, name: `M${k}`, backlogSize: 1, color: '#000' }))
    const own = { ...file([{ id: 'g', name: 'Gamma', unitOfMeasure: 'pts', milestones: ms(101) }]), _originRef: 'o', _storageRef: 's' }
    expect(explainRefusal(refusalOf(own), own)!.reason).toBe('101 milestones; a file from this app holds at most 100')
    const other = file([{ id: 'g', name: 'Growth Product', unitOfMeasure: 'pts', milestones: ms(13) }])
    expect(explainRefusal(refusalOf(other), other)!.reason).toBe('13 milestones; this file can hold at most 10 per project')
  })

  it('a five-digit year — as the form stores it (F32) and after an Update (F33)', () => {
    const sprint = { id: 's', projectId: 'b', sprintNumber: 3, doneValue: 1, includedInForecast: true }
    const f32 = file([{ id: 'b', name: 'Beta', unitOfMeasure: 'pts' }], [{ ...sprint, sprintFinishDate: '20276-09-04', customFinishDate: '20276-09-04' }])
    expect(explainRefusal(refusalOf(f32), f32)).toMatchObject({ scope: 'sprint', projectName: 'Beta', sprintNumber: 3, reason: 'Finish Date "20276-09-04" is not a valid date' })
    const f33 = file([{ id: 'b', name: 'Beta', unitOfMeasure: 'pts' }], [{ ...sprint, sprintFinishDate: '2026-09-04', customFinishDate: '20276-09-04' }])
    expect(explainRefusal(refusalOf(f33), f33)!.reason).toBe('Finish Date "20276-09-04" is not a valid date')
  })

  it('a figure over the maximum is quoted with its value', () => {
    const payload = file([{ id: 'f', name: 'Figure', unitOfMeasure: 'pts', milestones: [{ id: 'm', name: 'M1', backlogSize: 1_200_000, color: '#000' }] }])
    expect(explainRefusal(refusalOf(payload), payload)!.reason).toBe('Remaining Work for milestone "M1" is 1,200,000; the most allowed is 999,999')
  })

  it('two sprints sharing an id belong to the file as a whole', () => {
    const s = { projectId: 'a', sprintNumber: 1, doneValue: 1, includedInForecast: true }
    const payload = file([{ id: 'a', name: 'A', unitOfMeasure: 'pts' }], [{ ...s, id: 's1' }, { ...s, id: 's1' }])
    expect(explainRefusal(refusalOf(payload), payload)).toMatchObject({ scope: 'file', projectName: undefined, reason: 'two sprints share the ID "s1"' })
  })
})

describe('describeImportRefusal — names the project the THROWN error belongs to', () => {
  it('a sprint refusal names that sprint\'s project, never projects[i]', () => {
    // The bad sprint is at index 0, and projects[0] is a DIFFERENT, valid project.
    const payload = {
      projects: [{ id: 'first', name: 'First', unitOfMeasure: 'pts' }, { id: 'second', name: 'Second', unitOfMeasure: 'pts' }],
      sprints: [{ id: 's', projectId: 'second', sprintNumber: 1, doneValue: 1, includedInForecast: true, sprintFinishDate: '20276-09-04' }],
    }
    let message = ''
    try { validateImportData(payload) } catch (e) { message = (e as Error).message }
    expect(message).toBe('Sprint at index 0 has invalid sprintFinishDate (must be YYYY-MM-DD format).')
    expect(describeImportRefusal(message, payload))
      .toBe('Import failed: "Second", sprint 1 — Finish Date "20276-09-04" is not a valid date.')
  })

  it('a project refusal uses the approved template', () => {
    const ms = Array.from({ length: 13 }, (_, k) => ({ id: `m${k}`, name: `M${k}`, backlogSize: 1, color: '#000' }))
    const payload = { projects: [{ id: 'g', name: 'Growth Product', unitOfMeasure: 'pts', milestones: ms }], sprints: [] }
    expect(describeImportRefusal('Project at index 0 has more than 10 milestones.', payload))
      .toBe('Import failed: "Growth Product" — 13 milestones; this file can hold at most 10 per project.')
  })

  it('an unattributable refusal keeps the validator\'s text', () => {
    const message = 'Duplicate project ID "x" found at index 1.'
    expect(describeImportRefusal(message, { projects: [], sprints: [] })).toBe(`Import failed: ${message}`)
    expect(describeImportRefusal('Validation error', {})).toBe('Import failed: Validation error')
  })

  it('a long name is shortened for display', () => {
    expect(displayName('x'.repeat(NAME_DISPLAY_LENGTH + 5))).toBe(`${'x'.repeat(NAME_DISPLAY_LENGTH)}…`)
    expect(displayName('Alpha')).toBe('Alpha')
  })
})
