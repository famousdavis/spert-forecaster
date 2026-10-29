// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// W4: what a project document from the cloud must look like before it reaches
// the store. Two halves, and the second outranks the first: a document another
// user wrote cannot break the list or reach another project, and nothing this
// app writes is ever set aside (which the next save would make permanent).

import { describe, it, expect, vi } from 'vitest'
import { guardCloudProjectDoc, MAX_CLOUD_CADENCE_WEEKS, MIN_CLOUD_CADENCE_WEEKS } from './cloud-load-guard'
import { projectToFirestoreDoc } from './firestore-converters'
import { validateImportData, MAX_SPRINT_NUMBER } from '@/shared/state/import-validation'
import { MAX_STRING_LENGTH, MAX_NUMERIC_VALUE, MILESTONE_CEILING } from '@/shared/state/import-limits'
import { processProjectDocs, cloudLoadNoticeText } from '@/shared/hooks/useCloudSync'
import type { Project, Sprint, Milestone, ProductivityAdjustment } from '@/shared/types'
import type { FirestoreProjectDoc } from './types'

vi.mock('@/shared/firebase/config', () => ({ auth: null, db: null }))

const TS = '2026-01-01T00:00:00.000Z'
const sprintOf = (projectId: string, n: number, extra: Partial<Sprint> = {}): Sprint => ({
  id: `s-${projectId}-${n}`, projectId, sprintNumber: n, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
  doneValue: MAX_NUMERIC_VALUE, backlogAtSprintEnd: MAX_NUMERIC_VALUE, includedInForecast: n % 2 === 0, createdAt: TS, updatedAt: TS, ...extra,
})
const milestoneOf = (i: number): Milestone => ({
  id: `m-${i}`, name: 'M'.repeat(MAX_STRING_LENGTH), backlogSize: MAX_NUMERIC_VALUE, color: '#123456', showOnChart: i % 2 === 0, createdAt: TS, updatedAt: TS,
})
const adjustmentOf = (i: number): ProductivityAdjustment => ({
  id: `a-${i}`, name: `Holiday ${i}`, startDate: '2026-12-21', endDate: '2027-01-01', factor: i % 2 === 0 ? 0 : 0.5,
  enabled: i % 3 !== 0, reason: 'memo', createdAt: TS, updatedAt: TS,
})
const projectOf = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: 'P'.repeat(MAX_STRING_LENGTH), unitOfMeasure: 'U'.repeat(MAX_STRING_LENGTH), sprintCadenceWeeks: 2,
  projectStartDate: '2026-01-01', projectFinishDate: '2027-12-31', firstSprintStartDate: '2026-01-05',
  productivityAdjustments: [], milestones: [], createdAt: TS, updatedAt: TS, ...extra,
})
/** As saveProject / saveProjectImmediate write it. */
const written = (project: Project, sprints: Sprint[]): FirestoreProjectDoc =>
  projectToFirestoreDoc(project, sprints, 'owner-1', { owner: 'owner-1', members: { 'user-2': 'editor' } }, 'origin', [{ t: 1, op: 'add', entity: 'project', id: project.id }])

describe('must pass — the largest project this app can write is returned whole (no lockout)', () => {
  it('a project at every limit, with the most sprints a 1 MiB document holds, sets nothing aside and is unchanged', () => {
    // Sprint History numbers a sprint existingSprintCount + 1, and the import
    // accepts up to MAX_SPRINT_NUMBER: both ends of the range are here.
    const sprints = [...Array.from({ length: 4000 }, (_, i) => sprintOf('big', i + 1)), sprintOf('big', MAX_SPRINT_NUMBER)]
    for (const cadence of [MIN_CLOUD_CADENCE_WEEKS, 4, 2.5, MAX_CLOUD_CADENCE_WEEKS]) {
      const doc = written(projectOf('big', {
        // Typed 1–4 (the select); the import writes anything from 1 to 52.
        sprintCadenceWeeks: cadence as Project['sprintCadenceWeeks'],
        milestones: Array.from({ length: MILESTONE_CEILING }, (_, i) => milestoneOf(i)),
        productivityAdjustments: Array.from({ length: 500 }, (_, i) => adjustmentOf(i)),
      }), sprints)
      const before = JSON.stringify(doc)
      const guarded = guardCloudProjectDoc('big', doc)
      expect(guarded?.setAside).toEqual([])
      expect(guarded?.doc).toEqual(doc)
      expect(JSON.stringify(doc)).toBe(before)   // the load never writes, not even to its input
    }
  })

  it('a project as first written, with no cadence and no lists yet, sets nothing aside', () => {
    const doc = written(projectOf('new', { sprintCadenceWeeks: undefined, firstSprintStartDate: undefined }), [])
    expect(guardCloudProjectDoc('new', doc)?.setAside).toEqual([])
  })

  it('a document saved with the other projects\' sprints in the store keeps all of its own (projectToFirestoreDoc writes only those)', () => {
    const all = [sprintOf('x', 1), sprintOf('y', 1), sprintOf('x', 2)]
    const guarded = guardCloudProjectDoc('x', written(projectOf('x'), all))
    expect(guarded?.setAside).toEqual([])
    expect(guarded?.doc.sprints.map((s) => s.id)).toEqual(['s-x-1', 's-x-2'])
  })
})

