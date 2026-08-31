// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FIELD-CLASS CONTRACT — binds the three `*_UPDATE_FIELD_CLASSES` tables in
 * `import-utils.ts` to the merge functions that are supposed to implement them.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `Record<keyof T, UpdateFieldClass>` makes OMISSION impossible but cannot make
 * a classification TRUE: every class type-checks against every key. Measured
 * before this file existed — delete the `color`/`showOnChart` claw-backs from
 * `mergeMilestonesForUpdate` and `tsc` stays clean with the ENTIRE suite green,
 * while those rows go on claiming `local-producer-artifact`. A wrong entry is
 * worse than no entry: it is documentation that looks enforced.
 *
 * ── THE ONE RULE THAT KEEPS THIS HONEST ─────────────────────────────────────
 * ⚠️ The table supplies only the PREDICTION. The OBSERVATION comes from running
 * the shipped merge functions. A fixture derived from the tables would make the
 * observation table-shaped and this whole file decorative — so every fixture
 * below is a HAND-WRITTEN LITERAL. Never generate one from a table.
 *
 * ⚠️ Fixture values must be OWN, ENUMERABLE, NON-ACCESSOR and STABLE ACROSS
 * READS. This is NOT implied by "hand-written literal" — a literal can contain
 * a getter, and the merges spread their inputs, so an accessor is re-read and
 * can return a different value each time. `assertPlainData` enforces it.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────────
 * Cross-group corruptions go red, EXCEPT on the enumerated coincidences below.
 * Within-group corruptions stay green. BOTH halves are asserted by controls
 * (see `field-class-contract.controls.md` reasoning in SD-4).
 *
 * The enumerated exceptions — rows whose true group cannot be separated from a
 * named sibling by ANY fixture, for structural reasons:
 *
 *   project.id        pinned-identity  <-> keeps-existing
 *   sprint.projectId  pinned-identity  <-> keeps-existing
 *   sprint.id         match-key        <-> takes-incoming, keeps-existing
 *   milestone.id      match-key        <-> takes-incoming, keeps-existing
 *
 * `project.id`: `existing.id` IS the container identity, so the two predictions
 * are the same expression. `sprint.projectId`: `priorById` is built from
 * `existingSprints.filter(s => s.projectId === existingProjectId)`, so every
 * matched prior's `projectId` IS the container identity by construction — a
 * matched prior that violates it is unreachable. The `id` rows: a matched pair
 * has equal ids by the definition of matching.
 *
 * ⚠️ No count is quoted here deliberately. Regenerate any figure from a harness
 * and state its units and policy beside it; an inherited count is how a
 * shortfall gets re-hidden after the table was made honest.
 *
 * ⚠️ This binds the tables to THIS repo's merge functions. It does NOT prove
 * what Story Map's exporter actually emits — the `incoming` vs
 * `incoming-when-emitted` and `local-restore-defensive` vs
 * `local-restore-required` distinctions are PRODUCER facts, invisible from the
 * consumer side. Nothing here can read the other repository.
 */

import { describe, it, expect } from 'vitest'
import type { Project, Sprint, Milestone } from '@/shared/types'
import {
  PROJECT_UPDATE_FIELD_CLASSES,
  SPRINT_UPDATE_FIELD_CLASSES,
  MILESTONE_UPDATE_FIELD_CLASSES,
  mergeProjectForUpdate,
  mergeSprintsForUpdate,
  mergeMilestonesForUpdate,
  type UpdateFieldClass,
} from './import-utils'

const TS = '2026-08-30T12:00:00.000Z'
const EXISTING_PROJECT_ID = 'EXISTING-PROJECT'
const INCOMING_PROJECT_ID = 'INCOMING-PROJECT'

/**
 * The six OUTCOME GROUPS. Nine classes collapse to six because some classes
 * differ only in PRODUCER behaviour, which a consumer-side check cannot see.
 * ⚠️ This maps CLASS -> WHAT IT PREDICTS. It is not a second copy of the
 * tables, which map FIELD -> CLASS. Corrupting a table is what this file
 * catches; this map is the definition of the vocabulary itself.
 */
type OutcomeGroup =
  | 'takes-incoming'
  | 'keeps-existing'
  | 'stamp'
  | 'nested-merge'
  | 'match-key'
  | 'pinned-identity'

