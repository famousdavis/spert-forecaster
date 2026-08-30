// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Checks C1–C18 for the Story Map `update` action.
//
// ⚠️ EVERY CHECK HERE WAS RUN AGAINST ITS KNOWN-BAD FIRST. Three tests in this
// codebase's history were green and vacuous, and all three were found by
// running the known-bad rather than by reading the suite. Where a check has a
// subtle failure mode, the known-bad it was validated against is named in a
// comment above it.

import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyImportDecisions,
  availableActions,
  hasMatchingExistingSprintId,
  hasUnmatchedExistingSprints,
  mergeMilestonesForUpdate,
  mergeProjectForUpdate,
  mergeSprintsForUpdate,
  detectImportConflicts,
  conflictsEqual,
  type ConflictAction,
  type ParsedImportData,
} from './import-utils'
import { useProjectStore } from './project-store'
import { useForecastResultsStore } from './forecast-results-store'
import { computeCumulativeThresholds } from '@/shared/lib/forecast-derivations'
import { buildImportBannerDetails } from '@/features/projects/lib/import-banner'
import { DEFAULT_BURN_UP_CONFIG } from '@/shared/types/burn-up'
import type { Milestone, Project, Sprint } from '@/shared/types'

// --- Fixtures -------------------------------------------------------------

const EXISTING_PROJECT_ID = 'prod-1'

function milestone(o: Partial<Milestone> & { id: string }): Milestone {
  return {
    name: o.name ?? `M-${o.id}`,
    backlogSize: o.backlogSize ?? 100,
    color: o.color ?? '#2563eb',
    showOnChart: o.showOnChart ?? true,
    createdAt: o.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: o.updatedAt ?? '2025-01-01T00:00:00.000Z',
    ...o,
  }
}

function sprint(o: Partial<Sprint> & { id: string; projectId: string }): Sprint {
  return {
    sprintNumber: o.sprintNumber ?? 1,
    sprintStartDate: o.sprintStartDate ?? '2026-01-01',
    sprintFinishDate: o.sprintFinishDate ?? '2026-01-14',
    doneValue: o.doneValue ?? 10,
    backlogAtSprintEnd: o.backlogAtSprintEnd ?? 90,
    includedInForecast: o.includedInForecast ?? true,
    createdAt: o.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: o.updatedAt ?? '2025-01-01T00:00:00.000Z',
    ...o,
  }
}