describe('parity — the guard and the import agree at every bound they share', () => {
  const file = (project: Record<string, unknown>, sprints: Record<string, unknown>[]) => ({ version: '1', exportedAt: TS, projects: [project], sprints })
  const imports = (project: Record<string, unknown>, sprints: Record<string, unknown>[] = []) => {
    try { return validateImportData(file(project, sprints)) } catch { return false }
  }
  const base = { id: 'p', name: 'p', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS }

  it.each([0, 0.5, 1, 2.5, 52, 52.5, 53, NaN, Infinity, -1])('cadence %s: kept exactly when the import accepts it', (cadence) => {
    // Object.is: with `===`, the NaN row could never see NaN kept.
    const kept = Object.is(guardCloudProjectDoc('p', { ...base, sprints: [], sprintCadenceWeeks: cadence })!.doc.sprintCadenceWeeks, cadence)
    expect(kept).toBe(imports({ ...base, sprintCadenceWeeks: cadence }))
  })

  it.each([0, 1, 1.5, 9999, MAX_SPRINT_NUMBER, MAX_SPRINT_NUMBER + 1, 1e17, Infinity, NaN, -3])('sprint number %s: kept exactly when the import accepts it', (n) => {
    const sprint = { id: 's', projectId: 'p', sprintNumber: n, doneValue: 1, includedInForecast: true, createdAt: TS, updatedAt: TS }
    const kept = guardCloudProjectDoc('p', { ...base, sprints: [sprint] })!.doc.sprints.length === 1
    expect(kept).toBe(imports(base, [sprint]))
  })
})

describe('hostile — what another user can write is set aside, and the rest loads', () => {
  const doc = (extra: Record<string, unknown>) => ({ name: 'Shared', unitOfMeasure: 'pts', createdAt: TS, owner: 'o', members: {}, sprints: [], ...extra })

  it.each([
    ['sprints an object', { sprints: { x: 1 } }, 'list-not-a-list'],
    ['sprints a number', { sprints: 5 }, 'list-not-a-list'],
    ['milestones a string', { milestones: 'abc' }, 'list-not-a-list'],
    ['adjustments an object', { productivityAdjustments: { a: 1 } }, 'list-not-a-list'],
  ])('%s → an empty list', (_label, extra, rule) => {
    const guarded = guardCloudProjectDoc('p', doc(extra))!
    expect(guarded.setAside).toEqual([rule])
    for (const field of ['sprints', 'milestones', 'productivityAdjustments'] as const) {
      const value = guarded.doc[field]
      expect(value === undefined || Array.isArray(value)).toBe(true)
    }
  })

  it('list elements that are not objects are set aside; the objects stay', () => {
    const guarded = guardCloudProjectDoc('p', doc({ milestones: [null, 3, 'x', [], milestoneOf(1)], productivityAdjustments: [false, adjustmentOf(1)] }))!
    expect(guarded.setAside).toEqual(['item-not-an-object'])
    expect(guarded.doc.milestones).toEqual([milestoneOf(1)])
    expect(guarded.doc.productivityAdjustments).toEqual([adjustmentOf(1)])
  })

  it('a sprint naming another project never reaches it (known-bad: it joined that project, and its next save wrote it there)', () => {
    const guarded = guardCloudProjectDoc('y', doc({ sprints: [sprintOf('victim', 1), sprintOf('y', 1), { ...sprintOf('y', 2), projectId: undefined }] }))!
    expect(guarded.setAside).toEqual(['sprint-of-another-project'])
    expect(guarded.doc.sprints.map((s) => s.id)).toEqual(['s-y-1'])
  })

  it.each([1e17, Infinity, 0, 2.5, '3', null])('sprint number %s is set aside (known-bad: 1e17 froze the burn-up chart)', (n) => {
    const guarded = guardCloudProjectDoc('p', doc({ sprints: [sprintOf('p', 1), { ...sprintOf('p', 2), sprintNumber: n }] }))!
    expect(guarded.setAside).toEqual(['sprint-number-out-of-range'])
    expect(guarded.doc.sprints.map((s) => s.sprintNumber)).toEqual([1])
  })

  it.each([0, 53, 362000, NaN, '2', null])('cadence %s is treated as not set (known-bad: 362,000 walked 2.5M days on Run)', (cadence) => {
    const guarded = guardCloudProjectDoc('p', doc({ sprintCadenceWeeks: cadence }))!
    expect(guarded.setAside).toEqual(['cadence-out-of-range'])
    expect('sprintCadenceWeeks' in guarded.doc).toBe(false)
  })

  it('a name or unit that is not text becomes empty text (the project list renders both)', () => {
    const guarded = guardCloudProjectDoc('p', doc({ name: { $: 1 }, unitOfMeasure: ['a'] }))!
    expect(guarded.setAside).toEqual(['text-not-text'])
    expect(guarded.doc.name).toBe('')
    expect(guarded.doc.unitOfMeasure).toBe('')
  })

  it('each rule is listed once, in the order found', () => {
    const guarded = guardCloudProjectDoc('p', doc({ name: 1, sprintCadenceWeeks: 0, milestones: [null, null], sprints: [sprintOf('q', 1), sprintOf('q', 2)] }))!
    expect(guarded.setAside).toEqual(['text-not-text', 'cadence-out-of-range', 'item-not-an-object', 'sprint-of-another-project'])
  })

  it('something that is not an object at all is not a project', () => {
    for (const raw of [null, 5, 'x', [], undefined]) expect(guardCloudProjectDoc('p', raw)).toBeNull()
  })
})