const OUTCOME_GROUP_OF: Record<UpdateFieldClass, OutcomeGroup> = {
  'incoming': 'takes-incoming',
  'incoming-when-emitted': 'takes-incoming',
  'local-restore-defensive': 'keeps-existing',
  'local-restore-required': 'keeps-existing',
  'local-producer-artifact': 'keeps-existing',
  'stamp': 'stamp',
  'nested-merge': 'nested-merge',
  'match-key': 'match-key',
  'pinned-identity': 'pinned-identity',
}

/**
 * NEVER-HOLDS, at TABLE **and** ROW scope: a group with no defined referent —
 * on a table or on a row — never holds there, so classing a row into it is
 * caught.
 *
 * ⚠️ DERIVED FROM THE MERGE FUNCTION SIGNATURES, NEVER FROM THE TABLES. That
 * independence is the only reason this is not a tautology:
 *   - `nested-merge` needs a sub-merge to delegate to. Only
 *     `mergeProjectForUpdate` delegates, and only for `milestones`.
 *   - `match-key` needs a key that selects which prior pairs with which
 *     incoming. `priorById` is keyed on `id` in the sprint and milestone
 *     merges; `mergeProjectForUpdate` matches nothing.
 *   - `pinned-identity` needs a CONTAINER identity parameter.
 *     `mergeSprintsForUpdate` takes `existingProjectId`; the project is its own
 *     container (`existing.id`); `mergeMilestonesForUpdate` takes NO container
 *     parameter at all, so the group is undefined across that whole table.
 *
 * ⚠️ A later reader who rebuilds this map from the tables converts a sound
 * check into a tautology. Rebuild it from the signatures.
 */
function groupIsDefined(table: TableName, key: string, group: OutcomeGroup): boolean {
  switch (group) {
    case 'takes-incoming':
    case 'keeps-existing':
    case 'stamp':
      return true
    case 'nested-merge':
      return table === 'project' && key === 'milestones'
    case 'match-key':
      return (table === 'sprint' || table === 'milestone') && key === 'id'
    case 'pinned-identity':
      return (table === 'project' && key === 'id') || (table === 'sprint' && key === 'projectId')
  }
}

type TableName = 'project' | 'sprint' | 'milestone'
type Bag = Record<string, unknown>

/** ⚠️ Enforces the fixture qualifier. An accessor breaks the merges' spreads. */
function assertPlainData(label: string, o: object): void {
  for (const key of Object.keys(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key)
    expect(d, `${label}.${key} must be an own property`).toBeDefined()
    expect(d!.get, `${label}.${key} must not be a getter`).toBeUndefined()
    expect(d!.set, `${label}.${key} must not be a setter`).toBeUndefined()
    expect(d!.enumerable, `${label}.${key} must be enumerable`).toBe(true)
  }
}

// ── FIXTURES — hand-written literals. Nothing below is derived from a table. ──
// Every generic field differs between existing and incoming so the assertions
// can distinguish outcomes (CASE D). The project pair is a NAME conflict
// (`id`s differ) so `pinned-identity` is load-bearing rather than a no-op.

const EXISTING_MILESTONE: Milestone = {
  id: 'MS-1', name: 'Existing Milestone', backlogSize: 10, color: '#111111',
  showOnChart: true,
  createdAt: '2020-03-03T00:00:00.000Z', updatedAt: '2020-03-04T00:00:00.000Z',
}
const INCOMING_MILESTONE: Milestone = {
  id: 'MS-1', name: 'Incoming Milestone', backlogSize: 99, color: '#999999',
  showOnChart: false,
  createdAt: '2021-03-03T00:00:00.000Z', updatedAt: '2021-03-04T00:00:00.000Z',
}
const NEW_MILESTONE: Milestone = {
  id: 'MS-2', name: 'New Milestone', backlogSize: 7, color: '#777777',
  showOnChart: true,
  createdAt: '2021-04-03T00:00:00.000Z', updatedAt: '2021-04-04T00:00:00.000Z',
}

