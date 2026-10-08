// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 39 — the role, the access it grants, and the import's role rules.
// Every row names the known-bad that must turn it red.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useProjectStore } from './project-store'
import { useStorageModeStore } from './storage-mode-store'
import {
  roleFromDoc,
  resolveAccess,
  canEditProject,
  canDeleteProject,
  blocksReplaceAll,
  type ProjectAccess,
} from './project-access'
import { availableActions, detectImportConflicts, type ParsedImportData } from './import-utils'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { SyncEvent } from '@/shared/firebase/types'

const TS = '2026-01-01T00:00:00.000Z'
const st = () => useProjectStore.getState()

type Seed = ProjectAccess | 'unknown' | 'local' | 'loading'
function seedStore(seed: Seed) {
  const entry: ProjectAccess | undefined =
    seed === 'unknown' ? undefined : seed === 'local' || seed === 'loading' ? 'viewer' : seed
  useStorageModeStore.setState({ mode: seed === 'local' ? 'local' : 'cloud' })
  useProjectStore.setState({
    projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS, productivityAdjustments: [], milestones: [] }],
    sprints: [{ id: 'p-s1', projectId: 'p', sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 10, includedInForecast: true, createdAt: TS, updatedAt: TS }],
    cloudDataLoaded: seed !== 'local' && seed !== 'loading',
    projectRoles: entry ? { p: entry } : {},
    _isCloudUpdate: false,
  } as never)
}

let emitted: SyncEvent[] = []
beforeEach(() => {
  emitted = []
  vi.spyOn(syncBus, 'emit').mockImplementation((e: SyncEvent) => { emitted.push(e) })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  useStorageModeStore.setState({ mode: 'local' })
  useProjectStore.setState({ projects: [], sprints: [], projectRoles: {}, cloudDataLoaded: false, cloudAccountId: '' } as never)
})

describe('roleFromDoc', () => {
  it.each([
    [{ owner: 'u', members: { u: 'viewer' } }, 'owner'], // known-bad: members read first
    [{ owner: 'x', members: { u: 'editor' } }, 'editor'], // known-bad: editor↔viewer swapped
    [{ owner: 'x', members: { u: 'viewer' } }, 'viewer'],
    [{ owner: 'x', members: { u: 'commenter' } }, 'viewer'], // an unknown value fails closed
    [{ owner: 'x' }, 'viewer'],
  ] as const)('%j → %s', (doc, role) => {
    expect(roleFromDoc(doc, 'u')).toBe(role)
  })
})

describe('resolveAccess', () => {
  it.each([
    ['local', false, 'viewer', 'owner'], // known-bad: an entry consulted in local mode
    ['cloud', false, 'viewer', 'owner'], // the loading window: behind the panel, held by Brief 40
    ['cloud', true, 'owner', 'owner'],
    ['cloud', true, 'editor', 'editor'],
    ['cloud', true, 'viewer', 'viewer'],
    ['cloud', true, 'not-in-cloud', 'not-in-cloud'], // V1; known-bad: not-in-cloud resolved as owner
    ['cloud', true, undefined, 'owner'], // known-bad: absent → read-only locks a project being created here
  ] as const)('mode %s, loaded %s, entry %s → %s', (mode, cloudDataLoaded, entry, access) => {
    expect(resolveAccess({ mode, cloudDataLoaded, entry })).toBe(access)
  })
  it('permissions per access: edit, delete, blocks Replace all', () => {
    const all: ProjectAccess[] = ['owner', 'editor', 'viewer', 'not-in-cloud']
    expect(all.map(canEditProject)).toEqual([true, true, false, false])
    expect(all.map(canDeleteProject)).toEqual([true, false, false, false])
    expect(all.map(blocksReplaceAll)).toEqual([false, true, true, false])
  })
})

