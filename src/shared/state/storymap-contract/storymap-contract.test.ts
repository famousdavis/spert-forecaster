// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Story Map import contract, asserted from the consuming side.
 *
 * Story Map vendors a copy of this repo's import limits so it can refuse to
 * export a file this validator would reject. That copy is hand-typed and will
 * drift. This file is the instrument that makes the drift land in the PR that
 * causes it: tighten a rule in `import-validation.ts` and a test HERE goes red.
 *
 * ── ⚠️ THE COUNT IN `derives the throw-site count` IS A TEXTUAL CHECK ────────
 * It greps `throw new Error` out of the source. That is a textual instrument
 * applied to a structural property, and this suite has repeatedly been bitten
 * by exactly that. Accepted here with its limits stated rather than discovered.
 *
 * What it CANNOT catch:
 *   - a rejection raised from a helper the validator calls, not inline;
 *   - a throw whose construction differs (`throw err`, a rethrow, a thrown
 *     non-Error) — though the parse/grep cross-check below catches the subset
 *     that `throw new Error` still spells;
 *   - a throw added AND registered whose Story-Map reachability was judged wrong.
 *
 * Why it is still worth having: it is SAME-REPO. No network, no sibling
 * checkout, no cross-repo line pointer to decay. Its false positives are safe —
 * a benign refactor that moves a throw costs one look at the register, which is
 * the review you wanted anyway.
 *
 * ⚠️ THE UPGRADE, IF THIS PROVES NOISY: per-file line coverage on
 * `import-validation.ts` at 100% would make a new UNCOVERED throw fail
 * structurally. It was not mandated because this repo has no coverage
 * configuration at all and its Stryker setup is explicitly not a gate — adding
 * a coverage gate to a repo that has none is disproportionate to this signal.
 * Recorded so the next person does not re-derive it.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────────
 * It binds the vendored table to THIS repo's validator. It does NOT bind it to
 * Story Map's copy — nothing here can read the other repository. Story Map
 * editing a row leaves every test below green. See `register.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { validateImportData } from '../import-validation'
import { classifyImportData, isStoryMapExport, MAX_STRING_LENGTH as UTILS_MAX_STRING_LENGTH } from '../import-utils'
import { MAX_MILESTONES } from '@/features/forecast/constants'
import {
  REGISTER,
  PRE_VALIDATOR_REGISTER,
  FORECASTER_LIMITS,
  CANONICAL_EXPORT_SHA256,
  VENDORED_MANIFEST_SHA256,
  type ManifestEntry,
  type VendoredManifest,
} from './register'

// Resolved from this file's own location rather than process.cwd(), so the
// paths hold whatever directory the runner was started from.
const HERE = import.meta.dirname
const FIXTURES_DIR = join(HERE, 'fixtures')
const FIXTURE_PATH = join(FIXTURES_DIR, 'canonical-export.json')
const MANIFEST_PATH = join(FIXTURES_DIR, 'vendored-manifest.json')
const VALIDATOR_PATH = join(HERE, '..', 'import-validation.ts')
const IMPORT_HOOK_PATH = join(HERE, '..', '..', '..', 'features', 'projects', 'hooks', 'useImportState.ts')

type Obj = Record<string, unknown>

/**
 * A FRESH parse every call. `validateImportData` reassigns `projects`,
 * `sprints` and `_changeLog` in place, so a shared object would carry one
 * test's normalisation into the next.
 */
const fx = (): Obj => JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Obj

const projectsOf = (p: Obj): Obj[] => p.projects as Obj[]
const sprintsOf = (p: Obj): Obj[] => p.sprints as Obj[]
const milestonesOf = (p: Obj): Obj[] => projectsOf(p)[0].milestones as Obj[]

const withEnvelope = (edit: (p: Obj) => void): Obj => { const p = fx(); edit(p); return p }
const withProject = (edit: (proj: Obj) => void): Obj => withEnvelope((p) => edit(projectsOf(p)[0]))
const withMilestone = (edit: (m: Obj) => void): Obj => withEnvelope((p) => edit(milestonesOf(p)[0]))
const withSprint = (edit: (s: Obj) => void, index = 0): Obj =>
  withEnvelope((p) => edit(sprintsOf(p)[index]))

/** `n` distinct, otherwise-valid milestones, cloned from the fixture's first. */
const withMilestoneCount = (n: number): Obj =>
  withProject((proj) => {
    const template = (proj.milestones as Obj[])[0]
    proj.milestones = Array.from({ length: n }, (_, i) => ({
      ...template, id: `ms-${i}`, name: `Milestone ${i + 1}`,
    }))
  })

/** The message the validator actually produced, or a failure if it accepted. */
function messageFrom(payload: unknown): string {
  try {
    validateImportData(payload)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('Expected validateImportData to REJECT this payload — it accepted it.')
}

/**
 * Turn a register template into a matcher by punching out its `${...}` holes.
 * This is what ties a probe's concrete message back to its ROW: without it a
 * probe could assert a correct message against the wrong row and stay green.
 */
function templateToRegExp(template: string): RegExp {
  const literals = template
    .split(/\$\{[^}]*\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${literals.join('.+?')}$`)
}