/** The user's project as it stands before the re-import: fully configured. */
function existingProject(o: Partial<Project> = {}): Project {
  return {
    id: EXISTING_PROJECT_ID,
    name: 'Local Name',
    unitOfMeasure: 'Hours', // NOT Story Points — local-producer-artifact must protect this
    sprintCadenceWeeks: 2,
    firstSprintStartDate: '2026-01-01',
    projectStartDate: '2026-01-01', // local-restore-defensive
    projectFinishDate: '2026-12-31', // local-restore-defensive
    productivityAdjustments: [
      {
        id: 'pa-1',
        name: 'Holiday',
        startDate: '2026-07-01',
        endDate: '2026-07-14',
        factor: 0.5,
        enabled: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    milestones: [milestone({ id: 'rel-1', name: 'Local MVP', backlogSize: 40 })],
    createdAt: '2020-06-15T00:00:00.000Z', // local-restore-required — must survive
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...o,
  }
}

/** A Story Map export of the same product: same id, fresher derivation. */
function storyMapPayload(o: {
  projects?: Project[]
  sprints?: Sprint[]
} = {}): ParsedImportData {
  return {
    exportType: 'spert-story-map',
    projects: o.projects ?? [
      {
        id: EXISTING_PROJECT_ID,
        name: 'Story Map Name',
        unitOfMeasure: 'Story Points', // hardcoded by the producer
        sprintCadenceWeeks: 3,
        firstSprintStartDate: '2026-02-01',
        milestones: [milestone({ id: 'rel-1', name: 'Producer MVP', backlogSize: 999 })],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    sprints: o.sprints ?? [
      sprint({
        id: 'sp-1',
        projectId: EXISTING_PROJECT_ID,
        sprintNumber: 1,
        doneValue: 22,
        includedInForecast: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
    ],
  }
}

function runUpdate(
  existing: Project[],
  existingSprints: Sprint[],
  incoming: ParsedImportData,
  action: ConflictAction = 'update',
) {
  const conflicts = detectImportConflicts(incoming, existing)
  const decisions = new Map<string, ConflictAction>(
    conflicts.map((c) => [c.incomingProject.id, action]),
  )
  return applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
}

// --- C1 / C2 / C3 / C17: what survives ------------------------------------

describe('C1 — the four local-restore-defensive fields hold pre-import values', () => {
  it('preserves projectStartDate, projectFinishDate, productivityAdjustments, customFinishDate', () => {
    const existing = existingProject()
    const sprints = [
      sprint({
        id: 'sp-1',
        projectId: EXISTING_PROJECT_ID,
        customFinishDate: '2026-01-20', // local-restore-defensive, on the sprint
      }),
    ]
    const { mergedProjects, mergedSprints } = runUpdate([existing], sprints, storyMapPayload())
    const p = mergedProjects[0]
    expect(p.projectStartDate).toBe('2026-01-01')
    expect(p.projectFinishDate).toBe('2026-12-31')
    expect(p.productivityAdjustments).toHaveLength(1)
    expect(p.productivityAdjustments?.[0].name).toBe('Holiday')
    // C2 — the matched sprint's custom finish date survives.
    expect(mergedSprints.find((s) => s.id === 'sp-1')?.customFinishDate).toBe('2026-01-20')
  })

  it('preserves unitOfMeasure — local-producer-artifact, the producer hardcodes Story Points', () => {
    const { mergedProjects } = runUpdate([existingProject()], [], storyMapPayload())
    expect(mergedProjects[0].unitOfMeasure).toBe('Hours')
  })
})

describe('C3 — a sprint excluded here stays excluded under incoming true', () => {
  it('preserves includedInForecast on a matched sprint (local-restore-required override)', () => {
    const sprints = [
      sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID, includedInForecast: false }),
    ]
    const { mergedSprints } = runUpdate([existingProject()], sprints, storyMapPayload())
    // Incoming says true; the user's exclusion wins.
    expect(mergedSprints.find((s) => s.id === 'sp-1')?.includedInForecast).toBe(false)
  })
})

describe('C17 — local-restore-required and stamp timestamps', () => {
  it('createdAt is the pre-import value on a matched entity, updatedAt is neither side', () => {
    const before = Date.now()
    const sprints = [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })]
    const { mergedProjects, mergedSprints } = runUpdate(
      [existingProject()],
      sprints,
      storyMapPayload(),
    )
    const p = mergedProjects[0]
    // local-restore-required — Story Map EMITS createdAt, so this only passes with an explicit
    // restore. Known-bad: drop the `createdAt: existing.createdAt` line and
    // this reads 2026-01-01 (incoming's) instead.
    expect(p.createdAt).toBe('2020-06-15T00:00:00.000Z')
    // stamp — neither incoming's nor the pre-import value.
    expect(p.updatedAt).not.toBe('2026-02-01T00:00:00.000Z')
    expect(p.updatedAt).not.toBe('2025-01-01T00:00:00.000Z')
    expect(new Date(p.updatedAt!).getTime()).toBeGreaterThanOrEqual(before)

    const s = mergedSprints.find((x) => x.id === 'sp-1')!
    expect(s.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(s.updatedAt).not.toBe('2026-02-01T00:00:00.000Z')
  })

  it('createdAt comes from incoming on a NEWLY ADDED sprint — local-restore-required presupposes a local value', () => {
    const incoming = storyMapPayload({
      sprints: [
        sprint({
          id: 'sp-NEW',
          projectId: EXISTING_PROJECT_ID,
          createdAt: '2026-03-03T00:00:00.000Z',
        }),
      ],
    })
    // No existing sprints, so sp-NEW is incoming-only and §4.1 does not refuse.
    const { mergedSprints } = runUpdate([existingProject()], [], incoming)
    expect(mergedSprints.find((s) => s.id === 'sp-NEW')?.createdAt).toBe(
      '2026-03-03T00:00:00.000Z',
    )
  })
})

// --- C4: `incoming` genuinely changes -------------------------------------

describe('C4 — class-1 fields DO change', () => {
  // This check exists because C1, C2, C3 and C5 all pass on a no-op merge that
  // simply returns the existing project. Without it the suite would be green
  // while `update` did nothing at all.
  it('takes name, cadence, doneValue, milestone name and a new sprint from incoming', () => {
    const existing = existingProject({
      // ⚠️ NON-COMPLETED milestone: a backlogSize-0 milestone is a cell-3
      // preserve and would never show the name change this asserts.
      milestones: [milestone({ id: 'rel-1', name: 'Local MVP', backlogSize: 40 })],
    })
    const existingSprints = [
      sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID, doneValue: 5 }),
    ]
    const incoming = storyMapPayload({
      sprints: [
        sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID, doneValue: 22 }),
        sprint({ id: 'sp-2', projectId: EXISTING_PROJECT_ID, sprintNumber: 2, doneValue: 30 }),
      ],
    })
    const { mergedProjects, mergedSprints } = runUpdate(
      [existing],
      existingSprints,
      incoming,
    )
    const p = mergedProjects[0]
    expect(p.name).toBe('Story Map Name')
    expect(p.sprintCadenceWeeks).toBe(3)
    expect(p.firstSprintStartDate).toBe('2026-02-01')
    expect(p.milestones?.[0].name).toBe('Producer MVP')
    // ⚠️ Deliberately NOT asserting backlogSize changed — it is
    // local-restore-required, and an
    // earlier draft of this check mandated the very defect §4.4 exists to stop.
    expect(p.milestones?.[0].backlogSize).toBe(40)
    expect(mergedSprints.find((s) => s.id === 'sp-1')?.doneValue).toBe(22)
    expect(mergedSprints.find((s) => s.id === 'sp-2')).toBeDefined()
  })

  it('takes incoming milestone ORDER (`incoming`)', () => {
    const existing = existingProject({
      milestones: [
        milestone({ id: 'a', name: 'A', backlogSize: 10 }),
        milestone({ id: 'b', name: 'B', backlogSize: 20 }),
      ],
    })
    const incoming = storyMapPayload({
      projects: [
        {
          ...existingProject(),
          unitOfMeasure: 'Story Points',
          milestones: [
            milestone({ id: 'b', name: 'B', backlogSize: 999 }),
            milestone({ id: 'a', name: 'A', backlogSize: 999 }),
          ],
        },
      ],
      sprints: [],
    })
    const { mergedProjects } = runUpdate([existing], [], incoming)
    expect(mergedProjects[0].milestones?.map((m) => m.id)).toEqual(['b', 'a'])
  })
})

// --- C15: the placement rule ----------------------------------------------