const EXISTING_PROJECT: Project = {
  id: EXISTING_PROJECT_ID, name: 'Existing Project', sprintCadenceWeeks: 1,
  projectStartDate: '2020-01-01', projectFinishDate: '2020-12-31',
  firstSprintStartDate: '2020-02-01', unitOfMeasure: 'Hours',
  productivityAdjustments: [{
    id: 'PA-EXISTING', name: 'Existing adjustment', startDate: '2020-05-01',
    endDate: '2020-05-10', factor: 0.5, enabled: true,
    createdAt: '2020-04-01T00:00:00.000Z', updatedAt: '2020-04-02T00:00:00.000Z',
  }],
  milestones: [EXISTING_MILESTONE],
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-06-01T00:00:00.000Z',
}
const INCOMING_PROJECT: Project = {
  id: INCOMING_PROJECT_ID, name: 'Incoming Project', sprintCadenceWeeks: 3,
  projectStartDate: '2021-01-01', projectFinishDate: '2021-12-31',
  firstSprintStartDate: '2021-02-01', unitOfMeasure: 'Story Points',
  productivityAdjustments: [{
    id: 'PA-INCOMING', name: 'Incoming adjustment', startDate: '2021-05-01',
    endDate: '2021-05-10', factor: 0.9, enabled: false,
    createdAt: '2021-04-01T00:00:00.000Z', updatedAt: '2021-04-02T00:00:00.000Z',
  }],
  milestones: [INCOMING_MILESTONE],
  createdAt: '2021-01-01T00:00:00.000Z', updatedAt: '2021-06-01T00:00:00.000Z',
}

const EXISTING_SPRINT: Sprint = {
  id: 'SP-1', projectId: EXISTING_PROJECT_ID, sprintNumber: 1,
  sprintStartDate: '2020-01-01', sprintFinishDate: '2020-01-14',
  customFinishDate: '2020-01-15', doneValue: 10, backlogAtSprintEnd: 100,
  includedInForecast: true,
  createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z',
}
const INCOMING_SPRINT: Sprint = {
  id: 'SP-1', projectId: INCOMING_PROJECT_ID, sprintNumber: 5,
  sprintStartDate: '2021-01-01', sprintFinishDate: '2021-01-14',
  customFinishDate: '2021-01-15', doneValue: 50, backlogAtSprintEnd: 500,
  includedInForecast: false,
  createdAt: '2021-01-01T00:00:00.000Z', updatedAt: '2021-01-02T00:00:00.000Z',
}
const NEW_SPRINT: Sprint = {
  id: 'SP-2', projectId: INCOMING_PROJECT_ID, sprintNumber: 6,
  sprintStartDate: '2021-02-01', sprintFinishDate: '2021-02-14',
  customFinishDate: '2021-02-15', doneValue: 60, backlogAtSprintEnd: 600,
  includedInForecast: false,
  createdAt: '2021-02-01T00:00:00.000Z', updatedAt: '2021-02-02T00:00:00.000Z',
}

/**
 * One merged instance plus the referents its predictions are measured against.
 *
 * ⚠️ `prior` is the entity this instance was PAIRED WITH — `import-utils.ts`'s
 * own name for it — NOT a raw same-id fixture object. On the ADDED branch there
 * is no prior, and `keeps-existing`/`match-key` legitimately come from incoming
 * there (the existence partition), so those groups assert nothing on an added
 * instance. Comparing an added instance against a raw fixture manufactures
 * false failures on exactly the rows the tables get RIGHT.
 */
type Instance = {
  label: string
  merged: Bag
  incoming: Bag
  prior: Bag | undefined
  containerIdentity?: string
  nestedOutput?: unknown
}

