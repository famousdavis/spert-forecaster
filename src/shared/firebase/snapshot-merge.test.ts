// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40. Every case asserts ORDER and ABSENCE explicitly, and the viewed
// project where order decides it: an earlier merge passed a membership-only
// test while moving the edited project last, and the Sprint History tab then
// saved the user's next sprint into a different project.

import { describe, it, expect } from 'vitest'
import { mergeCloudView, sameValue, type CloudMergePolicy, type ProjectSet } from './snapshot-merge'
import { selectViewingProject, useProjectStore } from '@/shared/state/project-store'
import type { Project, Sprint } from '@/shared/types'

const TS = '2026-01-01T00:00:00.000Z'
const project = (id: string, name = id): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS })
const sprint = (projectId: string, n: number, doneValue = 10): Sprint => ({
  id: `${projectId}-s${n}`, projectId, sprintNumber: n, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
  doneValue, includedInForecast: true, createdAt: TS, updatedAt: TS,
})
const set = (projects: Project[], sprints: Sprint[] = []): ProjectSet => ({ projects, sprints })
const ids = (r: ProjectSet) => r.projects.map((p) => p.id).join(',')
const sprintIds = (r: ProjectSet, projectId: string) =>
  r.sprints.filter((s) => s.projectId === projectId).map((s) => s.id).join(',')

const policy = (over: Partial<CloudMergePolicy> = {}): CloudMergePolicy => ({
  isProtected: () => false,
  isCreateUnconfirmed: () => false,
  isDeletePending: () => false,
  ...over,
})
// The project Sprint History and Forecast show when nothing is selected.
const viewed = (r: ProjectSet) =>
  selectViewingProject({ ...useProjectStore.getState(), projects: r.projects, viewingProjectId: null })?.id

describe('mergeCloudView — order (known-bads: cloud order, append-last)', () => {
  it('U-M1 keeps the store order when the cloud view lists the same projects in another order', () => {
    const store = set([project('a'), project('b'), project('c')])
    const cloud = set([project('c', 'C2'), project('b', 'B2'), project('a', 'A2')])
    const r = mergeCloudView(store, cloud, policy())
    expect(ids(r)).toBe('a,b,c')
    expect(r.projects.map((p) => p.name)).toEqual(['A2', 'B2', 'C2'])
    expect(viewed(r)).toBe('a')
  })

  it('U-M2 substitutes a protected project IN PLACE, keeping the store version, so the viewed project does not move', () => {
    const store = set([project('a', 'mine'), project('b'), project('c')], [sprint('a', 1), sprint('a', 2)])
    const cloud = set([project('a', 'stale'), project('b', 'B2'), project('c')], [sprint('a', 1)])
    const r = mergeCloudView(store, cloud, policy({ isProtected: (id) => id === 'a' }))
    expect(ids(r)).toBe('a,b,c')
    expect(r.projects[0]).toBe(store.projects[0])
    expect(sprintIds(r, 'a')).toBe('a-s1,a-s2')
    expect(r.projects[1].name).toBe('B2')
    expect(viewed(r)).toBe('a')
  })

  it('U-M3 appends a project new to the store after the existing ones, in cloud order', () => {
    const store = set([project('a'), project('b')])
    const cloud = set([project('y'), project('a'), project('x'), project('b')])
    expect(ids(mergeCloudView(store, cloud, policy()))).toBe('a,b,y,x')
  })
})

describe('mergeCloudView — absence (known-bads: keep a protected absent project, drop an unconfirmed create)', () => {
  it('U-M4 drops a project absent from the view even while a save of it is outstanding (no ghost)', () => {
    const store = set([project('a'), project('b'), project('c')], [sprint('b', 1)])
    const cloud = set([project('a'), project('c')])
    const r = mergeCloudView(store, cloud, policy({ isProtected: (id) => id === 'b' }))
    expect(ids(r)).toBe('a,c')
    expect(sprintIds(r, 'b')).toBe('')
    expect(r.changed).toBe(true)
  })

  it('U-M5 keeps an absent project at its index while its create is unconfirmed', () => {
    const store = set([project('a'), project('new'), project('c')], [sprint('new', 1)])
    const cloud = set([project('a'), project('c')])
    const r = mergeCloudView(store, cloud, policy({ isProtected: (id) => id === 'new', isCreateUnconfirmed: (id) => id === 'new' }))
    expect(ids(r)).toBe('a,new,c')
    expect(sprintIds(r, 'new')).toBe('new-s1')
  })

  it('U-M6 does not append back a project whose local delete has not settled (known-bad: no tombstone)', () => {
    const store = set([project('a')])
    const cloud = set([project('a'), project('gone')])
    const r = mergeCloudView(store, cloud, policy({ isDeletePending: (id) => id === 'gone' }))
    expect(ids(r)).toBe('a')
    expect(r.changed).toBe(false)
  })
})

describe('mergeCloudView — identity and no-op (known-bads: always rebuild, compare projects only)', () => {
  it('U-M7 an echo equal to the store changes nothing and returns the store arrays themselves', () => {
    const a = project('a')
    const store = set([a, project('b')], [sprint('a', 1)])
    // Same values, new objects, another key order, and an undefined-valued key.
    const echoA = { updatedAt: TS, createdAt: TS, unitOfMeasure: 'pts', name: 'a', id: 'a', projectStartDate: undefined }
    const cloud = set([echoA as Project, project('b')], [{ ...sprint('a', 1) }])
    const r = mergeCloudView(store, cloud, policy())
    expect(r.changed).toBe(false)
    expect(r.projects).toBe(store.projects)
    expect(r.sprints).toBe(store.sprints)
  })

  it('U-M8 a changed sprint is a change, and the cloud sprint is taken', () => {
    const store = set([project('a')], [sprint('a', 1, 10)])
    const cloud = set([project('a')], [sprint('a', 1, 11)])
    const r = mergeCloudView(store, cloud, policy())
    expect(r.changed).toBe(true)
    expect(r.sprints[0].doneValue).toBe(11)
  })
})

describe('sameValue (known-bad: an undefined-valued key counts as a value)', () => {
  it('U-M9 treats undefined-valued keys as absent, compares arrays in order, and nests', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(true)
    expect(sameValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
    expect(sameValue({ a: { b: [{ c: 1 }] } }, { a: { b: [{ c: 1 }] } })).toBe(true)
    expect(sameValue({ a: { b: [{ c: 1 }] } }, { a: { b: [{ c: 2 }] } })).toBe(false)
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameValue([], {})).toBe(false)
    expect(sameValue(null, {})).toBe(false)
    expect(sameValue(null, null)).toBe(true)
  })
})