describe('C15 — preserved unmatched-existing milestones are APPENDED', () => {
  it('appends after the incoming-ordered set, keeps local relative order, and moves the kept milestone’s own threshold', () => {
    // incoming [A:100, B:100] + preserved X:50 — the brief's worked example.
    const existing = existingProject({
      milestones: [
        milestone({ id: 'x', name: 'X', backlogSize: 50 }), // local FIRST
        milestone({ id: 'a', name: 'A', backlogSize: 100 }),
        milestone({ id: 'b', name: 'B', backlogSize: 100 }),
      ],
    })
    const incoming = storyMapPayload({
      projects: [
        {
          ...existingProject(),
          unitOfMeasure: 'Story Points',
          milestones: [
            milestone({ id: 'a', name: 'A', backlogSize: 999 }),
            milestone({ id: 'b', name: 'B', backlogSize: 999 }),
          ],
        },
      ],
      sprints: [],
    })
    const { mergedProjects } = runUpdate([existing], [], incoming)
    const ms = mergedProjects[0].milestones!
    expect(ms.map((m) => m.id)).toEqual(['a', 'b', 'x'])

    const thresholds = computeCumulativeThresholds(ms)
    expect(thresholds).toEqual([100, 200, 250])
    // ⚠️ THE COST, PINNED. X sat first locally with a threshold of 50 and now
    // sits last at 250 — its own forecast date moves with it. Any other
    // placement gives [50,150,250] or [100,150,250]; this asserts the one the
    // design chose, so a silent change to it reds here.
    expect(thresholds[ms.findIndex((m) => m.id === 'x')]).toBe(250)
  })

  it('keeps local relative order among several preserved milestones', () => {
    const kept = mergeMilestonesForUpdate(
      [
        milestone({ id: 'k1', backlogSize: 5 }),
        milestone({ id: 'inc', backlogSize: 1 }),
        milestone({ id: 'k2', backlogSize: 7 }),
      ],
      [milestone({ id: 'inc', backlogSize: 1 })],
      'ts',
    )
    expect(kept.milestones.map((m) => m.id)).toEqual(['inc', 'k1', 'k2'])
  })

  it('a cell-3 (completed) milestone is placement-insensitive', () => {
    const r = mergeMilestonesForUpdate(
      [milestone({ id: 'done', backlogSize: 0 }), milestone({ id: 'a', backlogSize: 100 })],
      [milestone({ id: 'a', backlogSize: 100 })],
      'ts',
    )
    // Appended last, contributes no increment: earlier thresholds unmoved.
    expect(computeCumulativeThresholds(r.milestones)).toEqual([100, 100])
    expect(r.keptCompleted).toBe(1)
    expect(r.kept).toEqual([])
  })
})

// --- C7 / C6: availability ------------------------------------------------

describe('C7 — availableActions gates `update`', () => {
  it('excludes update for a non-Story-Map payload', () => {
    expect(availableActions('id', 'spert-forecaster-project-export', false, true))
      .not.toContain('update')
    expect(availableActions('id', 'legacy', false, true)).not.toContain('update')
  })
  it('excludes update for a name conflict with NO matching sprint id', () => {
    expect(availableActions('name', 'spert-story-map', false, false)).not.toContain('update')
  })
  it('OFFERS update for a name conflict WITH a matching sprint id', () => {
    // The post-migration re-send: the project id was reassigned, so this
    // classifies as a name conflict, but a shared sprint id still proves
    // identity. Withholding `update` here left only `replace`.
    expect(availableActions('name', 'spert-story-map', false, true)).toContain('update')
  })
  it('excludes update when an existing sprint is unmatched (§4.1)', () => {
    expect(availableActions('id', 'spert-story-map', true, true)).not.toContain('update')
    // §4.1 refuses even with identity evidence — it is checked first.
    expect(availableActions('name', 'spert-story-map', true, true)).not.toContain('update')
  })
  it('offers update for an id conflict WITHOUT a matching sprint id (§5 Q1)', () => {
    // An id conflict IS the positive evidence; a sprint-less project supplies
    // no additional evidence but does not retract it.
    expect(availableActions('id', 'spert-story-map', false, false)).toContain('update')
  })
  it('offers update, in order, when the payload and evidence conditions hold', () => {
    expect(availableActions('id', 'spert-story-map', false, false)).toEqual([
      'skip',
      'copy',
      'replace',
      'update',
    ])
  })
})

describe('C6 — §4.1 refusal, and sprintNumber uniqueness', () => {
  it('fires when the existing project holds a sprint the incoming set lacks', () => {
    const existingSprints = [
      sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID }),
      sprint({ id: 'sp-LOCAL', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
    ]
    expect(
      hasUnmatchedExistingSprints(
        existingSprints,
        [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })],
        EXISTING_PROJECT_ID,
        EXISTING_PROJECT_ID,
      ),
    ).toBe(true)
  })

  it('does not fire when every existing sprint is present in the incoming set', () => {
    const existingSprints = [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })]
    expect(
      hasUnmatchedExistingSprints(
        existingSprints,
        [
          sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID }),
          sprint({ id: 'sp-2', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
        ],
        EXISTING_PROJECT_ID,
        EXISTING_PROJECT_ID,
      ),
    ).toBe(false)
  })

  it('ignores sprints belonging to OTHER projects', () => {
    const existingSprints = [sprint({ id: 'other', projectId: 'someone-else' })]
    expect(
      hasUnmatchedExistingSprints(existingSprints, [], EXISTING_PROJECT_ID, EXISTING_PROJECT_ID),
    ).toBe(false)
  })

  it('the merged sprint set has unique sprintNumbers — no mixed numbering', () => {
    // Story Map renumbers positionally; taking incoming wholesale is what keeps
    // the set internally consistent.
    const existingSprints = [
      sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID, sprintNumber: 1 }),
      sprint({ id: 'sp-2', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
    ]
    const incoming = storyMapPayload({
      sprints: [
        sprint({ id: 'sp-2', projectId: EXISTING_PROJECT_ID, sprintNumber: 1 }),
        sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
      ],
    })
    const { mergedSprints } = runUpdate([existingProject()], existingSprints, incoming)
    const nums = mergedSprints.map((s) => s.sprintNumber)
    expect(new Set(nums).size).toBe(nums.length)
    // Incoming numbering wins wholesale.
    expect(mergedSprints.find((s) => s.id === 'sp-2')?.sprintNumber).toBe(1)
  })
})

