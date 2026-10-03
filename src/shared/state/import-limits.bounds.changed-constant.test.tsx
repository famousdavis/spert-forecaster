// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * ONE STATEMENT PER LIMIT, for MAX_STRING_LENGTH and MAX_NUMERIC_VALUE. With
 * import-limits.ts mocked to different values, every site that enforces them
 * must follow: the validator's six checks, the refusal reasons, the import copy
 * and the clone truncation, and the three forms — each form's attribute and
 * its `isValid`. A site holding its own literal stays at 200 or 999,999 and
 * fails here. (The milestone limits and the file size are covered by
 * import-limits.changed-constant.test.ts.)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('./import-limits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./import-limits')>()),
  MAX_STRING_LENGTH: 30,
  MAX_NUMERIC_VALUE: 5000,
}))

import { validateImportData } from './import-validation'
import { checkExportedFile } from './export-check'
import { applyImportDecisions, type ParsedImportData, type ImportConflict, type ConflictAction } from './import-utils'
import { useProjectStore } from './project-store'
import { ProjectForm } from '@/features/projects/components/ProjectForm'
import { MilestoneForm } from '@/features/forecast/components/MilestoneForm'
import { SprintForm } from '@/features/sprint-history/components/SprintForm'
import type { Milestone, Project, Sprint } from '@/shared/types'

const LEN = 30
const FIG = 5000
const T = '2026-01-01T00:00:00.000Z'
const project = (over: Partial<Project> = {}): Project => ({ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T, ...over })
const milestone = (over: Partial<Milestone> = {}): Milestone => ({ id: 'm', name: 'M', backlogSize: 1, color: '#000', createdAt: T, updatedAt: T, ...over })
const sprint = (over: Partial<Sprint> = {}): Sprint => ({
  id: 's', projectId: 'p', sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
  doneValue: 1, includedInForecast: true, createdAt: T, updatedAt: T, ...over,
})
const file = (p: Project, sprints: Sprint[] = []) => ({ version: '1.0', exportedAt: T, projects: [p], sprints })
const verdict = (payload: unknown): string => {
  try { validateImportData(payload); return 'accepted' } catch (e) { return (e as Error).message }
}

afterEach(() => cleanup())