describe('availableActions takes the access to the EXISTING project (one predicate: preview, defaults, veto)', () => {
  it.each([
    ['id', 'owner', ['skip', 'copy', 'replace']],
    ['id', 'editor', ['skip', 'copy', 'replace']],
    ['id', 'viewer', ['skip', 'copy']], // known-bad: the viewer filter dropped
    ['id', 'not-in-cloud', ['skip', 'copy']], // V1
    ['name', 'owner', ['skip', 'copy', 'replace']],
    ['name', 'editor', ['skip', 'copy']], // known-bad: name-conflict replace offered to editors
    ['name', 'viewer', ['skip', 'copy']],
    ['name', 'not-in-cloud', ['skip', 'copy']],
  ] as const)('%s conflict, %s → %j', (type, access, actions) => {
    expect(availableActions(type, 'spert-forecaster-project-export', false, true, access)).toEqual(actions)
  })
  it('a Story Map update is withheld from a viewer, kept for an editor', () => {
    expect(availableActions('id', 'spert-story-map', false, true, 'viewer')).toEqual(['skip', 'copy'])
    expect(availableActions('id', 'spert-story-map', false, true, 'editor')).toEqual(['skip', 'copy', 'replace', 'update'])
  })
})

const projectFile = (projects: object[]) =>
  ({ exportType: 'spert-forecaster-project-export', projects, sprints: [] } as unknown as ParsedImportData)
const fileProject = (id: string, name: string) => ({ id, name, unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS })
function smartImport(incoming: ParsedImportData, decisions: [string, string][]) {
  return st().applySmartImport({
    incoming,
    decisions: new Map(decisions) as never,
    freshConflicts: detectImportConflicts(incoming, st().projects),
    source: 'spert-forecaster-project-export',
  })
}
const importEvent = () => emitted.find((e) => e.type === 'project:import') as Extract<SyncEvent, { type: 'project:import' }> | undefined

describe('an import names its whole cloud footprint, and nothing else (known-bad: the event carries no ids → save-all)', () => {
  it('an unrelated project: saves only it, deletes nothing', () => {
    seedStore('viewer')
    expect(smartImport(projectFile([fileProject('imp', 'New')]), []).ok).toBe(true)
    expect([importEvent()?.savedIds, importEvent()?.deletedIds]).toEqual([['imp'], []])
  })
  it('an owner\'s name-conflict replace: saves the winner, deletes the original', () => {
    seedStore('owner')
    expect(smartImport(projectFile([fileProject('win', 'P')]), [['win', 'replace']]).ok).toBe(true)
    expect([importEvent()?.savedIds, importEvent()?.deletedIds]).toEqual([['win'], ['p']])
  })
  it('an editor\'s ID-conflict replace is allowed and saves that project', () => {
    seedStore('editor')
    expect(smartImport(projectFile([fileProject('p', 'From file')]), [['p', 'replace']]).ok).toBe(true)
    expect([importEvent()?.savedIds, importEvent()?.deletedIds]).toEqual([['p'], []])
  })
  it('an editor\'s Story Map update saves that project (known-bad: updatedExistingIds left out of the save set)', () => {
    seedStore('editor')
    const incoming = {
      exportType: 'spert-story-map',
      milestoneBacklog: 'remaining',
      projects: [fileProject('p', 'P')],
      sprints: [
        { id: 'p-s1', projectId: 'p', sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 10, includedInForecast: true, createdAt: TS, updatedAt: TS },
        { id: 'p-s2', projectId: 'p', sprintNumber: 2, sprintStartDate: '2026-01-19', sprintFinishDate: '2026-01-30', doneValue: 12, includedInForecast: true, createdAt: TS, updatedAt: TS },
      ],
    } as unknown as ParsedImportData
    const outcome = st().applySmartImport({
      incoming,
      decisions: new Map([['p', 'update']]) as never,
      freshConflicts: detectImportConflicts(incoming, st().projects),
      source: 'spert-story-map',
    })
    expect([outcome.ok, importEvent()?.savedIds, importEvent()?.deletedIds]).toEqual([true, ['p'], []])
  })
  it.each([
    ['viewer', 'p', 'replace'], // known-bad: the role filter in the preview only, not the write-time veto
    ['not-in-cloud', 'p', 'replace'],
    ['editor', 'win', 'replace'], // a name-conflict replace deletes the original: owner only
  ] as const)('a crafted %s %s → %s is refused at write time, reason access-changed: no change, no event', (seed, id, action) => {
    seedStore(seed)
    const name = id === 'p' ? 'From file' : 'P'
    const before = JSON.stringify(st().projects)
    const outcome = smartImport(projectFile([fileProject(id, name)]), [[id, action]])
    expect([outcome.ok, !outcome.ok && outcome.reason, JSON.stringify(st().projects) === before, emitted.length])
      .toEqual([false, 'access-changed', true, 0]) // known-bad: the access veto reported as workspace-changed
  })
})

