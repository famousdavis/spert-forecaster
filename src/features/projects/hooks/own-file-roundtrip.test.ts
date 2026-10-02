// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * This app's own files re-import whatever a project holds — and keep it.
 *
 * ⚠️ "Re-imports" alone is satisfied by losing data, so every case re-imports
 * into an EMPTY workspace and asserts what the import WROTE: each project's
 * milestones identical in id, order, name, figure, colour and showOnChart, and
 * the FILE carrying the count the project held. Re-importing into the source
 * workspace would compare the store with itself (ID conflicts default to skip).
 *
 * ⚠️ Every import goes through `ingestPayload`, on whatever ROUTE it takes, and
 * the route is asserted: in an empty local workspace a workspace export takes
 * fast path 2 (replace all, no preview) and a subset export fast path 1
 * (applyMergeDecisions → applySmartImport, no preview).
 *
 * Known-bads this file was run against, each alone, each red: the validator's
 * old fixed limit of 10; an export that truncates milestones to 10 (each of the
 * two writers); a ceiling keyed on `_exportType` alone.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useImportState } from './useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { buildProjectSubsetExport } from '../lib/export-project'
import { getWorkspaceId } from '@/shared/state/storage'
import { STORY_MAP_MILESTONE_LIMIT as L } from '@/shared/state/import-limits'
import type { Project } from '@/shared/types'

type Obj = Record<string, unknown>
type Transport = 'file' | 'crosslink'
const TRANSPORTS: readonly Transport[] = ['file', 'crosslink']

// ── Story Map sends ─────────────────────────────────────────────────────────

/**
 * A send exactly as SPERT Story Map's real `buildForecasterExport` writes it
 * (@ `6c874ed`, v0.53.8): one release per id, 10 points each, nothing done, the
 * exporter's 8-colour cycle by position. Transcribed, like `appendixA` in
 * import-remaining-backlog.test.ts; `storymap-send-1.json` is that exporter's
 * real output, and the first test below holds this builder to it byte for byte.
 */
const SM_COLOURS = ['#2563eb', '#0d9488', '#7c3aed', '#e11d48', '#d97706', '#059669', '#4f46e5', '#ea580c']
const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-02-01T00:00:00.000Z'

function storyMapSend(ids: number[], projectId = 'prod-growth'): Obj {
  return {
    version: '1.0',
    exportedAt: '2026-10-02T00:00:00.000Z',
    source: 'spert-story-map',
    milestoneBacklog: 'remaining',
    projects: [{
      id: projectId, name: 'Growth Product', unitOfMeasure: 'Story Points', createdAt: T0, updatedAt: T1,
      sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-01',
      milestones: ids.map((i, k) => ({
        id: `rel-${i}`, name: `Release ${i + 1}`, backlogSize: 10, color: SM_COLOURS[k % SM_COLOURS.length],
        showOnChart: true, createdAt: T0, updatedAt: T1,
      })),
    }],
    sprints: [{
      id: 'sp-1', projectId, sprintNumber: 1, sprintStartDate: '2026-01-01', sprintFinishDate: '2026-01-14',
      doneValue: 0, backlogAtSprintEnd: 10 * ids.length, includedInForecast: true, createdAt: T0, updatedAt: T1,
    }],
  }
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, k) => from + k)

// ── Vendored files ──────────────────────────────────────────────────────────

const FIXTURES = join(import.meta.dirname, 'fixtures', 'own-exports-8e7506d')
/**
 * Written by THIS APP at `8e7506d` (v0.45.0) — which refused every one of them —
 * after its real Update took a project to 13 (and 22) milestones from Story Map
 * sends built as above. The build cannot regenerate them; pinned so a silent
 * edit cannot make them easier.
 */
const PINNED: Record<string, string> = {
  'sm13-workspace.json': '2bca7d4462e42723bcdf7518bc6bb97d2c8c0b7c7d45bbc72be3593db8fa262e',
  'sm13-subset-both.json': '9d1d70f42b681d7b0079ed55d01746fe8345b70923c1865b4dee2f44abe68522',
  'sm13-subset-one.json': '2d23b7a1f2d83a3c42b7af0ca734dec6a31c68805ebab59592c0f99a29de44bd',
  'sm22-workspace.json': 'f6bdb41fac13056f9f5dc3e7e91cb947e802de4aee0e3a14b5df1f4dec89469c',
  'storymap-send-1.json': '16abced97cea81ad42d0b10a8d794726ae1eee3d731ce33627f3d8d257e278d7',
}
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')