describe('changed MAX_STRING_LENGTH / MAX_NUMERIC_VALUE reach every enforcing site', () => {
  it.each([
    ['project name', (n: number) => file(project({ name: 'N'.repeat(n) })), `Project at index 0 has a name exceeding ${LEN} characters.`],
    ['unit of measure', (n: number) => file(project({ unitOfMeasure: 'u'.repeat(n) })), `Project at index 0 has a unitOfMeasure exceeding ${LEN} characters.`],
    ['milestone name', (n: number) => file(project({ milestones: [milestone({ name: 'R'.repeat(n) })] })), `Project 0, milestone at index 0 has a name exceeding ${LEN} characters.`],
  ] as const)('the validator: %s', (_label, at, message) => {
    expect(verdict(at(LEN))).toBe('accepted')
    expect(verdict(at(LEN + 1))).toBe(message)
  })

  it.each([
    ['milestone figure', (v: number) => file(project({ milestones: [milestone({ backlogSize: v })] })), `Project 0, milestone at index 0 has invalid backlogSize (must be >= 0 and <= ${FIG}).`],
    ['done value', (v: number) => file(project(), [sprint({ doneValue: v })]), `Sprint at index 0 has invalid doneValue (must be 0-${FIG}).`],
    ['backlog at end', (v: number) => file(project(), [sprint({ backlogAtSprintEnd: v })]), `Sprint at index 0 has invalid backlogAtSprintEnd (must be 0-${FIG}).`],
  ] as const)('the validator: %s', (_label, at, message) => {
    expect(verdict(at(FIG))).toBe('accepted')
    expect(verdict(at(FIG + 1))).toBe(message)
  })

  it('the refusal reasons quote the changed limits', () => {
    const named = { ...file(project({ name: 'N'.repeat(LEN + 1) })), _originRef: 'o', _storageRef: 's' }
    expect(checkExportedFile(JSON.stringify(named))).toEqual({
      ok: false, items: [{ kind: 'project', name: 'N'.repeat(LEN + 1), sprintNumber: undefined, reason: `Project name is ${LEN + 1} characters; the most allowed is ${LEN}` }],
    })
    const figured = { ...file(project({ milestones: [milestone({ name: 'MVP', backlogSize: FIG + 1 })] })), _originRef: 'o', _storageRef: 's' }
    expect(checkExportedFile(JSON.stringify(figured))).toEqual({
      ok: false, items: [{ kind: 'project', name: 'P', sprintNumber: undefined, reason: 'Remaining Work for milestone "MVP" is 5,001; the most allowed is 5,000' }],
    })
  })

  it('the import copy truncates to the changed limit', () => {
    const name = 'N'.repeat(LEN + 10)
    const incoming = project({ id: 'in', name })
    const existing = project({ id: 'ex', name })
    const conflicts: ImportConflict[] = [{ type: 'name', incomingProject: incoming, existingProject: existing }]
    const parsed: ParsedImportData = { exportType: 'spert-forecaster-project-export', projects: [incoming], sprints: [] }
    const { mergedProjects } = applyImportDecisions([existing], [], parsed, new Map<string, ConflictAction>([['in', 'copy']]), conflicts)
    const copy = mergedProjects.find((p) => p.id !== 'ex')!
    expect(copy.name).toBe(`${'N'.repeat(LEN - ' - Copy (XXXXXXXX)'.length)} - Copy (1)`)
  })

  it('the clone truncates to the changed limit', () => {
    useProjectStore.setState({ projects: [project({ id: 'src', name: 'N'.repeat(LEN) })], sprints: [] })
    const id = useProjectStore.getState().cloneProject('src')
    expect(useProjectStore.getState().projects.find((p) => p.id === id)!.name)
      .toBe(`${'N'.repeat(LEN - ' - Copy (XXXXXXXX)'.length)} - Copy (1)`)
  })

  it('ProjectForm: maxLength, and isValid on a pre-filled value', () => {
    render(<ProjectForm project={project({ name: 'N'.repeat(LEN + 1) })} onSubmit={() => {}} onCancel={() => {}} />)
    expect((screen.getByLabelText('Project Name') as HTMLInputElement).maxLength).toBe(LEN)
    expect((screen.getByLabelText('Unit of Measure') as HTMLInputElement).maxLength).toBe(LEN)
    expect((screen.getByRole('button', { name: 'Update Project' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    render(<ProjectForm project={project({ name: 'N'.repeat(LEN), unitOfMeasure: 'u'.repeat(LEN + 1) })} onSubmit={() => {}} onCancel={() => {}} />)
    expect((screen.getByRole('button', { name: 'Update Project' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    render(<ProjectForm project={project({ name: 'N'.repeat(LEN), unitOfMeasure: 'u'.repeat(LEN) })} onSubmit={() => {}} onCancel={() => {}} />)
    expect((screen.getByRole('button', { name: 'Update Project' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('MilestoneForm: max, and isValid on a pre-filled value', () => {
    const renderWith = (backlogSize: number) =>
      render(<MilestoneForm milestone={milestone({ backlogSize })} existingCount={0} unitOfMeasure="pts" onSubmit={() => {}} onCancel={() => {}} />)
    renderWith(FIG + 1)
    expect((screen.getByLabelText(/Remaining Work/) as HTMLInputElement).max).toBe(String(FIG))
    expect((screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    renderWith(FIG)
    expect((screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('SprintForm: both max attributes, and isValid on pre-filled values', () => {
    const p = project({ firstSprintStartDate: '2026-01-05', sprintCadenceWeeks: 2 })
    const renderWith = (s: Sprint) =>
      render(<SprintForm sprint={s} project={p} existingSprintCount={1} allSprints={[s]} onSubmit={() => {}} onCancel={() => {}} />)
    const updateDisabled = () => (screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement).disabled

    renderWith(sprint({ doneValue: FIG + 1 }))
    expect((screen.getByLabelText(/Done this sprint/) as HTMLInputElement).max).toBe(String(FIG))
    expect((screen.getByLabelText(/Backlog at End/) as HTMLInputElement).max).toBe(String(FIG))
    expect(updateDisabled()).toBe(true)
    cleanup()
    renderWith(sprint({ backlogAtSprintEnd: FIG + 1 }))
    expect(updateDisabled()).toBe(true)
    cleanup()
    renderWith(sprint({ doneValue: FIG, backlogAtSprintEnd: FIG }))
    expect(updateDisabled()).toBe(false)
  })
})