describe('Replace all (known-bad: no refusal → refused deletes and shared projects back)', () => {
  const data = { version: '0.46.4', exportedAt: TS, projects: [fileProject('ra', 'Restored')], sprints: [] }
  it.each([
    ['viewer', true],
    ['editor', true],
    ['owner', false],
    ['not-in-cloud', false], // no delete is sent for it, so it does not block
    ['unknown', false],
    ['local', false],
  ] as const)('holding a %s project → refused %s', (seed, refused) => {
    seedStore(seed)
    let threw = false
    try { st().importDataAndSelectFirst(data as never, 'ra') } catch { threw = true }
    expect([threw, st().projects.some((p) => p.id === 'p')]).toEqual([refused, refused])
  })
  it('the event names the file\'s projects as saved and every other project as deleted', () => {
    seedStore('owner')
    st().importDataAndSelectFirst(data as never, 'ra')
    expect([importEvent()?.savedIds, importEvent()?.deletedIds]).toEqual([['ra'], ['p']])
  })
})

describe('the role map and the account tag in the store', () => {
  it('setProjectRoles writes nothing when nothing changed (known-bad: always set — a full persist per raise)', () => {
    useProjectStore.setState({ projectRoles: { p: 'viewer' } } as never)
    let sets = 0
    const off = useProjectStore.subscribe(() => { sets++ })
    st().setProjectRoles({ p: 'viewer' })
    st().setProjectRoles({ p: 'editor' })
    off()
    expect([sets, st().projectRoles]).toEqual([1, { p: 'editor' }])
  })
  it('the roles are never persisted; the account tag is (known-bads: roles in partialize; tag left out)', () => {
    st().setProjectRoles({ p: 'editor' })
    st().setCloudAccountId('u1')
    const persisted = localStorage.getItem('spert-data') ?? ''
    expect([persisted.includes('projectRoles'), persisted.includes('"cloudAccountId":"u1"')]).toEqual([false, true])
  })
  it('sign-out (and both cloud→local switches) clears the roles and the account tag', () => {
    useProjectStore.setState({ projectRoles: { p: 'viewer' }, cloudAccountId: 'u1' } as never)
    st().clearProjectsOnSignOut()
    expect([st().projectRoles, st().cloudAccountId]).toEqual([{}, ''])
  })
  it('the store\'s account-change clear is its sign-out clear, and keeps the workspace origin (Export Attribution and the simulation generation: useCloudSync, V1-U7)', () => {
    seedStore('owner')
    useProjectStore.setState({ cloudAccountId: 'u1', _originRef: 'origin-1', _changeLog: [{ t: 1, op: 'add', entity: 'project', id: 'p' }] } as never)
    st().clearProjectsOnAccountChange()
    const s = st()
    expect([s.projects.length, s.sprints.length, s._changeLog.length, s.projectRoles, s.cloudAccountId, s._originRef])
      .toEqual([0, 0, 0, {}, '', 'origin-1'])
  })
})