// --- C11: renumbering ------------------------------------------------------

describe('C11 — a renumbering payload (ids stable, numbers shift)', () => {
  it('carries incoming numbers across without duplicating or dropping sprints', () => {
    const existingSprints = [
      sprint({ id: 's-a', projectId: EXISTING_PROJECT_ID, sprintNumber: 1 }),
      sprint({ id: 's-b', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
    ]
    // A previously-undated sprint gains a date, so Story Map now emits it
    // first and everything after it shifts by one.
    const incoming = storyMapPayload({
      sprints: [
        sprint({ id: 's-new', projectId: EXISTING_PROJECT_ID, sprintNumber: 1 }),
        sprint({ id: 's-a', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
        sprint({ id: 's-b', projectId: EXISTING_PROJECT_ID, sprintNumber: 3 }),
      ],
    })
    const { mergedSprints } = runUpdate([existingProject()], existingSprints, incoming)
    expect(mergedSprints).toHaveLength(3)
    expect(mergedSprints.map((s) => s.sprintNumber).sort()).toEqual([1, 2, 3])
    expect(mergedSprints.find((s) => s.id === 's-a')?.sprintNumber).toBe(2)
  })
})

// --- C8 / C16: the shared slot registry -----------------------------------

describe('C8 — counter-sum, and no duplicate ids of EITHER kind', () => {
  it('added+skipped+copied+replaced+updated === incoming.projects.length', () => {
    const { result } = runUpdate([existingProject()], [], storyMapPayload())
    const sum =
      result.added + result.skipped + result.copied + result.replaced + result.updated
    expect(sum).toBe(1)
    expect(result.updated).toBe(1)
  })

  it('mergedSprints holds no duplicate id — the PASS-2 sprint-loop hazard', () => {
    // ⚠️ KNOWN-BAD: drop the `claim.action !== 'replace'` filter on the second
    // PASS-2 loop and an updated project receives its incoming sprints on top
    // of the merged set. Project-id uniqueness alone stays GREEN on that.
    const existingSprints = [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })]
    const { mergedSprints } = runUpdate(
      [existingProject()],
      existingSprints,
      storyMapPayload(),
    )
    const ids = mergedSprints.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(mergedSprints).toHaveLength(1)
  })

  it('mergedProjects holds no duplicate id', () => {
    const { mergedProjects } = runUpdate([existingProject()], [], storyMapPayload())
    const ids = mergedProjects.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('an updated project reaches updatedExistingIds and NOT replacedExistingIds', () => {
    // ⚠️ KNOWN-BAD: drop the discriminator on the PASS-2 *project* loop and the
    // id lands in replacedExistingIds, which drives all three consumers —
    // sprint drop, burnUpConfigs clear, forecast clear.
    const { result } = runUpdate([existingProject()], [], storyMapPayload())
    expect([...result.updatedExistingIds]).toEqual([EXISTING_PROJECT_ID])
    expect(result.replacedExistingIds.size).toBe(0)
  })
})

describe('C16 — precedence by ACTION, with eviction', () => {
  // A hand-built payload: a real Story Map export is always ONE project
  // (spert-story-map's `exportForForecaster.ts`, `projects: [project]`), so this collision can
  // only be constructed by hand. It passes every validator today because
  // classifyImportData keys on the declared `source` string alone.
  const e1 = existingProject({ id: 'e1', name: 'Shared Name' })

  function mixedPayload(order: 'B,C,A' | 'A,B'): ParsedImportData {
    const A: Project = {
      id: 'e1', // ID conflict with e1
      name: 'Totally Different',
      unitOfMeasure: 'Story Points',
      milestones: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const B: Project = { ...A, id: 'b-id', name: 'Shared Name' } // NAME conflict with e1
    const C: Project = { ...A, id: 'c-id', name: 'Shared Name' } // also NAME conflict
    return {
      exportType: 'spert-story-map',
      projects: order === 'B,C,A' ? [B, C, A] : [A, B],
      sprints: [],
    }
  }

  it('[B(replace), C(replace), A(update)] on one slot: A wins and skipped === 2', () => {
    const incoming = mixedPayload('B,C,A')
    const conflicts = detectImportConflicts(incoming, [e1])
    const decisions = new Map<string, ConflictAction>([
      ['b-id', 'replace'],
      ['c-id', 'replace'],
      ['e1', 'update'],
    ])
    const { mergedProjects, result } = applyImportDecisions(
      [e1],
      [],
      incoming,
      decisions,
      conflicts,
    )
    // ⚠️ ARRAY ORDER GIVES THE OPPOSITE ANSWER: B claims first, and under
    // first-claim-wins A is silently downgraded while a name-matched replace
    // destroys the slot.
    expect(result.updated).toBe(1)
    expect(result.replaced).toBe(0)
    expect(result.skipped).toBe(2)
    expect(result.added + result.skipped + result.copied + result.replaced + result.updated).toBe(
      incoming.projects.length,
    )
    expect(mergedProjects).toHaveLength(1)
    expect(mergedProjects[0].id).toBe('e1')
    expect(mergedProjects[0].unitOfMeasure).toBe('Hours') // merged, not replaced
    // Both downgrades disclosed.
    expect(result.downgrades.map((d) => d.incomingProjectId).sort()).toEqual(['b-id', 'c-id'])
    expect(result.downgrades.every((d) => d.from === 'replace' && d.to === 'skip')).toBe(true)
  })

  it('[A(update), B(replace)] — the update holds the slot regardless of order', () => {
    const incoming = mixedPayload('A,B')
    const conflicts = detectImportConflicts(incoming, [e1])
    const decisions = new Map<string, ConflictAction>([
      ['e1', 'update'],
      ['b-id', 'replace'],
    ])
    const { result } = applyImportDecisions([e1], [], incoming, decisions, conflicts)
    expect(result.updated).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.added + result.skipped + result.copied + result.replaced + result.updated).toBe(2)
  })

  it('replace-vs-replace still resolves by ARRAY ORDER, unchanged', () => {
    const incoming = mixedPayload('B,C,A')
    const conflicts = detectImportConflicts(incoming, [e1])
    const decisions = new Map<string, ConflictAction>([
      ['b-id', 'replace'],
      ['c-id', 'replace'],
      ['e1', 'skip'],
    ])
    const { mergedProjects, result } = applyImportDecisions(
      [e1],
      [],
      incoming,
      decisions,
      conflicts,
    )
    expect(result.replaced).toBe(1)
    expect(mergedProjects[0].id).toBe('b-id') // first in array order
    expect(result.skipped).toBe(2) // C downgraded, A explicitly skipped
  })
})

// --- C10: conditionally-emitted keys --------------------------------------

describe('C10 — conditional-key payloads still take the spread path', () => {
  it('a payload with no `milestones` preserves every existing milestone', () => {
    const existing = existingProject({
      milestones: [milestone({ id: 'rel-1', backlogSize: 40 })],
    })
    const incoming = storyMapPayload({
      projects: [
        {
          id: EXISTING_PROJECT_ID,
          name: 'No Milestones',
          unitOfMeasure: 'Story Points',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      sprints: [],
    })
    const { mergedProjects } = runUpdate([existing], [], incoming)
    expect(mergedProjects[0].milestones?.map((m) => m.id)).toEqual(['rel-1'])
  })

  it('a payload with no `firstSprintStartDate` leaves the local value standing', () => {
    // ⚠️ Against a project with ZERO sprints — otherwise §4.1 refuses upstream
    // and the spread path never runs at all.
    const existing = existingProject({ firstSprintStartDate: '2026-01-01' })
    const incoming = storyMapPayload({
      projects: [
        {
          id: EXISTING_PROJECT_ID,
          name: 'No Schedule',
          unitOfMeasure: 'Story Points',
          milestones: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      sprints: [],
    })
    const { mergedProjects } = runUpdate([existing], [], incoming)
    // `incoming-when-emitted`: the producer emits these CONDITIONALLY, so an
    // absent key is not an instruction to clear — the local value stands.
    // ⚠️ The only in-suite record of the distinction; do not fold this class
    // back into plain `incoming`, which would pair incoming sprint dates with
    // a stale local cadence.
    expect(mergedProjects[0].firstSprintStartDate).toBe('2026-01-01')
    expect(mergedProjects[0].sprintCadenceWeeks).toBe(2)
  })
})

// --- C9: the banner --------------------------------------------------------

describe('C9 — the banner names every §5.4 item, from write-time values', () => {
  function detailsFor() {
    const existing = existingProject({
      milestones: [
        milestone({ id: 'rel-1', name: 'Matched', backlogSize: 40 }),
        milestone({ id: 'mine', name: 'My Own Milestone', backlogSize: 25 }), // cell 4
        milestone({ id: 'done', name: 'Shipped', backlogSize: 0 }), // cell 3
      ],
    })
    const incoming = storyMapPayload({
      projects: [
        {
          ...existingProject(),
          name: 'Local Name',
          unitOfMeasure: 'Story Points',
          milestones: [
            milestone({ id: 'rel-1', name: 'Matched', backlogSize: 999 }),
            milestone({ id: 'brand-new', name: 'Brand New Release', backlogSize: 300 }), // cell 2
          ],
        },
      ],
      sprints: [sprint({ id: 'sp-NEW', projectId: EXISTING_PROJECT_ID })],
    })
    const { result } = runUpdate([existing], [], incoming)
    return buildImportBannerDetails(result).join(' • ')
  }

  it('names cell-2 additions BY NAME and says the figure is total scope', () => {
    const text = detailsFor()
    expect(text).toContain('Brand New Release')
    expect(text).toMatch(/TOTAL scope/i)
  })

  it('names cell-4 kept milestones and BOTH populations, without guessing', () => {
    const text = detailsFor()
    expect(text).toContain('My Own Milestone')
    expect(text).toMatch(/created here/i)
    expect(text).toMatch(/emptied|deleted/i)
    expect(text).toMatch(/Nothing recorded tells the two apart/i)
  })

  it('names the placement rule AND its cost', () => {
    expect(detailsFor()).toMatch(/accumulate in order/i)
    expect(detailsFor()).toMatch(/moves later/i)
  })

  it('names preservations, non-idempotence and the viewState asymmetry', () => {
    const text = detailsFor()
    expect(text).toMatch(/productivity adjustments/i)
    expect(text).toMatch(/stay excluded/i)
    expect(text).toMatch(/scope-growth settings are reset/i)
  })

  it('has NO "reopened" language — no cell in §4.4 reopens anything', () => {
    expect(detailsFor()).not.toMatch(/reopen(ed)?\b/i)
  })

  it('names a downgraded action', () => {
    const e1 = existingProject({ id: 'e1', name: 'Shared Name' })
    const A: Project = {
      id: 'e1',
      name: 'X',
      unitOfMeasure: 'Story Points',
      milestones: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const B: Project = { ...A, id: 'b-id', name: 'Shared Name' }
    const incoming: ParsedImportData = {
      exportType: 'spert-story-map',
      projects: [B, A],
      sprints: [],
    }
    const conflicts = detectImportConflicts(incoming, [e1])
    const { result } = applyImportDecisions(
      [e1],
      [],
      incoming,
      new Map<string, ConflictAction>([
        ['b-id', 'replace'],
        ['e1', 'update'],
      ]),
      conflicts,
    )
    const text = buildImportBannerDetails(result).join(' ')
    expect(text).toContain('Shared Name')
    expect(text).toMatch(/was skipped/i)
  })
})

// --- C5 / C12 / C18: store-level ------------------------------------------

describe('C5, C12, C18 — store integration', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      sprints: [],
      viewingProjectId: null,
      forecastInputs: {},
      burnUpConfigs: {},
      _originRef: '',
      _changeLog: [],
    })
    useForecastResultsStore.setState({ record: null, viewState: {}, isSimulating: null })
  })

  function seed() {
    useProjectStore.setState({
      projects: [existingProject()],
      sprints: [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })],
      burnUpConfigs: {
        [EXISTING_PROJECT_ID]: { ...DEFAULT_BURN_UP_CONFIG, distribution: 'gamma' },
      },
      forecastInputs: {
        [EXISTING_PROJECT_ID]: {
          remainingBacklog: '123',
          velocityMean: '10',
          velocityStdDev: '2',
        },
      },
    })
  }

  it('C18 — burnUpConfigs survive an update, and the new-project delete path does not fire', () => {
    seed()
    const incoming = storyMapPayload()
    const conflicts = detectImportConflicts(incoming, useProjectStore.getState().projects)
    const outcome = useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map<string, ConflictAction>([[EXISTING_PROJECT_ID, 'update']]),
      freshConflicts: conflicts,
      source: 'spert-story-map',
    })
    expect(outcome.ok).toBe(true)
    // ⚠️ KNOWN-BAD: route the update through replacedExistingIds and this key
    // is deleted. It was the only one of the three id-keyed stores with no
    // check before C18.
    const cfg = useProjectStore.getState().burnUpConfigs[EXISTING_PROJECT_ID]
    expect(cfg).toBeDefined()
    // A VALUE, not just presence: a default-shaped config would pass on presence
    // alone even if the user's had been discarded and rebuilt.
    expect(cfg.distribution).toBe('gamma')
    // forecastInputs survive too (preserved for ID conflicts — same key).
    expect(useProjectStore.getState().forecastInputs[EXISTING_PROJECT_ID].remainingBacklog).toBe(
      '123',
    )
  })

  it('C5 — viewState survives with its VALUES intact; the stale record is cleared', () => {
    seed()
    useForecastResultsStore.setState({
      record: {
        projectId: EXISTING_PROJECT_ID,
        runAt: '2026-01-01T00:00:00.000Z',
      } as never,
      viewState: {
        [EXISTING_PROJECT_ID]: {
          targetDate: '2026-11-30',
          modelScopeGrowth: true,
          scopeGrowthMode: 'custom',
          customScopeGrowth: '7.5',
        } as never,
      },
    })
    const incoming = storyMapPayload()
    const conflicts = detectImportConflicts(incoming, useProjectStore.getState().projects)
    useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map<string, ConflictAction>([[EXISTING_PROJECT_ID, 'update']]),
      freshConflicts: conflicts,
      source: 'spert-story-map',
    })
    const view = useForecastResultsStore.getState().viewState[EXISTING_PROJECT_ID] as unknown as {
      targetDate: string
      modelScopeGrowth: boolean
      scopeGrowthMode: string
      customScopeGrowth: string
    }
    // ⚠️ Asserting VALUES, not presence: "viewState behaves per §5.2" passes
    // when a remount recreates the slice empty.
    expect(view.targetDate).toBe('2026-11-30')
    expect(view.modelScopeGrowth).toBe(true)
    expect(view.scopeGrowthMode).toBe('custom')
    expect(view.customScopeGrowth).toBe('7.5')
    // The run itself is stale — the sprint set moved — so it goes.
    expect(useForecastResultsStore.getState().record).toBeNull()
  })

  it('C12 — write-time race: the §4.1 predicate is re-evaluated inside set()', () => {
    seed()
    const incoming = storyMapPayload()
    // Capture conflicts BEFORE the workspace changes, as the hook would.
    const freshConflicts = detectImportConflicts(incoming, useProjectStore.getState().projects)

    // A cloud snapshot lands mid-preview and adds a sprint to the EXISTING
    // project. ⚠️ A known-bad that adds or removes a PROJECT changes the tuple
    // count and is caught by the pre-existing guard — it would prove nothing.
    useProjectStore
      .getState()
      .replaceProjectsFromCloud(useProjectStore.getState().projects, [
        ...useProjectStore.getState().sprints,
        sprint({ id: 'sp-CLOUD', projectId: EXISTING_PROJECT_ID, sprintNumber: 2 }),
      ])

    const reDetected = detectImportConflicts(incoming, useProjectStore.getState().projects)
    // ⚠️ THE OLD GUARD PASSES. conflictsEqual keys on the tuple and nothing
    // else, so it cannot see the sprint that just appeared.
    expect(conflictsEqual(freshConflicts, reDetected)).toBe(true)

    const outcome = useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map<string, ConflictAction>([[EXISTING_PROJECT_ID, 'update']]),
      freshConflicts,
      source: 'spert-story-map',
    })
    // ...and the NEW predicate refuses.
    expect(outcome.ok).toBe(false)
    expect(useProjectStore.getState().sprints).toHaveLength(2)
  })

  it('C26 — write-time race on IDENTITY EVIDENCE: a name conflict that loses its matching sprint is refused', () => {
    // ⚠️ THE SECOND ARM OF THE VETO'S DISJUNCTION. C12 covers the §4.1 arm.
    // Without this check, weakening `anyUpdateNowRefused` from
    //   update && !available(...)
    // to
    //   update && unmatched && !available(...)
    // — the second-conjunct trap §3e warns about — changes NO test, because
    // `unmatched` implies unavailable and C12 only ever exercises that arm.
    // Measured: that mutation left all 1599 tests green before this existed.
    const existing = existingProject({ id: EXISTING_PROJECT_ID, name: 'Shared Name' })
    useProjectStore.setState({
      projects: [existing],
      sprints: [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })],
    })
    // A migrated re-send: same NAME, different ID, sharing sprint `sp-1`.
    const incoming = storyMapPayload({
      projects: [
        {
          id: 'prod-1-migrated',
          name: 'Shared Name',
          unitOfMeasure: 'Story Points',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sprints: [sprint({ id: 'sp-1', projectId: 'prod-1-migrated' })],
    })
    const freshConflicts = detectImportConflicts(incoming, useProjectStore.getState().projects)
    expect(freshConflicts[0].type).toBe('name')

    // A cloud snapshot lands mid-preview and REPLACES the shared sprint with a
    // different one. The tuple is untouched — same ids, same type — but the
    // identity evidence is gone. (Not an unmatched-sprint case: the existing
    // set still has exactly one sprint and it is absent from incoming, so
    // BOTH arms would fire; so remove it entirely instead.)
    useProjectStore
      .getState()
      .replaceProjectsFromCloud(useProjectStore.getState().projects, [])

    const reDetected = detectImportConflicts(incoming, useProjectStore.getState().projects)
    // ⚠️ THE TUPLE GUARD PASSES — it cannot see a sprint set change.
    expect(conflictsEqual(freshConflicts, reDetected)).toBe(true)

    const outcome = useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map<string, ConflictAction>([['prod-1-migrated', 'update']]),
      freshConflicts,
      source: 'spert-story-map',
    })
    // Evidence gone -> `update` is no longer offered -> the whole batch aborts.
    expect(outcome.ok).toBe(false)
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().projects[0].id).toBe(EXISTING_PROJECT_ID)
  })
})

