// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 39 PR B — the store's guard on the thirteen mutators a user's own action
// reaches. Every access × every mutator: what it returns, whether the project
// or its sprints changed, whether a sync event went out, and what the user was
// told. A refusal touches nothing, emits nothing, and says so exactly once.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { useProjectStore } from './project-store'
import { useStorageModeStore } from './storage-mode-store'
import { guardRefusalText, NOT_IN_CLOUD_DELETE_TEXT, type ProjectAccess } from './project-access'
import {
  NON_OWNER_DELETE_TEXT,
  NOT_IN_CLOUD_SAVE_TEXT,
  VIEW_ONLY_SAVE_TEXT,
  deleteFailureText,
  saveFailureText,
} from '@/shared/firebase/firestore-errors'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { SyncEvent } from '@/shared/firebase/types'

const TS = '2026-01-01T00:00:00.000Z'
const st = () => useProjectStore.getState()

type Seed = ProjectAccess | 'unknown' | 'local' | 'loading'
type Change = 'edit' | 'delete'

/**
 * `unknown`: cloud, loaded, no role entry (a project this browser is creating).
 * `local` and `loading` hold a VIEWER entry, so a guard that consults the entry
 * in local mode, or before the first cloud load, goes red.
 */
const ENTRY: Record<Seed, ProjectAccess | undefined> = {
  owner: 'owner',
  editor: 'editor',
  viewer: 'viewer',
  'not-in-cloud': 'not-in-cloud',
  unknown: undefined,
  local: 'viewer',
  loading: 'viewer',
}

function seed(s: Seed) {
  const entry = ENTRY[s]
  useStorageModeStore.setState({ mode: s === 'local' ? 'local' : 'cloud' })
  useProjectStore.setState({
    projects: [{
      id: 'p', name: 'P', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS,
      milestones: [
        { id: 'm1', name: 'M1', backlogSize: 10, color: '#3b82f6', createdAt: TS, updatedAt: TS },
        { id: 'm2', name: 'M2', backlogSize: 20, color: '#10b981', createdAt: TS, updatedAt: TS },
      ],
      productivityAdjustments: [
        { id: 'a1', name: 'Holiday', startDate: '2026-02-02', endDate: '2026-02-06', factor: 0.5, enabled: true, createdAt: TS, updatedAt: TS },
      ],
    }],
    sprints: [{ id: 'p-s1', projectId: 'p', sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 10, includedInForecast: true, createdAt: TS, updatedAt: TS }],
    viewingProjectId: 'p',
    cloudDataLoaded: s !== 'local' && s !== 'loading',
    projectRoles: entry ? { p: entry } : {},
    _isCloudUpdate: false,
  } as never)
}

const MUTATORS: Array<[string, Change, () => boolean]> = [
  ['updateProject', 'edit', () => st().updateProject('p', { name: 'Renamed' })],
  ['deleteProject', 'delete', () => st().deleteProject('p')],
  ['addSprint', 'edit', () => st().addSprint({ projectId: 'p', sprintNumber: 2, sprintStartDate: '2026-01-19', sprintFinishDate: '2026-01-30', doneValue: 5, includedInForecast: true })],
  ['updateSprint', 'edit', () => st().updateSprint('p-s1', { doneValue: 99 })],
  ['deleteSprint', 'edit', () => st().deleteSprint('p-s1')],
  ['toggleSprintIncluded', 'edit', () => st().toggleSprintIncluded('p-s1')],
  ['addProductivityAdjustment', 'edit', () => st().addProductivityAdjustment('p', { name: 'Offsite', startDate: '2026-03-02', endDate: '2026-03-06', factor: 0.25, enabled: true })],
  ['updateProductivityAdjustment', 'edit', () => st().updateProductivityAdjustment('p', 'a1', { factor: 0.75 })],
  ['deleteProductivityAdjustment', 'edit', () => st().deleteProductivityAdjustment('p', 'a1')],
  ['addMilestone', 'edit', () => st().addMilestone('p', { name: 'M3', backlogSize: 5, color: '#f59e0b' })],
  ['updateMilestone', 'edit', () => st().updateMilestone('p', 'm1', { name: 'M1 renamed' })],
  ['deleteMilestone', 'edit', () => st().deleteMilestone('p', 'm1')],
  ['reorderMilestones', 'edit', () => st().reorderMilestones('p', ['m2', 'm1'])],
]

/**
 * What the user is told, per seed and change: [] when the change is allowed,
 * else the one refusal toast. Viewer and not-in-cloud refuse everything; an
 * editor refuses only a delete; owner, unknown, local and loading allow all.
 */