function assertTableAgainstMerge(
  table: TableName,
  classes: Record<string, UpdateFieldClass>,
  instances: Instance[],
): void {
  for (const instance of instances) {
    for (const [key, cls] of Object.entries(classes)) {
      const group = OUTCOME_GROUP_OF[cls]
      const isAdded = instance.prior === undefined
      // CASE C is BRANCH scope and is evaluated LAST: it wins on an added
      // instance even where NEVER-HOLDS would otherwise have something to say.
      const runsHere = !isAdded || (group !== 'keeps-existing' && group !== 'match-key')
      const name = `${table}/${instance.label}: ${key} [${cls} -> ${group}]`

      it(runsHere ? name : `${name} (added branch: not asserted)`, () => {
        // CASE D vacuity mode (b): a merge that produced no rows would make
        // every per-row assertion pass by never running.
        expect(instance.merged, 'merge produced no instance to assert on').toBeTruthy()
        if (!runsHere) return

        expect(
          groupIsDefined(table, key, group),
          `${group} has no referent on ${table}.${key} — NEVER-HOLDS`,
        ).toBe(true)

        // CASE D vacuity mode (a): a fixture that does not vary the field makes
        // the assertion unable to distinguish outcomes.
        // ⚠️ EXCEPTION — unsatisfiable on a match-key row: a matched pair has
        // equal ids BY THE DEFINITION OF MATCHING, so no fixture can vary the
        // field and still match.
        if (!isAdded && group !== 'match-key') {
          expect(
            JSON.stringify(instance.prior![key]),
            `fixture does not vary ${table}.${key} — assertion would be vacuous`,
          ).not.toBe(JSON.stringify(instance.incoming[key]))
        }

        switch (group) {
          case 'takes-incoming':
            expect(instance.merged[key]).toEqual(instance.incoming[key])
            break
          case 'keeps-existing':
            expect(instance.merged[key]).toEqual(instance.prior![key])
            break
          case 'stamp':
            expect(instance.merged[key]).toBe(TS)
            break
          case 'match-key':
            // CASE B — the merged entity retains the id it was matched on.
            expect(instance.merged[key]).toBe(instance.prior![key])
            break
          case 'pinned-identity':
            // CASE C — the existing CONTAINER's identity, supplied per table.
            expect(instance.merged[key]).toBe(instance.containerIdentity)
            break
          case 'nested-merge':
            // CASE A — assert DELEGATION happened, not what it produced. The
            // milestone table is checked on its own below.
            expect(instance.merged[key]).toBe(instance.nestedOutput)
            break
        }
      })
    }
  }
}

describe('field-class contract: fixtures are plain data', () => {
  it('no fixture carries an accessor or a non-enumerable property', () => {
    assertPlainData('EXISTING_PROJECT', EXISTING_PROJECT)
    assertPlainData('INCOMING_PROJECT', INCOMING_PROJECT)
    assertPlainData('EXISTING_SPRINT', EXISTING_SPRINT)
    assertPlainData('INCOMING_SPRINT', INCOMING_SPRINT)
    assertPlainData('NEW_SPRINT', NEW_SPRINT)
    assertPlainData('EXISTING_MILESTONE', EXISTING_MILESTONE)
    assertPlainData('INCOMING_MILESTONE', INCOMING_MILESTONE)
    assertPlainData('NEW_MILESTONE', NEW_MILESTONE)
  })
})

describe('PROJECT_UPDATE_FIELD_CLASSES vs mergeProjectForUpdate', () => {
  const out = mergeProjectForUpdate(EXISTING_PROJECT, INCOMING_PROJECT, TS)
  it('the merge ran and every key is classed', () => {
    expect(out.project).toBeTruthy()
    expect(Object.keys(PROJECT_UPDATE_FIELD_CLASSES).sort())
      .toEqual(Object.keys(EXISTING_PROJECT).sort())
  })
  assertTableAgainstMerge('project', PROJECT_UPDATE_FIELD_CLASSES, [{
    label: 'name-conflict',
    merged: out.project as unknown as Bag,
    incoming: INCOMING_PROJECT as unknown as Bag,
    prior: EXISTING_PROJECT as unknown as Bag,
    containerIdentity: EXISTING_PROJECT.id,
    nestedOutput: out.milestoneReport.milestones,
  }])
})

describe('SPRINT_UPDATE_FIELD_CLASSES vs mergeSprintsForUpdate', () => {
  // ⚠️ BOTH branches. A matched-only fixture leaves `projectId`'s
  // `pinned-identity` assertion with nothing to stand on for the added case.
  const out = mergeSprintsForUpdate(
    [EXISTING_SPRINT], [INCOMING_SPRINT, NEW_SPRINT],
    EXISTING_PROJECT_ID, INCOMING_PROJECT_ID, TS,
  )
  it('both branches are exercised', () => {
    expect(out.matched).toBe(1)
    expect(out.added).toBe(1)
    expect(out.sprints).toHaveLength(2)
  })
  assertTableAgainstMerge('sprint', SPRINT_UPDATE_FIELD_CLASSES, [
    {
      label: 'matched',
      merged: out.sprints[0] as unknown as Bag,
      incoming: INCOMING_SPRINT as unknown as Bag,
      prior: EXISTING_SPRINT as unknown as Bag,
      containerIdentity: EXISTING_PROJECT_ID,
    },
    {
      label: 'added',
      merged: out.sprints[1] as unknown as Bag,
      incoming: NEW_SPRINT as unknown as Bag,
      prior: undefined,
      containerIdentity: EXISTING_PROJECT_ID,
    },
  ])
})