// ── Harness ─────────────────────────────────────────────────────────────────

function resetStore(): void {
  localStorage.clear()
  useProjectStore.setState({
    projects: [], sprints: [], viewingProjectId: null, forecastInputs: {}, burnUpConfigs: {},
    _originRef: '', _changeLog: [], cloudDataLoaded: false,
  })
}

async function ingest(content: string, transport: Transport) {
  const { result } = renderHook(() => useImportState())
  let out: { didApply: boolean; nackReason?: string } | undefined
  await act(async () => { out = await result.current.ingestPayload(content, transport) })
  let route = out?.didApply ? 'direct' : out?.nackReason ? 'refused' : 'preview'
  if (result.current.importPreview) {
    await act(async () => { result.current.handleConfirmMerge() })
    route = 'preview-merge'
  }
  return { route, banner: result.current.importBanner }
}

/** A native project the Update never touches. */
function seedBystander(): string {
  const s = useProjectStore.getState()
  s.addProject({ name: 'Bystander', unitOfMeasure: 'Story Points', sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-05' })
  const id = useProjectStore.getState().projects.find((p) => p.name === 'Bystander')!.id
  s.addSprint({ projectId: id, sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 12, backlogAtSprintEnd: 88, includedInForecast: true })
  s.addMilestone(id, { name: 'Native A', backlogSize: 30, color: '#10b981', showOnChart: true })
  return id
}

const tuples = (p: Project | undefined) =>
  (p?.milestones ?? []).map((m) => [m.id, m.name, m.backlogSize, m.color, m.showOnChart])

/** Fidelity: every project in the file was written with exactly the milestones `source` holds. */
function expectWritten(content: string, source: Project[]): void {
  const file = JSON.parse(content) as { projects: Project[] }
  const now = useProjectStore.getState().projects
  for (const fp of file.projects) {
    const src = source.find((p) => p.id === fp.id)
    expect(src, `source holds ${fp.name}`).toBeDefined()
    expect(fp.milestones ?? [], `the FILE carries every milestone of ${fp.name}`).toHaveLength((src!.milestones ?? []).length)
    expect(tuples(now.find((p) => p.id === fp.id)), `what the import wrote for ${fp.name}`).toEqual(tuples(src))
  }
}

const ROUTE_BANNER: Record<'workspace' | 'subset', string> = {
  workspace: 'All data replaced. 2 projects imported.',
  subset: '2 projects added.',
}

/** Export both ways, then re-import each file into an EMPTY workspace by both transports. */
async function expectRoundTrip(bystanderId: string, growthId: string, expected: number): Promise<void> {
  const source = structuredClone(useProjectStore.getState().projects)
  expect(source.find((p) => p.id === growthId)!.milestones).toHaveLength(expected)
  const s = useProjectStore.getState()
  const files = {
    workspace: JSON.stringify(s.exportData(), null, 2),
    subset: JSON.stringify(buildProjectSubsetExport([bystanderId, growthId], {
      projects: s.projects, sprints: s.sprints, originRef: s._originRef || getWorkspaceId(),
      storageRef: getWorkspaceId(), changeLog: s._changeLog,
    }), null, 2),
  }
  for (const kind of ['workspace', 'subset'] as const) {
    for (const t of TRANSPORTS) {
      resetStore()
      const { route, banner } = await ingest(files[kind], t)
      expect({ route, kind: banner?.kind, text: banner?.text }, `${kind} by ${t}`)
        .toEqual({ route: 'direct', kind: 'success', text: ROUTE_BANNER[kind] })
      expectWritten(files[kind], source)
    }
  }
}

beforeEach(() => resetStore())

describe('the Story Map send builder', () => {
  it('reproduces Story Map\'s real exporter output byte for byte (bar the timestamp)', () => {
    const real = JSON.parse(fixture('storymap-send-1.json')) as Obj
    expect({ ...storyMapSend(range(0, L)), exportedAt: real.exportedAt }).toEqual(real)
  })
})

describe('P1 — over-limit states round-trip from both of this app\'s exports, with fidelity', () => {
  async function sendAll(sends: Obj[], growthId = 'prod-growth'): Promise<void> {
    for (const send of sends) await ingest(JSON.stringify(send), 'file')
    expect(useProjectStore.getState().projects.some((p) => p.id === growthId)).toBe(true)
  }

  it('delete-and-replace in Story Map: three releases swapped', async () => {
    const bystander = seedBystander()
    await sendAll([storyMapSend(range(0, L)), storyMapSend(range(3, L))])
    await expectRoundTrip(bystander, 'prod-growth', L + 3)
  })

  it('Story Map\'s remedy for an 11th release: one deleted (or emptied — the sends are identical)', async () => {
    const bystander = seedBystander()
    await sendAll([storyMapSend(range(0, L)), storyMapSend(range(1, L))])
    await expectRoundTrip(bystander, 'prod-growth', L + 1)
  })

  it('native milestones plus growth', async () => {
    const bystander = seedBystander()
    await sendAll([storyMapSend(range(0, L - 3))])
    for (const n of [1, 2, 3]) useProjectStore.getState().addMilestone('prod-growth', { name: `Native ${n}`, backlogSize: 5 * n, color: '#3b82f6', showOnChart: n !== 2 })
    await sendAll([storyMapSend(range(0, L))])
    await expectRoundTrip(bystander, 'prod-growth', L + 3)
  })

  it('completed native milestones', async () => {
    const bystander = seedBystander()
    await sendAll([storyMapSend(range(0, L - 3))])
    for (const n of [1, 2, 3]) useProjectStore.getState().addMilestone('prod-growth', { name: `Done ${n}`, backlogSize: 0, color: '#10b981', showOnChart: true })
    await sendAll([storyMapSend(range(0, L))])
    const growth = useProjectStore.getState().projects.find((p) => p.id === 'prod-growth')!
    expect(growth.milestones!.filter((m) => m.backlogSize === 0)).toHaveLength(3)
    await expectRoundTrip(bystander, 'prod-growth', L + 3)
  })

  it('repeated Updates to at least 22', async () => {
    const bystander = seedBystander()
    await sendAll([0, 3, 6, 9, 12].map((from) => storyMapSend(range(from, L))))
    await expectRoundTrip(bystander, 'prod-growth', 2 * L + 2)
  })

  it('a name-conflict Update (same name, shared sprint, new project id)', async () => {
    const bystander = seedBystander()
    await sendAll([storyMapSend(range(0, L))])
    const { route } = await ingest(JSON.stringify(storyMapSend(range(3, L), 'prod-moved')), 'file')
    expect(route, 'the name conflict offers Update, and it is the default').toBe('preview-merge')
    await expectRoundTrip(bystander, 'prod-growth', L + 3)
  })
})

describe('P3 — files 8e7506d already wrote now heal', () => {
  it.each(Object.entries(PINNED))('%s is byte-identical to what was vendored', (name, sha) => {
    expect(createHash('sha256').update(readFileSync(join(FIXTURES, name))).digest('hex')).toBe(sha)
  })

  const CASES = [
    ['sm13-workspace.json', 'workspace', 13],
    ['sm13-subset-both.json', 'subset', 13],
    ['sm13-subset-one.json', 'subset-one', 13],
    ['sm22-workspace.json', 'workspace', 22],
  ] as const

  for (const [name, kind, count] of CASES) {
    for (const t of TRANSPORTS) {
      it(`${name} by ${t} re-imports into an empty workspace with fidelity`, async () => {
        const content = fixture(name)
        const file = JSON.parse(content) as { projects: Project[] }
        expect(file.projects.find((p) => p.name === 'Growth Product')!.milestones, 'the file is over the old limit')
          .toHaveLength(count)
        const { route, banner } = await ingest(content, t)
        expect(route).toBe('direct')
        expect(banner?.text).toBe(kind === 'workspace' ? ROUTE_BANNER.workspace : kind === 'subset' ? ROUTE_BANNER.subset : '1 project added.')
        expectWritten(content, file.projects)
      })
    }
  }
})
