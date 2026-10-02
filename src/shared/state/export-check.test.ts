// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { checkExportedFile, type ExportCheckItem } from './export-check'
import { MAX_FILE_SIZE, MILESTONE_CEILING } from './import-limits'

type Obj = Record<string, unknown>
const TOKENS = { _originRef: 'origin-token', _storageRef: 'storage-token' }
const T = '2026-01-01T00:00:00.000Z'

const milestones = (n: number, overrides: Obj = {}) =>
  Array.from({ length: n }, (_, k) => ({ id: `m${k}`, name: `M${k + 1}`, backlogSize: 1, color: '#000', showOnChart: true, ...overrides }))
const project = (id: string, name: string, extra: Obj = {}): Obj =>
  ({ id, name, unitOfMeasure: 'pts', sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-05', milestones: [], createdAt: T, updatedAt: T, ...extra })
const sprint = (id: string, projectId: string, extra: Obj = {}): Obj =>
  ({ id, projectId, sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 5, includedInForecast: true, createdAt: T, updatedAt: T, ...extra })
/** This app's workspace export: its envelope carries both workspace reconciliation tokens. */
const workspace = (projects: Obj[], sprints: Obj[] = []): string =>
  JSON.stringify({ version: '0.46.0', exportedAt: T, projects, sprints, ...TOKENS, _changeLog: [] }, null, 2)

const items = (json: string): ExportCheckItem[] => {
  const r = checkExportedFile(json)
  return r.ok ? [] : r.items
}

describe('checkExportedFile — the verdict', () => {
  it('passes a clean file, including 13 milestones and the ceiling itself', () => {
    expect(checkExportedFile(workspace([project('a', 'Thirteen', { milestones: milestones(13) }), project('b', 'Hundred', { milestones: milestones(MILESTONE_CEILING) })])))
      .toEqual({ ok: true })
  })

  it('names EVERY failing project, not just the first', () => {
    const out = items(workspace([
      project('a', 'L'.repeat(245)),
      project('b', 'Gamma', { milestones: milestones(MILESTONE_CEILING + 1) }),
    ]))
    expect(out).toEqual([
      { kind: 'project', name: 'L'.repeat(245), sprintNumber: undefined, reason: 'Project name is 245 characters; the most allowed is 200' },
      { kind: 'project', name: 'Gamma', sprintNumber: undefined, reason: '101 milestones; a file from this app holds at most 100' },
    ])
  })

  it('judges each project inside the file\'s OWN envelope, so a valid 13-milestone bystander is not named', () => {
    // Built without the envelope, the bystander's partition would fall to the Story Map
    // limit of 10 and be reported — the known-bad this test exists for.
    const out = items(workspace([project('t', 'Thirteen', { milestones: milestones(13) }), project('u', 'Unit', { unitOfMeasure: 'u'.repeat(201) })]))
    expect(out.map((i) => (i.kind === 'project' ? i.name : i.kind))).toEqual(['Unit'])
  })

  it('attributes a sprint failure through projectId, not through its array position', () => {
    // The bad sprint is sprints[0]; projects[0] is a different, valid project.
    const out = items(workspace(
      [project('ok', 'Fine'), project('beta', 'Beta')],
      [sprint('s3', 'beta', { sprintNumber: 3, sprintFinishDate: '20276-09-04', customFinishDate: '20276-09-04' }), sprint('s1', 'ok')],
    ))
    expect(out).toEqual([{ kind: 'project', name: 'Beta', sprintNumber: 3, reason: 'Finish Date "20276-09-04" is not a valid date' }])
  })

  it('reports what no single project reproduces against the file as a whole (the residual)', () => {
    const out = items(workspace([project('a', 'Dup A'), project('b', 'Dup B')], [sprint('s-dup', 'a'), sprint('s-dup', 'b')]))
    expect(out).toEqual([{ kind: 'file', reason: 'two sprints share the ID "s-dup"' }])
  })

  it('gives same-named failing projects their sprint counts, and leaves a prefix pair alone', () => {
    const bad = { unitOfMeasure: 'u'.repeat(201) }
    const out = items(workspace(
      [project('t1', 'Twin', bad), project('t2', 'Twin', bad), project('a', 'Alpha'), project('a2', 'Alpha 2', bad)],
      [sprint('x1', 't1'), sprint('x2', 't2'), sprint('x3', 't2')],
    ))
    expect(out.map((i) => (i.kind === 'project' ? [i.name, i.sprintCount] : [i.kind]))).toEqual([['Twin', 1], ['Twin', 2], ['Alpha 2', undefined]])
  })

  it('checks the size of the exact string saved, against MAX_FILE_SIZE', () => {
    // Productivity-adjustment text is not length-checked, so this file is valid but too big.
    const huge = project('h', 'Huge', { productivityAdjustments: [{ id: 'pa', name: 'Long', startDate: '2026-01-05', endDate: '2026-01-09', factor: 0.5, enabled: true, reason: 'r'.repeat(MAX_FILE_SIZE) }] })
    expect(items(workspace([huge]))).toEqual([{ kind: 'file', reason: 'the file is 10.1 MB; an import accepts at most 10 MB' }])
  })
})
