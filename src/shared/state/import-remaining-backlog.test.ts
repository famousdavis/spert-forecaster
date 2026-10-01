// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Story Map v0.53.8 sends REMAINING work in `milestone.backlogSize`, and says so
 * with a top-level `milestoneBacklog: 'remaining'`. Older files send each
 * release's TOTAL with no declaration. These checks pin what an Update does with
 * each kind (docs/SPEC_DEVIATIONS.md SD-5).
 *
 * ⚠️ EVERY CHECK RUNS THROUGH THE REAL PIPELINE where a payload is involved:
 * `validateImportData` → `classifyImportData` → `detectImportConflicts` →
 * `applyImportDecisions`, and again through the store's `applySmartImport`. The
 * basis lives on the classified PAYLOAD, so a check that calls the merge
 * functions directly cannot see whether it was ever threaded through.
 *
 * ⚠️ Known-bad mutations this file was run against, each alone, each red: see
 * the PR for Brief 36. Among them `min(prior, incoming)`, which only the
 * increase and reopen cases below can see — a test that only ever decreases
 * cannot tell it from take-incoming.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateImportData } from './import-validation'
import {
  applyImportDecisions,
  classifyImportData,
  detectImportConflicts,
  type ConflictAction,
  type ParsedImportData,
} from './import-utils'
import { useProjectStore } from './project-store'
import { STORAGE_KEY } from './storage'
import { getLastSprintBacklog } from '@/shared/lib/forecast-derivations'
import { buildImportBannerDetails } from '@/features/projects/lib/import-banner'
import { buildProjectSubsetExport } from '@/features/projects/lib/export-project'
import { projectToFirestoreDoc } from '@/shared/firebase/firestore-converters'
import type { Milestone, Project, Sprint } from '@/shared/types'

type Obj = Record<string, unknown>

// ── Payloads ────────────────────────────────────────────────────────────────

const CANONICAL_PATH = join(import.meta.dirname, 'storymap-contract', 'fixtures', 'canonical-export.json')
/** The vendored canonical v0.53.8 payload: milestones rel-1 = 11, rel-2 = 28. */
const canonical = (): Obj => JSON.parse(readFileSync(CANONICAL_PATH, 'utf8')) as Obj

/**
 * Brief 36's Appendix A product, exported by Story Map's REAL `buildForecasterExport`
 * after sprint 2 and after sprint 3 — three releases, one rib (F, 10 points)
 * allocated to none. Generated from spert-story-map's exporter, whose import
 * closure is code-identical at 74397e7 and at the v0.53.8 merge 6c874ed (only
 * comments differ); `exportedAt` removed for determinism. Transcribed, so it
 * cannot follow a later Story Map change — the vendored set is what does that.
 */