const TOLD: Record<Seed, Record<Change, string[]>> = {
  owner: { edit: [], delete: [] },
  editor: { edit: [], delete: [guardRefusalText('delete', 'editor')] },
  viewer: { edit: [guardRefusalText('edit', 'viewer')], delete: [guardRefusalText('delete', 'viewer')] },
  'not-in-cloud': { edit: [guardRefusalText('edit', 'not-in-cloud')], delete: [guardRefusalText('delete', 'not-in-cloud')] },
  unknown: { edit: [], delete: [] },
  local: { edit: [], delete: [] },
  loading: { edit: [], delete: [] },
}

const CASES = (Object.keys(ENTRY) as Seed[]).flatMap((s) =>
  MUTATORS.map(([name, change, run]) => [s, name, change, run, TOLD[s][change]] as const),
)

let emitted: SyncEvent[] = []
const snapshot = () => JSON.stringify([st().projects, st().sprints])

beforeEach(() => {
  emitted = []
  vi.mocked(toast.error).mockClear()
  vi.spyOn(syncBus, 'emit').mockImplementation((e: SyncEvent) => { emitted.push(e) })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  useStorageModeStore.setState({ mode: 'local' })
  useProjectStore.setState({ projects: [], sprints: [], projectRoles: {}, cloudDataLoaded: false, viewingProjectId: null } as never)
})

describe('the store guard: every access × every user-reachable mutator', () => {
  it('covers all thirteen mutators (known-bad: a mutator dropped from this table)', () => {
    expect(MUTATORS.map(([name]) => name)).toHaveLength(13)
    expect(CASES).toHaveLength(7 * 13)
  })

  it.each(CASES)(
    '%s × %s (%s) → [returned, changed, emitted, told] (known-bads: guard missing, wrong predicate, silent refusal, change before the check)',
    (s, _name, _change, run, told) => {
      seed(s)
      const before = snapshot()
      const allowed = told.length === 0
      const returned = run()
      expect([returned, snapshot() !== before, emitted.length > 0, vi.mocked(toast.error).mock.calls.map((c) => c[0]), vi.mocked(console.warn).mock.calls.length])
        .toEqual([allowed, allowed, allowed, told, told.length])
    },
  )
})

describe('what a refusal says (G1–G4) and logs', () => {
  it('G1–G4 read exactly as approved (known-bad: a text changed without the owner)', () => {
    expect([
      guardRefusalText('edit', 'viewer'),
      guardRefusalText('edit', 'not-in-cloud'),
      guardRefusalText('delete', 'editor'),
      guardRefusalText('delete', 'viewer'),
      guardRefusalText('delete', 'not-in-cloud'),
    ]).toEqual([
      "Your change wasn't saved — you can only view this project.",
      "Your change wasn't saved — this project isn't in your cloud account.",
      "The project wasn't deleted — only its owner can delete it.",
      "The project wasn't deleted — only its owner can delete it.",
      "The project wasn't deleted — this project isn't in your cloud account.",
    ])
  })

  it('G1–G3 are the cloud refusals' + " texts: the guard and the cloud say the same (W-5; known-bad: a second copy that drifted)", () => {
    const refused = { code: 'permission-denied' }
    expect([
      guardRefusalText('edit', 'viewer') === VIEW_ONLY_SAVE_TEXT && VIEW_ONLY_SAVE_TEXT === saveFailureText(refused, 'viewer'),
      guardRefusalText('edit', 'not-in-cloud') === NOT_IN_CLOUD_SAVE_TEXT && NOT_IN_CLOUD_SAVE_TEXT === saveFailureText(refused, 'not-in-cloud'),
      guardRefusalText('delete', 'editor') === NON_OWNER_DELETE_TEXT && NON_OWNER_DELETE_TEXT === deleteFailureText(refused, 'editor'),
      guardRefusalText('delete', 'viewer') === deleteFailureText(refused, 'viewer'),
      guardRefusalText('delete', 'not-in-cloud') === NOT_IN_CLOUD_DELETE_TEXT,
    ]).toEqual([true, true, true, true, true])
  })

  it('a refusal is logged with the change, the project and the access (known-bad: a silent refusal in the console)', () => {
    seed('viewer')
    st().updateProject('p', { name: 'x' })
    seed('not-in-cloud')
    st().deleteProject('p')
    expect(vi.mocked(console.warn).mock.calls).toEqual([
      ["Refused to edit project p: this user's access is viewer."],
      ["Refused to delete project p: this user's access is not-in-cloud."],
    ])
  })
})