// --- C13: class-3 pins across the vendored contract fixtures --------------

describe('C13 — class-3 producer artifacts, pinned across all 17 fixtures', () => {
  // Resolved from this file's own location rather than process.cwd(), matching
  // storymap-contract.test.ts. A top-level fileURLToPath(new URL(...)) throws
  // under this runner; import.meta.dirname + join is the idiom that works.
  const FIXTURES_DIR = join(import.meta.dirname, 'storymap-contract', 'fixtures')
  const fixtures = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'vendored-manifest.json')
    .map(
      (f) =>
        [f, JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf8')) as {
          projects?: Project[]
          sprints?: Sprint[]
        }] as const,
    )

  it('vendors 17 payloads', () => {
    expect(fixtures).toHaveLength(17)
  })

  it('every fixture sprint is includedInForecast, every milestone showOnChart, every project Story Points', () => {
    let sprints = 0
    let milestones = 0
    for (const [, payload] of fixtures) {
      for (const s of payload.sprints ?? []) {
        sprints++
        expect(s.includedInForecast).toBe(true)
      }
      for (const p of payload.projects ?? []) {
        expect(p.unitOfMeasure).toBe('Story Points')
        for (const m of p.milestones ?? []) {
          milestones++
          expect(m.showOnChart).toBe(true)
        }
      }
    }
    expect(sprints).toBe(32)
    expect(milestones).toBe(37)
  })

  it('milestone colour is DERIVED from array index, wrapping at 8', () => {
    // ⚠️ NOT "colours are distinct" — the palette wraps, and two shipped
    // fixtures carry 10 and 11 milestones. ⚠️ The palette itself is NOT
    // transcribed here; that would be a new cross-repo constant.
    let sawWrap = false
    for (const [, payload] of fixtures) {
      for (const p of payload.projects ?? []) {
        const ms = p.milestones ?? []
        if (ms.length > 8) sawWrap = true
        for (let i = 0; i < ms.length; i++) {
          for (let j = i + 1; j < ms.length; j++) {
            expect(ms[i].color === ms[j].color).toBe(i % 8 === j % 8)
          }
        }
      }
    }
    expect(sawWrap).toBe(true)
  })
})