const appendixA = (afterSprint: 2 | 3): Obj => {
  const sprints = [
    { id: 's1', projectId: 'p1', sprintNumber: 1, sprintStartDate: '2026-01-01', sprintFinishDate: '2026-01-14', doneValue: 20, backlogAtSprintEnd: 120, includedInForecast: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 's2', projectId: 'p1', sprintNumber: 2, sprintStartDate: '2026-01-15', sprintFinishDate: '2026-01-28', doneValue: 10, backlogAtSprintEnd: 110, includedInForecast: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 's3', projectId: 'p1', sprintNumber: 3, sprintStartDate: '2026-01-29', sprintFinishDate: '2026-02-11', doneValue: 40, backlogAtSprintEnd: 70, includedInForecast: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
  ].slice(0, afterSprint)
  const figures = afterSprint === 2 ? [30, 50, 20] : [10, 30, 20]
  const colours = ['#2563eb', '#0d9488', '#7c3aed']
  return {
    version: '1.0',
    source: 'spert-story-map',
    milestoneBacklog: 'remaining',
    projects: [{
      id: 'p1', name: 'Harness', unitOfMeasure: 'Story Points',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
      sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-01',
      milestones: ['MVP', 'Beta', 'GA'].map((name, i) => ({
        id: `R${i + 1}`, name, backlogSize: figures[i], color: colours[i], showOnChart: true,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
      })),
    }],
    sprints,
  }
}

const withoutMarker = (payload: Obj): Obj => {
  const copy = { ...payload }
  delete copy.milestoneBacklog
  return copy
}

/** validate → classify, exactly as `ingestPayload` does. */
function parse(payload: Obj): ParsedImportData {
  validateImportData(payload)
  return classifyImportData(payload as never)
}

/** A decided `update` for every conflict, through the pure merge. */
function update(existing: Project[], existingSprints: Sprint[], incoming: ParsedImportData) {
  const conflicts = detectImportConflicts(incoming, existing)
  expect(conflicts.length, 'the re-send must conflict with what is held').toBeGreaterThan(0)
  const decisions = new Map<string, ConflictAction>(conflicts.map((c) => [c.incomingProject.id, 'update']))
  return applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
}

/** A first send into an empty workspace, through the pure merge. */
function firstSend(payload: Obj) {
  const parsed = parse(payload)
  return applyImportDecisions([], [], parsed, new Map(), [])
}

const figuresOf = (p: Project | undefined) => (p?.milestones ?? []).map((m) => m.backlogSize)

function resetStore() {
  localStorage.clear()
  useProjectStore.setState({
    projects: [], sprints: [], viewingProjectId: null, forecastInputs: {}, burnUpConfigs: {},
    _originRef: '', _changeLog: [],
  })
}

/** Both sends through the STORE, the way the import hook drives it. */
function storeSends(first: Obj, second: Obj) {
  const one = parse(first)
  const added = useProjectStore.getState().applySmartImport({
    incoming: one, decisions: new Map(), freshConflicts: [], source: one.exportType,
  })
  expect(added.ok).toBe(true)
  const two = parse(second)
  const freshConflicts = detectImportConflicts(two, useProjectStore.getState().projects)
  const decisions = new Map<string, ConflictAction>(freshConflicts.map((c) => [c.incomingProject.id, 'update']))
  const updated = useProjectStore.getState().applySmartImport({
    incoming: two, decisions, freshConflicts, source: two.exportType,
  })
  expect(updated.ok && updated.result.updated).toBe(1)
  return useProjectStore.getState()
}

beforeEach(resetStore)

// ── P8 · the owner's workflow, end to end ───────────────────────────────────

describe('P8 — send after sprint 2, re-send on Update after sprint 3', () => {
  it('pure pipeline: a v0.53.8 re-send takes Story Map\'s figures', () => {
    const one = firstSend(appendixA(2))
    expect(figuresOf(one.mergedProjects[0])).toEqual([30, 50, 20])
    const two = update(one.mergedProjects, one.mergedSprints, parse(appendixA(3)))
    expect(figuresOf(two.mergedProjects[0])).toEqual([10, 30, 20])
    // The figures and the default backlog now describe the same moment.
    expect(getLastSprintBacklog(two.mergedSprints)).toBe(70)
  })

  it('pure pipeline: the same re-send WITHOUT the declaration keeps the held figures', () => {
    const one = firstSend(appendixA(2))
    const two = update(one.mergedProjects, one.mergedSprints, parse(withoutMarker(appendixA(3))))
    expect(figuresOf(two.mergedProjects[0])).toEqual([30, 50, 20])
  })

  it('store: a v0.53.8 re-send takes Story Map\'s figures', () => {
    const state = storeSends(appendixA(2), appendixA(3))
    expect(figuresOf(state.projects[0])).toEqual([10, 30, 20])
  })

  it('store: the same re-send WITHOUT the declaration keeps the held figures', () => {
    const state = storeSends(appendixA(2), withoutMarker(appendixA(3)))
    expect(figuresOf(state.projects[0])).toEqual([30, 50, 20])
  })
})

// ── P1 · a legacy file never overwrites the figures held here ───────────────

describe('P1 — a file without the declaration keeps every matched figure', () => {
  it('the canonical payload, declaration deleted, through the real pipeline', () => {
    const base = parse(canonical())
    const held: Project = {
      ...base.projects[0],
      milestones: (base.projects[0].milestones ?? []).map((m, i) => ({ ...m, backlogSize: [5, 9][i] })),
    }
    const incoming = parse(withoutMarker(canonical()))
    expect(incoming.exportType === 'spert-story-map' && incoming.milestoneBacklog).toBe('total')
    // The incoming figures (11, 28) differ from the held ones, or this proves nothing.
    expect(figuresOf(incoming.projects[0])).toEqual([11, 28])
    const out = update([held], base.sprints, incoming)
    expect(figuresOf(out.mergedProjects[0])).toEqual([5, 9])
    expect(out.result.disclosures[0].milestonesChanged).toEqual([])
  })
})

// ── P2 · a v0.53.8 file takes Story Map's figure, in every direction ────────

describe('P2 — a declared remaining-work file takes the incoming figure', () => {
  // Four matched milestones, one per direction. Every held figure differs from
  // its incoming one, so a rule that keeps, or that takes only smaller figures
  // (min), fails on at least one row.
  const ms = (o: Partial<Milestone> & { id: string }): Milestone => ({
    name: `Release ${o.id}`, backlogSize: 1, color: '#2563eb', showOnChart: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...o,
  })
  const DIRECTIONS = [
    { id: 'down', held: 20, sent: 11, label: 'decrease' },
    { id: 'up', held: 5, sent: 28, label: 'increase (scope added back)' },
    { id: 'done', held: 7, sent: 0, label: 'completion (>0 → 0)' },
    { id: 'again', held: 0, sent: 4, label: 'reopen (0 → >0)' },
  ] as const

  function run(declared: boolean) {
    const payload = canonical()
    const project = (payload.projects as Obj[])[0]
    project.milestones = DIRECTIONS.map((d) => ms({ id: d.id, backlogSize: d.sent }))
    if (!declared) delete payload.milestoneBacklog
    const incoming = parse(payload)
    const held: Project = {
      ...incoming.projects[0],
      milestones: DIRECTIONS.map((d) => ms({ id: d.id, backlogSize: d.held })),
    }
    return update([held], incoming.sprints, incoming)
  }

  it.each(DIRECTIONS)('$label: takes Story Map\'s figure', (d) => {
    const merged = run(true).mergedProjects[0].milestones!.find((m) => m.id === d.id)
    expect(merged?.backlogSize).toBe(d.sent)
  })

  it('reports every replaced figure, old → new, from the write-time merge', () => {
    expect(run(true).result.disclosures[0].milestonesChanged).toEqual(
      DIRECTIONS.map((d) => ({ name: `Release ${d.id}`, from: d.held, to: d.sent })),
    )
  })

  it('the same fixture WITHOUT the declaration keeps every held figure', () => {
    const merged = run(false).mergedProjects[0].milestones!
    expect(merged.map((m) => m.backlogSize)).toEqual(DIRECTIONS.map((d) => d.held))
  })
})

// ── P4 · only the exact string declares remaining work ──────────────────────

describe('P4 — every non-exact declaration is treated as a legacy file', () => {
  const NOT_REMAINING: Array<[string, unknown]> = [
    ['"Remaining"', 'Remaining'],
    ['true', true],
    ['"total"', 'total'],
    ['""', ''],
    ['["remaining"] — passes == and String(x)', ['remaining']],
    ['"remaining " — trailing space', 'remaining '],
    ['null', null],
    ['1', 1],
    ['{}', {}],
  ]

  it.each(NOT_REMAINING)('%s → total, and the file still imports', (_label, value) => {
    const payload = canonical()
    payload.milestoneBacklog = value
    const parsed = parse(payload)
    expect(parsed.exportType === 'spert-story-map' && parsed.milestoneBacklog).toBe('total')
  })

  it('absent → total', () => {
    const parsed = parse(withoutMarker(canonical()))
    expect(parsed.exportType === 'spert-story-map' && parsed.milestoneBacklog).toBe('total')
  })

  it('exactly "remaining" → remaining (the positive control for every row above)', () => {
    const parsed = parse(canonical())
    expect(parsed.exportType === 'spert-story-map' && parsed.milestoneBacklog).toBe('remaining')
  })

  it('a declaration on a legacy file yields no basis at all', () => {
    const payload = canonical()
    delete payload.source
    const parsed = parse(payload)
    expect(parsed.exportType).toBe('legacy')
    expect('milestoneBacklog' in parsed).toBe(false)
  })

  it('a declaration on a project-export file yields no basis at all', () => {
    const payload = canonical()
    delete payload.source
    payload._exportType = 'spert-forecaster-project-export'
    const parsed = parse(payload)
    expect(parsed.exportType).toBe('spert-forecaster-project-export')
    expect('milestoneBacklog' in parsed).toBe(false)
  })
})

// ── P5 · the banner, for both kinds of file ─────────────────────────────────

describe('P5 — the disclosure says what each kind of file did', () => {
  // Held: a matched milestone, and a completed one Story Map now says has work.
  // Sent: both matched with new figures, plus a release this app has not seen.
  function bannerFor(declared: boolean, resend = false) {
    const base = parse(canonical())
    const held: Project = {
      ...base.projects[0],
      milestones: [
        { ...base.projects[0].milestones![0], backlogSize: 25 }, // rel-1: 25 → 11
        { ...base.projects[0].milestones![1], backlogSize: 0 }, // rel-2: 0 → 28, a reopen
      ],
    }
    const payload = canonical()
    const project = (payload.projects as Obj[])[0]
    const template = (project.milestones as Obj[])[0]
    project.milestones = [
      ...(project.milestones as Obj[]),
      { ...template, id: 'rel-new', name: 'Brand New Release', backlogSize: 6 },
    ]
    if (!declared) delete payload.milestoneBacklog
    const incoming = parse(payload)
    const once = update([held], base.sprints, incoming)
    if (!resend) return buildImportBannerDetails(once.result).join(' • ')
    const twice = update(once.mergedProjects, once.mergedSprints, parse(payload))
    return buildImportBannerDetails(twice.result).join(' • ')
  }

  it('remaining: the added milestone\'s figure is called the work remaining, never total scope', () => {
    const text = bannerFor(true)
    expect(text).toContain('Brand New Release')
    expect(text).toMatch(/work remaining in that release/i)
    expect(text).not.toMatch(/TOTAL scope/i)
  })

  it('remaining: names each replaced figure old → new, and names the reopen as such', () => {
    const text = bannerFor(true)
    expect(text).toMatch(/took Story Map's remaining work for 2 milestones/i)
    expect(text).toContain('Release One 25 → 11')
    expect(text).toContain('Release Two 0 → 28 (reopened)')
  })

  it('remaining: names a completion as such', () => {
    const base = parse(canonical())
    const held: Project = {
      ...base.projects[0],
      milestones: [{ ...base.projects[0].milestones![0], backlogSize: 8 }, base.projects[0].milestones![1]],
    }
    const payload = canonical()
    ;((payload.projects as Obj[])[0].milestones as Obj[])[0].backlogSize = 0
    const text = buildImportBannerDetails(update([held], base.sprints, parse(payload)).result).join(' • ')
    expect(text).toContain('Release One 8 → 0 (now completed)')
  })

  it('remaining: an identical re-send names nothing as replaced', () => {
    const text = bannerFor(true, true)
    expect(text).not.toMatch(/took Story Map's remaining work/i)
    expect(text).not.toMatch(/→/)
  })

  it('legacy: keeps the total-scope warning and replaces nothing', () => {
    const text = bannerFor(false)
    expect(text).toMatch(/TOTAL scope for that release, not the work remaining, so check each one/i)
    expect(text).not.toMatch(/took Story Map's remaining work/i)
    expect(text).not.toMatch(/reopen/i)
  })

  it('both: the placement line claims no direction', () => {
    for (const declared of [true, false]) {
      const base = parse(canonical())
      const held: Project = {
        ...base.projects[0],
        milestones: [
          ...base.projects[0].milestones!,
          { ...base.projects[0].milestones![0], id: 'native', name: 'My Own Milestone', backlogSize: 15 },
        ],
      }
      const payload = canonical()
      if (!declared) delete payload.milestoneBacklog
      const text = buildImportBannerDetails(update([held], base.sprints, parse(payload)).result).join(' • ')
      expect(text).toMatch(/placed after the imported ones/i)
      expect(text).not.toMatch(/moves later/i)
    }
  })
})

// ── P7 · the declaration is never stored ────────────────────────────────────

describe('P7 — the declaration describes a payload, so nothing ever stores it', () => {
  const carries = (o: unknown) => JSON.stringify(o ?? null).includes('milestoneBacklog')
  const persistedCarrying = () => {
    const hits: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      if ((localStorage.getItem(key) ?? '').includes('milestoneBacklog')) hits.push(key)
    }
    return hits
  }

  it('after a first send and an Update: not in the store, storage, a Firestore write or any export', () => {
    const state = storeSends(appendixA(2), appendixA(3))
    const project = state.projects[0]
    expect(carries(state)).toBe(false)
    expect(persistedCarrying()).toEqual([])
    expect(carries(projectToFirestoreDoc(project, state.sprints, 'uid', undefined, state._originRef, state._changeLog))).toBe(false)
    expect(carries(state.exportData())).toBe(false)
    expect(carries(buildProjectSubsetExport([project.id], {
      projects: state.projects, sprints: state.sprints, changeLog: state._changeLog,
      originRef: state._originRef, storageRef: 'storage-ref',
    }))).toBe(false)
  })

  it('CONTROL: the persisted blob holds the project, and the detector fires on a planted key', () => {
    // Without these two, every absence above passes on an empty store.
    const state = storeSends(appendixA(2), appendixA(3))
    expect(localStorage.getItem(STORAGE_KEY) ?? '').toContain(state.projects[0].id)
    localStorage.setItem('planted', JSON.stringify({ milestoneBacklog: 'remaining' }))
    expect(persistedCarrying()).toEqual(['planted'])
    expect(carries({ milestoneBacklog: 'remaining' })).toBe(true)
  })
})