describe('MILESTONE_UPDATE_FIELD_CLASSES vs mergeMilestonesForUpdate', () => {
  const out = mergeMilestonesForUpdate(
    [EXISTING_MILESTONE], [INCOMING_MILESTONE, NEW_MILESTONE], TS,
  )
  it('both branches are exercised', () => {
    expect(out.milestones).toHaveLength(2)
    expect(out.added).toHaveLength(1)
  })
  assertTableAgainstMerge('milestone', MILESTONE_UPDATE_FIELD_CLASSES, [
    {
      label: 'matched',
      merged: out.milestones[0] as unknown as Bag,
      incoming: INCOMING_MILESTONE as unknown as Bag,
      prior: EXISTING_MILESTONE as unknown as Bag,
    },
    {
      label: 'added',
      merged: out.milestones[1] as unknown as Bag,
      incoming: NEW_MILESTONE as unknown as Bag,
      prior: undefined,
    },
  ])
})

describe('vacuity controls — the modes that would silently disarm this file', () => {
  // ⚠️ NOT "trip the availability predicate". `mergeSprintsForUpdate` contains
  // zero `hasUnmatchedExistingSprints` calls — the veto lives two layers up in
  // `availableActions` — so a tripping fixture merges normally and a control
  // built on it COULD NOT FAIL.
  it('the sprint merge runs normally on a fixture that would fail §4.1', () => {
    const orphan: Sprint = { ...EXISTING_SPRINT, id: 'SP-ORPHAN' }
    const out = mergeSprintsForUpdate(
      [EXISTING_SPRINT, orphan], [INCOMING_SPRINT],
      EXISTING_PROJECT_ID, INCOMING_PROJECT_ID, TS,
    )
    expect(out.matched).toBe(1)
    expect(out.sprints).toHaveLength(1)
  })

  it('an empty incoming set produces no rows — per-row assertions would vacuously pass', () => {
    const out = mergeSprintsForUpdate(
      [EXISTING_SPRINT], [], EXISTING_PROJECT_ID, INCOMING_PROJECT_ID, TS,
    )
    expect(out.sprints).toHaveLength(0)
    expect(out.matched).toBe(0)
    expect(out.added).toBe(0)
  })

  it('the varies-guard is unsatisfiable on exactly the two match-key rows', () => {
    const matchKeyRows = [
      ...Object.entries(SPRINT_UPDATE_FIELD_CLASSES),
      ...Object.entries(MILESTONE_UPDATE_FIELD_CLASSES),
      ...Object.entries(PROJECT_UPDATE_FIELD_CLASSES),
    ].filter(([, cls]) => cls === 'match-key')
    expect(matchKeyRows.map(([k]) => k)).toEqual(['id', 'id'])
  })
})

describe('the enumerated exceptions are structural, not fixture accidents', () => {
  it('a matched prior whose projectId differs from the container is unreachable', () => {
    // priorById filters on `s.projectId === existingProjectId`, so
    // keeps-existing and pinned-identity coincide for every MATCHED sprint.
    const foreign: Sprint = { ...EXISTING_SPRINT, projectId: 'SOME-OTHER-PROJECT' }
    const out = mergeSprintsForUpdate(
      [foreign], [INCOMING_SPRINT], EXISTING_PROJECT_ID, INCOMING_PROJECT_ID, TS,
    )
    expect(out.matched).toBe(0)
    expect(out.added).toBe(1)
    expect(out.sprints[0].projectId).toBe(EXISTING_PROJECT_ID)
  })

  it('project.id: the container identity IS existing.id, so the two predictions are one expression', () => {
    const out = mergeProjectForUpdate(EXISTING_PROJECT, INCOMING_PROJECT, TS)
    expect(out.project.id).toBe(EXISTING_PROJECT.id)
    expect(out.project.id).not.toBe(INCOMING_PROJECT.id)
  })
})