/** Every `throw new Error('...')` / `` `...` `` argument, in source order. */
function extractThrowMessages(source: string): string[] {
  const pattern = /throw new Error\(\s*([`'])([\s\S]*?)\1\s*\)/g
  const found: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) found.push(match[2])
  return found
}

const VALIDATOR_SOURCE = readFileSync(VALIDATOR_PATH, 'utf8')

// ── C6 · the vendored fixture is the one Story Map committed ────────────────

describe('C6 — the vendored canonical fixture', () => {
  it('matches the SHA-256 pinned in both repos', () => {
    const actual = createHash('sha256').update(readFileSync(FIXTURE_PATH)).digest('hex')
    expect(actual).toBe(CANONICAL_EXPORT_SHA256)
  })

  it('omits exportedAt, which the validator never reads', () => {
    // Not an accident and not a leniency to fix. `version` and `exportedAt` are
    // declared on `ExportData` and are WRITTEN on export, but no import-path
    // code reads either — so Story Map normalises `exportedAt` out to keep the
    // fixture deterministic, and this validator is indifferent. The
    // `data is ExportData` predicate overstates what was checked; that is a
    // type-honesty question, not a validation hole.
    const data = fx()
    expect(data.exportedAt).toBeUndefined()
    expect(validateImportData(data)).toBe(true)
  })
})

// ── C1 / C2 · the real pipeline, not a reimplementation ─────────────────────

describe('C1/C2 — the canonical payload through the real import pipeline', () => {
  it('C1 — validateImportData accepts it', () => {
    expect(validateImportData(fx())).toBe(true)
  })

  it('C1 — isStoryMapExport recognises it', () => {
    const data = fx()
    validateImportData(data)
    expect(isStoryMapExport(data as never)).toBe(true)
  })

  it('C2 — classifyImportData routes it to the Story Map branch', () => {
    // ⚠️ THE LOAD-BEARING ONE. Both checks above can pass while this branch is
    // dead: that was the state for the entire life of the feature until Story
    // Map v0.52.10 began emitting `source`, and every real export until then
    // classified as `legacy` — which pre-selects workspace-wide replace-all and
    // hides the per-project merge controls.
    const data = fx()
    validateImportData(data)
    expect(classifyImportData(data as never).exportType).toBe('spert-story-map')
  })

  it('C2 — and NOT legacy, which is the failure mode this replaced', () => {
    const data = fx()
    validateImportData(data)
    expect(classifyImportData(data as never).exportType).not.toBe('legacy')
  })
})

// ── C5 · the row count is derived here, not stated ──────────────────────────

describe('C5 — the register row count', () => {
  it('derives the throw-site count from source and matches the register', () => {
    // Story Map's CI cannot see `import-validation.ts`, so over there this
    // number is a STATED fact pinned to a commit. Here it is derived. Do not
    // reintroduce a hardcoded 33.
    const grepped = VALIDATOR_SOURCE.match(/throw new Error/g)?.length ?? 0
    expect(grepped).toBe(REGISTER.length)
  })

  it('cross-checks the parse against the grep, so an unparseable throw cannot hide', () => {
    // The grep counts occurrences; the parse must reach the same total. A throw
    // the parser cannot read would otherwise undercount silently and let the
    // positional message comparison below pass on a short list.
    const grepped = VALIDATOR_SOURCE.match(/throw new Error/g)?.length ?? 0
    expect(extractThrowMessages(VALIDATOR_SOURCE)).toHaveLength(grepped)
  })

  it('has a unique id per row', () => {
    expect(new Set(REGISTER.map((r) => r.id)).size).toBe(REGISTER.length)
  })
})

// ── C4 · every register message is one this repo really produces ────────────

describe('C4 — register messages against the source', () => {
  it('matches every throw argument verbatim, in source order', () => {
    // Exact string equality, positional. Matching on the message rather than
    // the line is deliberate: a cross-repo line pointer decays, the thrown
    // string is the stable symbol.
    expect(extractThrowMessages(VALIDATOR_SOURCE)).toEqual(REGISTER.map((r) => r.message))
  })

  it('finds every pre-validator gate message in useImportState', () => {
    // These three are refusals raised BEFORE the validator runs, so they are
    // outside the 33 throws. Asserted textually against the hook's source: the
    // register calls them gates, and rendering the hook to produce them is a
    // different kind of test than this file is.
    const hookSource = readFileSync(IMPORT_HOOK_PATH, 'utf8')
    for (const row of PRE_VALIDATOR_REGISTER) {
      expect(hookSource, `${row.id} is no longer produced`).toContain(row.message)
    }
  })
})

// ── C4 (runtime) · every row is reachable and renders its message ───────────

/** One payload per register row that trips exactly that row, and its message. */
const PROBES: Record<string, { payload: () => unknown; message: string }> = {
  F01: { payload: () => 'not an object', message: 'Import data must be a JSON object.' },
  F02: { payload: () => withEnvelope((p) => { p.projects = 'nope' }), message: 'Import data is missing a valid "projects" array.' },
  F03: { payload: () => withEnvelope((p) => { p.sprints = 'nope' }), message: 'Import data is missing a valid "sprints" array.' },
  F04: { payload: () => withEnvelope((p) => { (p.projects as unknown[])[0] = null }), message: 'Project at index 0 is not a valid object.' },
  F05: { payload: () => withProject((proj) => { proj.id = '' }), message: 'Project at index 0 is missing a valid "id".' },
  F06: { payload: () => withEnvelope((p) => { p.projects = [projectsOf(p)[0], { ...projectsOf(p)[0] }] }), message: 'Duplicate project ID "prod-fixture" found at index 1.' },
  F07: { payload: () => withProject((proj) => { proj.name = '' }), message: 'Project at index 0 is missing a valid "name".' },
  F08: { payload: () => withProject((proj) => { proj.name = 'N'.repeat(201) }), message: 'Project at index 0 has a name exceeding 200 characters.' },
  F09: { payload: () => withProject((proj) => { delete proj.unitOfMeasure }), message: 'Project at index 0 is missing a valid "unitOfMeasure".' },
  F10: { payload: () => withProject((proj) => { proj.unitOfMeasure = 'u'.repeat(201) }), message: 'Project at index 0 has a unitOfMeasure exceeding 200 characters.' },
  F11: { payload: () => withProject((proj) => { proj.sprintCadenceWeeks = 53 }), message: 'Project at index 0 has invalid sprintCadenceWeeks (must be 1-52).' },
  F12: { payload: () => withProject((proj) => { proj.firstSprintStartDate = '2027-02-29' }), message: 'Project at index 0 has invalid firstSprintStartDate (must be YYYY-MM-DD format).' },
  F13: { payload: () => withProject((proj) => { proj.milestones = 'nope' }), message: 'Project at index 0 has invalid "milestones" (must be an array).' },
  F14: { payload: () => withMilestoneCount(11), message: 'Project at index 0 has more than 10 milestones.' },
  F15: { payload: () => withProject((proj) => { (proj.milestones as unknown[])[0] = null }), message: 'Project 0, milestone at index 0 is not a valid object.' },
  F16: { payload: () => withMilestone((m) => { m.id = '' }), message: 'Project 0, milestone at index 0 is missing a valid "id".' },
  F17: { payload: () => withProject((proj) => { const m = (proj.milestones as Obj[])[0]; proj.milestones = [m, { ...m }] }), message: 'Project 0, duplicate milestone ID "rel-1" at index 1.' },
  F18: { payload: () => withMilestone((m) => { m.name = '' }), message: 'Project 0, milestone at index 0 is missing a valid "name".' },
  F19: { payload: () => withMilestone((m) => { m.name = 'R'.repeat(201) }), message: 'Project 0, milestone at index 0 has a name exceeding 200 characters.' },
  F20: { payload: () => withMilestone((m) => { m.backlogSize = 1_000_000 }), message: 'Project 0, milestone at index 0 has invalid backlogSize (must be >= 0 and <= 999999).' },
  F21: { payload: () => withMilestone((m) => { m.color = '' }), message: 'Project 0, milestone at index 0 is missing a valid "color".' },
  F22: { payload: () => withMilestone((m) => { m.showOnChart = 'yes' }), message: 'Project 0, milestone at index 0 has invalid "showOnChart" (must be a boolean).' },
  F23: { payload: () => withEnvelope((p) => { (p.sprints as unknown[])[0] = null }), message: 'Sprint at index 0 is not a valid object.' },
  F24: { payload: () => withSprint((s) => { s.id = '' }), message: 'Sprint at index 0 is missing a valid "id".' },
  F25: { payload: () => withEnvelope((p) => { p.sprints = [sprintsOf(p)[0], { ...sprintsOf(p)[0] }] }), message: 'Duplicate sprint ID "sp-1" found at index 1.' },
  F26: { payload: () => withSprint((s) => { s.projectId = '' }), message: 'Sprint at index 0 is missing a valid "projectId".' },
  F27: { payload: () => withSprint((s) => { s.sprintNumber = 10_001 }), message: 'Sprint at index 0 has invalid sprintNumber (must be 1-10000).' },
  // 1.5 is in range, so it clears F27 and lands on the integer check — the only
  // input that reaches F28 at all.
  F28: { payload: () => withSprint((s) => { s.sprintNumber = 1.5 }), message: 'Sprint at index 0 has non-integer sprintNumber.' },
  F29: { payload: () => withSprint((s) => { s.doneValue = 1_000_000 }), message: 'Sprint at index 0 has invalid doneValue (must be 0-999999).' },
  F30: { payload: () => withSprint((s) => { s.backlogAtSprintEnd = 1_000_000 }), message: 'Sprint at index 0 has invalid backlogAtSprintEnd (must be 0-999999).' },
  F31: { payload: () => withSprint((s) => { s.sprintStartDate = '2027-02-29' }), message: 'Sprint at index 0 has invalid sprintStartDate (must be YYYY-MM-DD format).' },
  // Index 3 on purpose: Story Map can only reach this field on the LAST sprint.
  F32: { payload: () => withSprint((s) => { s.sprintFinishDate = '2027-02-29' }, 3), message: 'Sprint at index 3 has invalid sprintFinishDate (must be YYYY-MM-DD format).' },
  F33: { payload: () => withSprint((s) => { s.customFinishDate = '2027-02-29' }), message: 'Sprint at index 0 has invalid customFinishDate (must be YYYY-MM-DD format).' },
}

describe('C4 — every register row is produced at runtime', () => {
  it('probes every row and nothing else', () => {
    expect(Object.keys(PROBES).sort()).toEqual(REGISTER.map((r) => r.id).sort())
  })

  it.each(REGISTER.map((row) => [row.id, row] as const))(
    '%s produces its registered message',
    (_id, row) => {
      const produced = messageFrom(PROBES[row.id].payload())
      // The concrete message the validator emitted…
      expect(produced).toBe(PROBES[row.id].message)
      // …and it must be an instance of THIS row's template, which is what stops
      // a probe asserting a correct message against the wrong row.
      expect(produced).toMatch(templateToRegExp(row.message))
    },
  )
})

// ── C3 · boundary pairs, both sides ─────────────────────────────────────────

interface BoundaryPair {
  readonly row: string
  readonly limit: keyof typeof FORECASTER_LIMITS | 'DATE_IS_REAL' | 'NUMERIC_FLOOR'
  readonly label: string
  readonly at: () => unknown
  readonly over: () => unknown
  readonly message: string
}

/**
 * Every pair states BOTH sides. A one-sided case passes just as happily with
 * the limit set wrong, and that failure has recurred through this campaign.
 *
 * ⚠️ BOTH SIDES OF EVERY PAIR BELOW ARE CONSTRUCTED HERE, by mutating the
 * canonical fixture. Nothing derives them, so a mutation built wrong tests
 * nothing. Read them; do not trust them.
 *
 * ── WHY THESE SURVIVED THE VENDORED SET ─────────────────────────────────────
 * Story Map v0.52.13 ships real exporter output for six rows, and the block
 * below this one uses it. These hand-built pairs are NOT redundant with it:
 *
 *   - They cover eight axes Story Map's exporter structurally CANNOT emit —
 *     F10 unitOfMeasure, F12/F31/F33 dates, F30 backlogAtSprintEnd, and the
 *     exact-zero floors. Those rows are UNREACHABLE or PRECLUDED in the
 *     register, which is precisely why no fixture for them can exist.
 *   - The vendored F32 pair uses '2026-13-45', which is Invalid Date and so
 *     dies at the isNaN guard. Only the leap pair here reaches the
 *     auto-correction check at import-validation.ts:39-43.
 *   - The vendored F29 pair is 1 / -1, testing the exporter-reachable
 *     direction. The pair here is 0 / -1, pinning the boundary VALUE.
 *
 * Where the two overlap, the vendored half is the better evidence and is not
 * duplicated away — an independent construction that agrees is worth keeping.
 */
const BOUNDARY_PAIRS: readonly BoundaryPair[] = [
  {
    row: 'F14', limit: 'MAX_MILESTONES', label: 'milestones per project',
    at: () => withMilestoneCount(FORECASTER_LIMITS.MAX_MILESTONES),
    over: () => withMilestoneCount(FORECASTER_LIMITS.MAX_MILESTONES + 1),
    message: 'Project at index 0 has more than 10 milestones.',
  },
  {
    row: 'F08', limit: 'MAX_STRING_LENGTH', label: 'project name length',
    at: () => withProject((proj) => { proj.name = 'N'.repeat(FORECASTER_LIMITS.MAX_STRING_LENGTH) }),
    over: () => withProject((proj) => { proj.name = 'N'.repeat(FORECASTER_LIMITS.MAX_STRING_LENGTH + 1) }),
    message: 'Project at index 0 has a name exceeding 200 characters.',
  },
  {
    row: 'F10', limit: 'MAX_STRING_LENGTH', label: 'unitOfMeasure length',
    at: () => withProject((proj) => { proj.unitOfMeasure = 'u'.repeat(FORECASTER_LIMITS.MAX_STRING_LENGTH) }),
    over: () => withProject((proj) => { proj.unitOfMeasure = 'u'.repeat(FORECASTER_LIMITS.MAX_STRING_LENGTH + 1) }),
    message: 'Project at index 0 has a unitOfMeasure exceeding 200 characters.',
  },
  {
    row: 'F19', limit: 'MAX_STRING_LENGTH', label: 'milestone name length',
    at: () => withMilestone((m) => { m.name = 'R'.repeat(FORECASTER_LIMITS.MAX_STRING_LENGTH) }),
    over: () => withMilestone((m) => { m.name = 'R'.repeat(FORECASTER_LIMITS.MAX_STRING_LENGTH + 1) }),
    message: 'Project 0, milestone at index 0 has a name exceeding 200 characters.',
  },
  {
    row: 'F20', limit: 'MAX_NUMERIC_VALUE', label: 'milestone backlogSize ceiling',
    at: () => withMilestone((m) => { m.backlogSize = FORECASTER_LIMITS.MAX_NUMERIC_VALUE }),
    over: () => withMilestone((m) => { m.backlogSize = FORECASTER_LIMITS.MAX_NUMERIC_VALUE + 1 }),
    message: 'Project 0, milestone at index 0 has invalid backlogSize (must be >= 0 and <= 999999).',
  },
  {
    // Floor 0, not 0.01: `backlogSize === 0` is the user-maintained
    // "milestone completed" sentinel. Accepting 0 is a product rule, not slack.
    row: 'F20', limit: 'NUMERIC_FLOOR', label: 'milestone backlogSize floor',
    at: () => withMilestone((m) => { m.backlogSize = 0 }),
    over: () => withMilestone((m) => { m.backlogSize = -1 }),
    message: 'Project 0, milestone at index 0 has invalid backlogSize (must be >= 0 and <= 999999).',
  },
  {
    row: 'F29', limit: 'MAX_NUMERIC_VALUE', label: 'sprint doneValue ceiling',
    at: () => withSprint((s) => { s.doneValue = FORECASTER_LIMITS.MAX_NUMERIC_VALUE }),
    over: () => withSprint((s) => { s.doneValue = FORECASTER_LIMITS.MAX_NUMERIC_VALUE + 1 }),
    message: 'Sprint at index 0 has invalid doneValue (must be 0-999999).',
  },
  {
    row: 'F29', limit: 'NUMERIC_FLOOR', label: 'sprint doneValue floor',
    at: () => withSprint((s) => { s.doneValue = 0 }),
    over: () => withSprint((s) => { s.doneValue = -1 }),
    message: 'Sprint at index 0 has invalid doneValue (must be 0-999999).',
  },
  {
    row: 'F30', limit: 'MAX_NUMERIC_VALUE', label: 'backlogAtSprintEnd ceiling',
    at: () => withSprint((s) => { s.backlogAtSprintEnd = FORECASTER_LIMITS.MAX_NUMERIC_VALUE }),
    over: () => withSprint((s) => { s.backlogAtSprintEnd = FORECASTER_LIMITS.MAX_NUMERIC_VALUE + 1 }),
    message: 'Sprint at index 0 has invalid backlogAtSprintEnd (must be 0-999999).',
  },
  {
    row: 'F30', limit: 'NUMERIC_FLOOR', label: 'backlogAtSprintEnd floor',
    at: () => withSprint((s) => { s.backlogAtSprintEnd = 0 }),
    over: () => withSprint((s) => { s.backlogAtSprintEnd = -1 }),
    message: 'Sprint at index 0 has invalid backlogAtSprintEnd (must be 0-999999).',
  },
  {
    row: 'F12', limit: 'DATE_IS_REAL', label: 'firstSprintStartDate leap day',
    at: () => withProject((proj) => { proj.firstSprintStartDate = '2028-02-29' }),
    over: () => withProject((proj) => { proj.firstSprintStartDate = '2027-02-29' }),
    message: 'Project at index 0 has invalid firstSprintStartDate (must be YYYY-MM-DD format).',
  },
  {
    row: 'F31', limit: 'DATE_IS_REAL', label: 'sprintStartDate leap day',
    at: () => withSprint((s) => { s.sprintStartDate = '2028-02-29' }),
    over: () => withSprint((s) => { s.sprintStartDate = '2027-02-29' }),
    message: 'Sprint at index 0 has invalid sprintStartDate (must be YYYY-MM-DD format).',
  },
  {
    row: 'F32', limit: 'DATE_IS_REAL', label: 'sprintFinishDate leap day',
    at: () => withSprint((s) => { s.sprintFinishDate = '2028-02-29' }, 3),
    over: () => withSprint((s) => { s.sprintFinishDate = '2027-02-29' }, 3),
    message: 'Sprint at index 3 has invalid sprintFinishDate (must be YYYY-MM-DD format).',
  },
  {
    row: 'F33', limit: 'DATE_IS_REAL', label: 'customFinishDate leap day',
    at: () => withSprint((s) => { s.customFinishDate = '2028-02-29' }),
    over: () => withSprint((s) => { s.customFinishDate = '2027-02-29' }),
    message: 'Sprint at index 0 has invalid customFinishDate (must be YYYY-MM-DD format).',
  },
]

describe('C3 — boundary pairs', () => {
  it.each(BOUNDARY_PAIRS.map((p) => [`${p.row} ${p.label}`, p] as const))(
    '%s — accepts at the limit',
    (_label, pair) => {
      expect(validateImportData(pair.at())).toBe(true)
    },
  )

  it.each(BOUNDARY_PAIRS.map((p) => [`${p.row} ${p.label}`, p] as const))(
    '%s — rejects one past it, with the registered message',
    (_label, pair) => {
      const produced = messageFrom(pair.over())
      expect(produced).toBe(pair.message)
      const row = REGISTER.find((r) => r.id === pair.row)
      expect(produced).toMatch(templateToRegExp(row!.message))
    },
  )

  it('covers every limit the vendored table names, plus the date rule', () => {
    // Adding a constant to FORECASTER_LIMITS without a pair fails here rather
    // than shipping an untested limit.
    const covered = new Set(BOUNDARY_PAIRS.map((p) => p.limit))
    for (const key of Object.keys(FORECASTER_LIMITS)) {
      expect(covered, `${key} has no boundary pair`).toContain(key)
    }
    expect(covered).toContain('DATE_IS_REAL')
    expect(covered).toContain('NUMERIC_FLOOR')
  })

  it('the leap pair is what proves the real-calendar rule, not the regex', () => {
    // Measured, and the reason the pair is a LEAP day rather than the register's
    // own "2026-13-45": that value is Invalid Date, so it dies at the isNaN
    // guard (import-validation.ts:37) and NEVER exercises the auto-correction
    // check below it. A non-leap Feb 29 does the opposite — it parses cleanly
    // and is silently corrected to March 1 UTC, so ONLY the round-trip
    // comparison at import-validation.ts:39-43 rejects it. Swap the pair for a
    // shape-only bad date and lines 39-43 stop being covered by anything here.
    expect(Number.isNaN(new Date('2026-13-45').getTime())).toBe(true)

    const corrected = new Date('2027-02-29')
    expect(Number.isNaN(corrected.getTime())).toBe(false)
    expect(corrected.toISOString().slice(0, 10)).toBe('2027-03-01')
    // Both halves of the round-trip comparison disagree with the input, which
    // is what makes the rejection independent of the isNaN guard.
    expect(corrected.getUTCMonth()).not.toBe(2 - 1)
    expect(corrected.getUTCDate()).not.toBe(29)
  })
})

// ── The vendored boundary set ───────────────────────────────────────────────

/**
 * Story Map v0.52.13 ships twelve boundary payloads plus the canonical one, all
 * REAL `buildForecasterExport` output. The `-over` halves are what the exporter
 * produces BEFORE `downloadForecasterExport` refuses them, which is what makes
 * them legitimate reject-side inputs here rather than hand-drawn approximations.
 *
 * ⚠️ `forecasterShould` IS STORY MAP'S CLAIM ABOUT THIS REPO, AND IS NOT TRUSTED.
 * It is a field in a file another repository generated; a wrong value would make
 * a green run here prove the opposite of what it says. Every verdict below is
 * produced by THIS repo's validator, and the claim is then checked against it —
 * never the other way round. Two further guards make that non-circular:
 *   - a reject must carry the message registered for the row the manifest NAMES,
 *     so a payload rejecting for an unrelated reason cannot pass as its row;
 *   - every row must have exactly one accept and one reject, so a manifest that
 *     relabelled a half to agree with itself breaks the pairing.
 */
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as VendoredManifest

const sha256Of = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

/** Fresh parse per call — `validateImportData` normalises its argument in place. */
const loadEntry = (entry: ManifestEntry): unknown =>
  JSON.parse(readFileSync(join(FIXTURES_DIR, entry.file), 'utf8'))

describe('C6 — the vendored fixture set is the one Story Map committed', () => {
  it('the manifest matches its pin', () => {
    // The single hand-transcribed hash. Everything else chains off it.
    expect(sha256Of(MANIFEST_PATH)).toBe(VENDORED_MANIFEST_SHA256)
  })

  it.each(MANIFEST.entries.map((e) => [e.file, e] as const))(
    '%s matches the SHA the manifest records for it',
    (_file, entry) => {
      expect(sha256Of(join(FIXTURES_DIR, entry.file))).toBe(entry.sha256)
    },
  )

  it('lists every vendored payload, and vendors every listed payload', () => {
    // Both directions. A payload added without a manifest row would otherwise
    // sit here untested, and a row naming a missing file would silently skip.
    const onDisk = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'vendored-manifest.json')
      .sort()
    expect(MANIFEST.entries.map((e) => e.file).sort()).toEqual(onDisk)
  })

  it('still carries the canonical payload unchanged', () => {
    // Byte-identical across Story Map v0.52.12 → v0.52.13. Asserted against the
    // constant pinned BEFORE the set grew, so a regeneration that quietly
    // rewrote it would fail here rather than being absorbed by the new manifest.
    const canonical = MANIFEST.entries.find((e) => e.file === 'canonical-export.json')
    expect(canonical?.sha256).toBe(CANONICAL_EXPORT_SHA256)
  })
})

describe('the vendored set — verdicts produced by THIS validator', () => {
  it.each(MANIFEST.entries.map((e) => [`${e.row} ${e.label}`, e] as const))(
    '%s',
    (_label, entry) => {
      if (entry.forecasterShould === 'accept') {
        const data = loadEntry(entry)
        expect(validateImportData(data)).toBe(true)
        // An accepted Story Map payload must also ROUTE as one. Accepting it
        // while classifying it `legacy` is the failure this contract exists for.
        expect(classifyImportData(data as never).exportType).toBe('spert-story-map')
        return
      }
      const produced = messageFrom(loadEntry(entry))
      const row = REGISTER.find((r) => r.id === entry.row)
      expect(row, `manifest names row ${entry.row}, which is not in the register`).toBeDefined()
      // The rejection must be THIS row's, not merely some rejection.
      expect(produced).toMatch(templateToRegExp(row!.message))
    },
  )

  it('pairs every boundary row — one accept, one reject', () => {
    const byRow = new Map<string, string[]>()
    for (const e of MANIFEST.entries) {
      if (e.row === 'canonical') continue
      byRow.set(e.row, [...(byRow.get(e.row) ?? []), e.forecasterShould])
    }
    expect(byRow.size).toBeGreaterThan(0)
    for (const [row, verdicts] of byRow) {
      expect(verdicts.sort(), `${row} is not a pair`).toEqual(['accept', 'reject'])
    }
  })

  it('names only rows that exist in the register', () => {
    const ids = new Set(REGISTER.map((r) => r.id))
    for (const e of MANIFEST.entries) {
      if (e.row === 'canonical') continue
      expect(ids, `manifest names unknown row ${e.row}`).toContain(e.row)
    }
  })

  it('covers a strict subset of the SHIPPED rows, and says which are missing', () => {
    // Not a defect — a fact worth failing on if it changes silently. Story Map
    // BLOCKS nine rows but ships payloads for six: F07 and F18 are empty-name
    // cases rather than boundaries, and F30 (backlogAtSprintEnd) is a real
    // boundary with no vendored pair. F30 is covered by a hand-built pair above.
    const shipped = REGISTER.filter((r) => r.status === 'SHIPPED').map((r) => r.id)
    const vendored = new Set(MANIFEST.entries.map((e) => e.row).filter((r) => r !== 'canonical'))
    expect([...vendored].sort()).toEqual(['F08', 'F14', 'F19', 'F20', 'F29', 'F32'])
    expect(shipped.filter((id) => !vendored.has(id))).toEqual(['F07', 'F18', 'F30'])
  })
})

// ── Same-repo copies of the same limits ─────────────────────────────────────

describe('the two copies of these limits inside THIS repo', () => {
  it('MAX_MILESTONES (the UI cap) is the cap the validator enforces', () => {
    // ⚠️ The validator does NOT import this constant — import-validation.ts
    // writes `10` as a bare literal, twice, at lines 211-212. Raise
    // MAX_MILESTONES and the UI will happily build projects this app's own
    // importer rejects on round-trip. Nothing else in the repo binds the two.
    expect(MAX_MILESTONES).toBe(FORECASTER_LIMITS.MAX_MILESTONES)
    expect(validateImportData(withMilestoneCount(MAX_MILESTONES))).toBe(true)
    expect(messageFrom(withMilestoneCount(MAX_MILESTONES + 1)))
      .toBe('Project at index 0 has more than 10 milestones.')
  })

  it('import-utils MAX_STRING_LENGTH is the cap the validator enforces', () => {
    // import-utils.ts:10 carries the comment "Must match the private
    // MAX_STRING_LENGTH in import-validation.ts". Until now nothing asserted it.
    // It sizes the " - Copy (N)" truncation, so a drift silently produces copy
    // names the importer would refuse.
    expect(UTILS_MAX_STRING_LENGTH).toBe(FORECASTER_LIMITS.MAX_STRING_LENGTH)
    expect(validateImportData(
      withProject((proj) => { proj.name = 'N'.repeat(UTILS_MAX_STRING_LENGTH) }),
    )).toBe(true)
    expect(messageFrom(withProject((proj) => { proj.name = 'N'.repeat(UTILS_MAX_STRING_LENGTH + 1) })))
      .toBe('Project at index 0 has a name exceeding 200 characters.')
  })
})