// --- C19 / C21 / C24 / C25 / C26: `update` reachability after an
// --- id-reassigning cloud migration ----------------------------------------
//
// ⚠️ C-NUMBERS ARE NOT A CLEAN NAMESPACE. Two schemes already coexist in src
// and collide: `C7` is "availableActions gates update" here and
// "viewingProjectId reconciliation" at project-store.ts:634; `C17` is the
// timestamp checks here and "atomic merge" at useImportState.ts:162. These
// five were picked because they are free in BOTH — grep before adding more.
//
// A cloud migration can reassign a project's id. A later Story Map send of the
// same project then classifies as a NAME conflict, and `update` used to be
// withheld — leaving `replace`, which destroys the forecast configuration
// `update` exists to protect. Identity is re-established from a shared sprint
// id, which Story Map preserves across exports.

const MIGRATED_ID = 'prod-1-migrated'

describe('C19 — hasMatchingExistingSprintId', () => {
  const existing = [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })]

  it('TRUE when an existing sprint id appears in the incoming set', () => {
    const incoming = [sprint({ id: 'sp-1', projectId: MIGRATED_ID })]
    expect(
      hasMatchingExistingSprintId(existing, incoming, EXISTING_PROJECT_ID, MIGRATED_ID),
    ).toBe(true)
  })

  it('FALSE when no sprint id is shared', () => {
    const incoming = [sprint({ id: 'sp-OTHER', projectId: MIGRATED_ID })]
    expect(
      hasMatchingExistingSprintId(existing, incoming, EXISTING_PROJECT_ID, MIGRATED_ID),
    ).toBe(false)
  })

  it('respects BOTH container ids — a shared sprint id under another project is not evidence', () => {
    // ⚠️ KNOWN-BAD: drop either projectId filter and this passes vacuously.
    const incoming = [sprint({ id: 'sp-1', projectId: 'some-third-project' })]
    expect(
      hasMatchingExistingSprintId(existing, incoming, EXISTING_PROJECT_ID, MIGRATED_ID),
    ).toBe(false)
  })

  it('vacuously FALSE on a sprint-less existing project', () => {
    expect(
      hasMatchingExistingSprintId([], [sprint({ id: 'sp-1', projectId: MIGRATED_ID })],
        EXISTING_PROJECT_ID, MIGRATED_ID),
    ).toBe(false)
  })
})