describe('processProjectDocs — one document at a time (G7)', () => {
  const ok = (name: string, id: string) => written(projectOf(id, { name }), [sprintOf(id, 1)])
  const meta = () => ({ current: new Map<string, FirestoreProjectDoc>() })

  it('a document that cannot be converted at all is left out, and the others load (known-bad: the loop threw)', () => {
    const unreadable = new Proxy({}, { ownKeys: () => { throw new Error('unreadable') } }) as FirestoreProjectDoc
    const notes: Parameters<typeof processProjectDocs>[3] = []
    const ref = meta()
    const result = processProjectDocs([['a', ok('Alpha', 'a')], ['b', unreadable], ['c', ok('Gamma', 'c')]], ref, 'owner-1', notes)
    expect(result.projects.map((p) => p.id)).toEqual(['a', 'c'])
    expect(result.sprints.map((s) => s.projectId)).toEqual(['a', 'c'])
    expect(notes).toEqual([{ docId: 'b', name: null, rules: ['project-unreadable'] }])
    expect(ref.current.has('b')).toBe(true)   // owner/members still come from the server's own document
  })

  it('a document with something set aside loads the rest of itself, and is noted under its name', () => {
    const notes: Parameters<typeof processProjectDocs>[3] = []
    const bad = { ...ok('Shared', 'b'), sprints: { x: 1 } } as unknown as FirestoreProjectDoc
    const result = processProjectDocs([['a', ok('Alpha', 'a')], ['b', bad]], meta(), 'owner-1', notes)
    expect(result.projects.map((p) => p.name)).toEqual(['Alpha', 'Shared'])
    expect(notes).toEqual([{ docId: 'b', name: 'Shared', rules: ['list-not-a-list'] }])
  })

  it('valid documents produce no notes', () => {
    const notes: Parameters<typeof processProjectDocs>[3] = []
    processProjectDocs([['a', ok('Alpha', 'a')], ['c', ok('Gamma', 'c')]], meta(), 'owner-1', notes)
    expect(notes).toEqual([])
  })
})

describe('cloudLoadNoticeText — names the project, never the value (G6)', () => {
  it('one project, by name, cut at 80 characters', () => {
    expect(cloudLoadNoticeText([{ docId: 'b', name: 'Shared', rules: ['list-not-a-list'] }]))
      .toBe('Part of “Shared” could not be read from the cloud and is not shown. The rest of the project has loaded.')
    expect(cloudLoadNoticeText([{ docId: 'b', name: 'x'.repeat(200), rules: ['text-not-text'] }])).toContain(`“${'x'.repeat(80)}…”`)
  })
  it('one project with no usable name, and several at once', () => {
    expect(cloudLoadNoticeText([{ docId: 'b', name: null, rules: ['project-unreadable'] }]))
      .toBe('A project could not be read from the cloud and is not shown. Your other projects have loaded.')
    expect(cloudLoadNoticeText([{ docId: 'a', name: 'A', rules: ['text-not-text'] }, { docId: 'b', name: null, rules: ['project-unreadable'] }]))
      .toBe('2 projects could not be fully read from the cloud. What could not be read is not shown; the rest has loaded.')
  })
})