describe('C24 — mergeProjectForUpdate pins the container id', () => {
  // ⚠️ This function had NO test importing it before this check existed.
  it('writes the EXISTING id, not incoming\'s, under a name conflict', () => {
    const merged = mergeProjectForUpdate(
      existingProject({ id: EXISTING_PROJECT_ID }),
      existingProject({ id: MIGRATED_ID, name: 'Story Map Name' }),
      '2026-08-30T00:00:00.000Z',
    )
    expect(merged.project.id).toBe(EXISTING_PROJECT_ID)
  })

  it('KNOWN-BAD GUARD: without the pin the project orphans its own sprints', () => {
    // Drop `id: existing.id` from mergeProjectForUpdate and this fails: the
    // project takes the incoming id while mergeSprintsForUpdate has already
    // remapped every sprint to the existing one.
    const merged = mergeProjectForUpdate(
      existingProject({ id: EXISTING_PROJECT_ID }),
      existingProject({ id: MIGRATED_ID }),
      '2026-08-30T00:00:00.000Z',
    )
    const { sprints } = mergeSprintsForUpdate(
      [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })],
      [sprint({ id: 'sp-1', projectId: MIGRATED_ID })],
      EXISTING_PROJECT_ID,
      MIGRATED_ID,
      '2026-08-30T00:00:00.000Z',
    )
    expect(sprints[0].projectId).toBe(merged.project.id)
  })

  it('is a genuine no-op when the ids already agree', () => {
    const merged = mergeProjectForUpdate(
      existingProject(),
      existingProject({ name: 'Story Map Name' }),
      '2026-08-30T00:00:00.000Z',
    )
    expect(merged.project.id).toBe(EXISTING_PROJECT_ID)
  })
})

describe('C21 — end-to-end: a name-conflict `update` after a migration', () => {
  it('merges onto the existing slot, keeps the local config, and keeps the id', () => {
    const existing = existingProject({ id: EXISTING_PROJECT_ID, name: 'Shared Name' })
    const existingSprints = [sprint({ id: 'sp-1', projectId: EXISTING_PROJECT_ID })]
    // Same NAME, different ID — exactly what an id-reassigning migration leaves.
    const incoming = storyMapPayload({
      projects: [
        {
          id: MIGRATED_ID,
          name: 'Shared Name',
          unitOfMeasure: 'Story Points',
          sprintCadenceWeeks: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      sprints: [
        sprint({ id: 'sp-1', projectId: MIGRATED_ID, doneValue: 22 }),
        sprint({ id: 'sp-2', projectId: MIGRATED_ID, sprintNumber: 2, doneValue: 30 }),
      ],
    })

    const conflicts = detectImportConflicts(incoming, [existing])
    expect(conflicts[0].type).toBe('name')

    const { mergedProjects, mergedSprints, result } = runUpdate(
      [existing], existingSprints, incoming,
    )

    expect(result.updated).toBe(1)
    expect(mergedProjects).toHaveLength(1)
    // The slot keeps its id...
    expect(mergedProjects[0].id).toBe(EXISTING_PROJECT_ID)
    // ...the local configuration survives...
    expect(mergedProjects[0].unitOfMeasure).toBe('Hours')
    expect(mergedProjects[0].projectStartDate).toBe('2026-01-01')
    expect(mergedProjects[0].createdAt).toBe('2020-06-15T00:00:00.000Z')
    // ...the new sprint arrives...
    expect(mergedSprints).toHaveLength(2)
    // ...and NOTHING is orphaned.
    for (const s of mergedSprints) {
      expect(s.projectId).toBe(EXISTING_PROJECT_ID)
    }
  })
})

describe('C25 — update-vs-update on one slot is now constructible', () => {
  it('the ID conflict outranks the NAME conflict regardless of array order', () => {
    const existing = existingProject({ id: EXISTING_PROJECT_ID, name: 'Shared Name' })
    const byName: Project = {
      id: 'other-id', name: 'Shared Name', unitOfMeasure: 'Story Points',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const byId: Project = {
      id: EXISTING_PROJECT_ID, name: 'Different Name', unitOfMeasure: 'Story Points',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    // NAME claim first in array order — the id claim must still win.
    const incoming = storyMapPayload({ projects: [byName, byId], sprints: [] })
    const { result, mergedProjects } = runUpdate([existing], [], incoming)

    expect(result.updated).toBe(1)
    expect(result.skipped).toBe(1)
    expect(mergedProjects[0].name).toBe('Different Name')
    expect(result.downgrades.map((d) => d.incomingProjectId)).toEqual(['other-id'])
  })
})
