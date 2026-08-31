// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Milestone, Project, Sprint } from '@/shared/types'
import type { ExportData } from './import-validation'

// Must match the private MAX_STRING_LENGTH in import-validation.ts. Exported
// for the clone path (project-store.ts) so both copy paths share one constant.
export const MAX_STRING_LENGTH = 200

// --- Import file type guards ---
// Moved from merge-import.ts in v0.30.0 (that file deleted).

export interface ProjectSubsetExportData extends ExportData {
  _exportType: 'spert-forecaster-project-export'
}

// Story Map exports set source: 'spert-story-map' (NOT _exportType).
export interface StoryMapExportData extends ExportData {
  source: 'spert-story-map'
}

export function isProjectSubsetExport(data: ExportData): data is ProjectSubsetExportData {
  return (data as unknown as Record<string, unknown>)._exportType === 'spert-forecaster-project-export'
}

export function isStoryMapExport(data: ExportData): data is StoryMapExportData {
  return (data as unknown as Record<string, unknown>).source === 'spert-story-map'
}

// --- Discriminated union for ParsedImportData ---

type BaseImportData = { projects: Project[]; sprints: Sprint[] }

export type ProjectExportImportData =
  BaseImportData & { exportType: 'spert-forecaster-project-export' }

export type StoryMapImportData =
  BaseImportData & { exportType: 'spert-story-map' }

export type LegacyImportData =
  BaseImportData & {
    exportType: 'legacy'
    // Non-optional — structurally guaranteed by classifyImportData's legacy
    // branch. Preserved so applyReplaceAll can pass it to
    // importDataAndSelectFirst, restoring provenance metadata.
    //
    // ParsedImportData.projects is a structuredClone of
    // _originalExportData.projects — they are fully independent objects.
    _originalExportData: ExportData
  }

export type ParsedImportData =
  | ProjectExportImportData
  | StoryMapImportData
  | LegacyImportData

// --- Conflict types ---

export type ImportConflict = {
  type: 'id' | 'name'
  incomingProject: Project
  existingProject: Project
}

export type ConflictAction = 'skip' | 'copy' | 'replace' | 'update'

// --- availableActions ---
// ONE predicate, consumed by BOTH the radiogroup and computeDefaultDecisions.
// Two independent conditionals is how the availability rule becomes untestable.
//
// ⚠️ `update` REQUIRES POSITIVE EVIDENCE OF IDENTITY — that this incoming
// project IS the existing one. An ID conflict *is* that evidence. A NAME
// conflict must supply it another way, and a shared sprint id is that way:
// Story Map preserves `sprint.id` across exports (it renumbers `sprintNumber`,
// which is a different field), so a matching sprint id is the producer saying
// the two projects share a history.
//
// 'update' requires ALL of:
//   - a Story Map payload. `source` is DECLARED, not proven
//     (isStoryMapExport, :29) — that is what makes the §5.3 slot collision
//     constructible today.
//   - no existing sprint absent from the incoming set (§4.1). A kept sprint
//     collides with no deletion at all and moves the forecast anchor one
//     cadence period.
//   - identity evidence: an ID conflict, OR — for a name conflict — at least one
//     existing sprint id present in the incoming set.
//
// ⚠️ WHY THE NAME CASE IS REACHABLE AT ALL: a cloud migration can reassign a
// project's id, after which a later Story Map send of the same project
// classifies as a NAME conflict. Withholding `update` there left only
// `replace`, which destroys the forecast configuration `update` exists to
// protect. Matching does NOT depend on the project ids agreeing —
// mergeSprintsForUpdate keys on `sprint.id` and takes both project ids as
// separate parameters — so the old "every sprint would be unmatched"
// justification was false.
//
// ⚠️ `id`/`projectId` were no-ops in the merge ONLY WHILE `update` required an
// id conflict. That is no longer true, so project `id` is pinned EXPLICITLY in
// mergeProjectForUpdate (`pinned-identity`). Without that pin a name-conflict
// update writes the incoming id onto the project while every sprint is remapped
// to the existing one — orphaning the entire sprint history.
export function availableActions(
  conflictType: 'id' | 'name',
  exportType: ParsedImportData['exportType'],
  hasUnmatchedSprints: boolean,
  hasMatchingSprintId: boolean,
): ConflictAction[] {
  const base: ConflictAction[] = ['skip', 'copy', 'replace']
  if (exportType !== 'spert-story-map') return base
  if (hasUnmatchedSprints) return base
  if (conflictType !== 'id' && !hasMatchingSprintId) return base
  return [...base, 'update']
}

// The §4.1 predicate. TRUE when the existing project holds a sprint the
// incoming set does not, which makes `update` unavailable.
//
// ⚠️ Re-evaluated INSIDE the atomic set() as well as at preview time:
// conflictsEqual keys on (incomingId, type, existingId) and NOTHING else, so a
// cloud snapshot mid-preview can change this answer without changing any tuple.
export function hasUnmatchedExistingSprints(
  existingSprints: Sprint[],
  incomingSprints: Sprint[],
  existingProjectId: string,
  incomingProjectId: string,
): boolean {
  const incomingIds = new Set(
    incomingSprints.filter((s) => s.projectId === incomingProjectId).map((s) => s.id),
  )
  return existingSprints.some(
    (s) => s.projectId === existingProjectId && !incomingIds.has(s.id),
  )
}

// The identity-evidence predicate. TRUE when at least one sprint of the
// EXISTING project also appears in the incoming set for the incoming project,
// which is what lets a NAME conflict offer `update` (§3).
//
// ⚠️ Signature mirrors hasUnmatchedExistingSprints exactly — the two are read
// together at both call sites and are meant to look like a pair.
//
// ⚠️ Vacuously FALSE on a sprint-less existing project, which is correct here:
// no sprints means no evidence, so a name conflict gets no `update`. An id
// conflict is unaffected — it carries its own evidence and never consults this.
export function hasMatchingExistingSprintId(
  existingSprints: Sprint[],
  incomingSprints: Sprint[],
  existingProjectId: string,
  incomingProjectId: string,
): boolean {
  const incomingIds = new Set(
    incomingSprints.filter((s) => s.projectId === incomingProjectId).map((s) => s.id),
  )
  return existingSprints.some(
    (s) => s.projectId === existingProjectId && incomingIds.has(s.id),
  )
}

// --- Result types ---

// Disclosure payload for ONE updated project. Every value here is computed
// inside the atomic set() and ridden out on ImportDecisionResult — a
// preview-computed summary would lie under exactly the race §5.3 guards.
export type UpdateDisclosure = {
  projectId: string
  projectName: string
  // §4.4 cell 2 — added from incoming, disclosed BY NAME. backlogSize is Story
  // Map's TOTAL scope, not remaining.
  milestonesAdded: string[]
  // §4.4 cell 4 — preserved, local backlogSize > 0. TWO POPULATIONS share this
  // cell (Story-Map-side ambiguity, and Forecaster-native milestones that can
  // never match) and NOTHING STORED DISTINGUISHES THEM. The banner names both
  // possibilities rather than guessing.
  milestonesKept: string[]
  // §4.4 cell 3 — preserved, local backlogSize === 0. Inert to thresholds.
  milestonesKeptCompleted: number
  // Cells 3 and 4 are APPENDED after the incoming-ordered set (§4.4 placement).
  milestonesAppended: number
  sprintsAdded: number
  sprintsMatched: number
}

// A slot claim that lost to a higher-precedence action, or to array order.
export type ImportDowngrade = {
  incomingProjectId: string
  incomingProjectName: string
  from: ConflictAction
  to: 'skip'
}

export type ImportDecisionResult = {
  added: number
  skipped: number
  copied: number
  replaced: number
  updated: number
  // Keyed by EXISTING project ID → incoming project ID. ONLY populated for
  // name-conflict replaces (existingId ≠ winner.id).
  replacedIdMap: Map<string, string>
  // Set of ALL existing project IDs replaced (ID-conflict AND name-conflict).
  replacedExistingIds: Set<string>
  // ⚠️ DISTINCT from replacedExistingIds, and deliberately not merged into it.
  // replacedExistingIds drives exactly three consumers — sprint drop (:329),
  // burnUpConfigs clear (project-store.ts:584), forecast-store clear (:614) —
  // and an updated project must reach NONE of them: its sprints are merged not
  // dropped, its burn-up configs survive (C18), and only its `record` is
  // cleared, never its viewState.
  updatedExistingIds: Set<string>
  disclosures: UpdateDisclosure[]
  downgrades: ImportDowngrade[]
}

export type ApplyImportResult = {
  mergedProjects: Project[]
  mergedSprints: Sprint[]
  result: ImportDecisionResult
}

// --- Store action outcome (C28) ---
// applySmartImport returns this so the hook can build the banner from the
// actual result of the atomic inside-set() computation.
export type SmartImportOutcome =
  | { ok: true; result: ImportDecisionResult }
  | { ok: false; reason: string }

// --- Store action args (C17) ---
// Takes incoming/decisions/freshConflicts — NOT pre-computed mergedProjects.
// applySmartImport re-detects conflicts AND calls applyImportDecisions inside
// its set() updater for a fully atomic merge (C17 + C28).
export interface ApplySmartImportArgs {
  incoming: ParsedImportData
  decisions: Map<string, ConflictAction>
  // Conflicts detected by the hook's stale-data guard just before calling
  // this action. applySmartImport re-detects inside set() against state.projects
  // at write time and compares against this snapshot. If they differ, the
  // updater no-ops and returns { ok: false }.
  freshConflicts: ImportConflict[]
  source: ParsedImportData['exportType']
}

// --- Shared normalization ---

export function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase()
}

// nextCopyName — finds the lowest-available "X - Copy (N)" name and registers
// it in the tracking set in one operation.
//
// Truncates baseName FIRST so the full candidate (base + suffix) never exceeds
// maxLength. Uses ' - Copy (XXXXXXXX)' (18 chars) as the overhead constant —
// this covers both the numeric suffix path (max " - Copy (99)" = 12 chars) and
// the 8-char UUID fallback path (" - Copy (XXXXXXXX)" = exactly 18 chars), so
// UUID-fallback candidates fit without post-construction truncation.
//
// Pass Number.MAX_SAFE_INTEGER for maxLength when truncation is undesirable
// (e.g. cloneProject, which operates on already-trusted in-memory names).
//
// MUTATES the provided set: the returned name is added to existingNames before
// returning, so callers in a loop are intra-batch-collision-safe by default.
// Pass `new Set(state.projects.map((p) => p.name))` if you don't want the
// caller's set mutated.
//
// Spec deviation: replaces the old ' (2)' unconditional suffix from
// IMPORT-SPEC-REFERENCE.md line 408. See docs/SPEC_DEVIATIONS.md SD-1.
export function nextCopyName(
  baseName: string,
  existingNames: Set<string>,
  maxLength: number,
): string {
  const SUFFIX_OVERHEAD = ' - Copy (XXXXXXXX)'.length // 18; covers numeric and UUID paths
  const maxBase =
    maxLength === Number.MAX_SAFE_INTEGER
      ? baseName.trimEnd().length
      : maxLength - SUFFIX_OVERHEAD
  const truncatedBase = baseName.trimEnd().slice(0, maxBase)
  let suffix = 1
  let candidate = `${truncatedBase} - Copy (${suffix})`
  while (existingNames.has(candidate) && suffix < 99) {
    suffix++
    candidate = `${truncatedBase} - Copy (${suffix})`
  }
  if (existingNames.has(candidate)) {
    // UUID fallback — sized exactly by SUFFIX_OVERHEAD; no slice needed
    candidate = `${truncatedBase} - Copy (${crypto.randomUUID().slice(0, 8)})`
  }
  existingNames.add(candidate)
  return candidate
}

// --- classifyImportData ---

export function classifyImportData(data: ExportData): ParsedImportData {
  if (isProjectSubsetExport(data)) {
    return {
      exportType: 'spert-forecaster-project-export',
      projects: data.projects,
      sprints: data.sprints,
    }
  }
  if (isStoryMapExport(data)) {
    return {
      exportType: 'spert-story-map',
      projects: data.projects,
      sprints: data.sprints,
    }
  }
  // Deep-clone so ParsedImportData.projects and _originalExportData.projects
  // are independent. .nvmrc pins Node 22 (structuredClone safe).
  return {
    exportType: 'legacy',
    projects: structuredClone(data.projects) as Project[],
    sprints: structuredClone(data.sprints) as Sprint[],
    _originalExportData: data,
  }
}

// --- detectImportConflicts ---

// Known limitation, ACCEPTED (was "Planned: v0.31.0"; that plan lapsed and the
// behaviour has shipped unchanged since). If incoming.id matches existing A AND
// incoming.name matches a DIFFERENT existing B, only the ID conflict surfaces.
//
// ⚠️ Do not confuse this with the collision applyImportDecisions' shared slot
// registry guards. This is one incoming project matching two existing ones;
// that is TWO incoming projects claiming ONE existing slot (A by id, B by
// name). They are mirror images and have different resolutions: this one
// prefers the stronger id match and drops the name match, while the registry
// resolves by action precedence with eviction.
export function detectImportConflicts(
  incoming: ParsedImportData,
  existingProjects: Project[],
): ImportConflict[] {
  const idMap = new Map<string, Project>()
  for (const p of existingProjects) idMap.set(p.id, p)

  const nameMap = new Map<string, Project>()
  for (const p of existingProjects) {
    const key = normalizeProjectName(p.name)
    if (!nameMap.has(key)) nameMap.set(key, p)
  }

  const conflicts: ImportConflict[] = []
  for (const incomingProject of incoming.projects) {
    const idHit = idMap.get(incomingProject.id)
    if (idHit) {
      conflicts.push({ type: 'id', incomingProject, existingProject: idHit })
      continue
    }
    const nameHit = nameMap.get(normalizeProjectName(incomingProject.name))
    if (nameHit) {
      conflicts.push({ type: 'name', incomingProject, existingProject: nameHit })
    }
  }
  return conflicts
}

// --- conflictsEqual ---
// Multiset equality on (incomingId, type, existingId) tuples. Order-independent.
// Full-tuple comparison detects type changes ('name' → 'id').
export function conflictsEqual(a: ImportConflict[], b: ImportConflict[]): boolean {
  if (a.length !== b.length) return false
  const key = (c: ImportConflict) =>
    `${c.incomingProject.id}\x01${c.type}\x01${c.existingProject.id}`
  const counts = new Map<string, number>()
  for (const c of a) counts.set(key(c), (counts.get(key(c)) ?? 0) + 1)
  for (const c of b) {
    const k = key(c)
    const n = counts.get(k)
    if (!n) return false
    if (n === 1) counts.delete(k)
    else counts.set(k, n - 1)
  }
  return counts.size === 0
}

// --- Update field classes ---------------------------------------------------
//
// The policy each key follows when `update` merges an incoming Story Map
// project onto an existing one.
//
// ⚠️ THESE TABLES CLASSIFY POLICIES, NOT EFFECTS. A row states what the merge
// WRITES, and that is invariant across conflict type. Only the EFFECT varies:
// `pinned-identity` on a project `id` is a no-op under an id conflict and
// load-bearing under a name conflict, and it is still one row. No row's class
// depends on the conflict type — which is what lets one table serve both.
//
// ⚠️ NOT READ BY THE MERGE FUNCTIONS — but no longer unenforced. Since SD-4,
// `field-class-contract.test.ts` runs the merges below and asserts each row's
// outcome group, so a WRONG entry now fails a test. Read SD-4 before changing a
// class: the boundary it can and cannot see is stated there, with its
// enumerated exceptions.
//
// ⚠️ WHAT THE TYPE ALONE STILL CANNOT DO. `Record<keyof T, UpdateFieldClass>`
// makes OMISSION impossible (add a field to Project/Sprint/Milestone without
// classing it and `tsc` fails), but it CANNOT make a classification true: every
// class type-checks against every key. Omission is the failure that actually
// recurred — `unitOfMeasure`, then `createdAt`/`updatedAt`, then `sprintNumber`,
// four fields over three revisions — and it is the hole the Record closes.
//
// ⚠️ The CLASSIFICATION hole is closed by SD-4's contract test, not by the type.
// Deleting the `color`/`showOnChart` claw-backs from mergeMilestonesForUpdate
// USED to leave `tsc` clean and the whole suite green while these rows went on
// claiming `local-producer-artifact`. It now fails two tests in
// `field-class-contract.test.ts`. ⚠️ Do not read a green `tsc` as "the table is
// correct" — that was never what it meant, and still is not.
export type UpdateFieldClass =
  | 'incoming'                // producer authoritative; the spread already does this
  | 'incoming-when-emitted'   // as 'incoming', but CONDITIONALLY emitted; absence leaves local
  | 'local-restore-defensive' // a real export never emits it; the restore defends a CRAFTED payload
  | 'local-restore-required'  // the real producer DOES emit it, so the restore is required
  | 'local-producer-artifact' // the incoming value is an artifact of the producer's own model
  | 'stamp'                   // neither side is right
  | 'nested-merge'            // computed by a sub-merge
  | 'match-key'               // identity of THIS merge; not merged
  | 'pinned-identity'         // container id written from existing, UNCONDITIONALLY.
                              // ⚠️ "pinned TO a value" — NOT this file's dominant
                              // "pinned BY a test/SHA" sense (PINNED_STORY_MAP).

export const PROJECT_UPDATE_FIELD_CLASSES: Record<keyof Project, UpdateFieldClass> = {
  name: 'incoming',
  // ⚠️ VACUOUS against a real export, and that is not a reason to reclassify.
  // exportForForecaster.ts reads `product.sprintCadenceWeeks || 2`, so its
  // `if (cadence)` guard can never fail and the key is ALWAYS emitted. A
  // crafted payload can still omit it; the local value must stand when it does.
  sprintCadenceWeeks: 'incoming-when-emitted',
  // Genuinely absent when no sprint carries a date.
  firstSprintStartDate: 'incoming-when-emitted',
  projectStartDate: 'local-restore-defensive',
  projectFinishDate: 'local-restore-defensive',
  productivityAdjustments: 'local-restore-defensive',
  unitOfMeasure: 'local-producer-artifact',
  createdAt: 'local-restore-required',
  updatedAt: 'stamp',
  milestones: 'nested-merge',
  // Match key of CONFLICT DETECTION, not of this merge — so it is pinned, not
  // a match key here. Pinned unconditionally: without it a name-conflict update
  // keeps the incoming id while every sprint is remapped to the existing one,
  // orphaning the lot.
  id: 'pinned-identity',
}

export const SPRINT_UPDATE_FIELD_CLASSES: Record<keyof Sprint, UpdateFieldClass> = {
  sprintNumber: 'incoming',
  sprintStartDate: 'incoming',
  sprintFinishDate: 'incoming',
  doneValue: 'incoming',
  backlogAtSprintEnd: 'incoming',
  customFinishDate: 'local-restore-defensive',
  includedInForecast: 'local-restore-required',
  createdAt: 'local-restore-required',
  updatedAt: 'stamp',
  // `priorById`'s key. Never a no-op.
  id: 'match-key',
  projectId: 'pinned-identity',
}

export const MILESTONE_UPDATE_FIELD_CLASSES: Record<keyof Milestone, UpdateFieldClass> = {
  name: 'incoming',
  backlogSize: 'local-restore-required',
  // ⚠️ Not merely "less preferred": exportForForecaster.ts assigns from a
  // position-dependent palette rotation indexed on the SURVIVING milestone
  // count, so one release dropped below its 0.01 floor recolours every later
  // milestone. A re-export can change a colour through ordering alone.
  color: 'local-producer-artifact',
  showOnChart: 'local-producer-artifact',
  createdAt: 'local-restore-required',
  updatedAt: 'stamp',
  id: 'match-key',
}

// ⚠️ EXPORTED SO A TEST CAN READ THEM — see `field-class-contract.test.ts`
// and docs/SPEC_DEVIATIONS.md SD-4,
// which runs the merge functions below and asserts each row's OUTCOME GROUP.
// Same split the repo already uses in `firestore-driver.ts`: a compile-time
// guard stays local and `void`-ed (`_PROJECT_WRITE_KEYS_GUARD`), a table a test
// must read is exported (`PROJECT_MERGE_FIELDS`). The `void`s are gone because
// the export is now the reader.
//
// ⚠️ They are STILL not read by the merge functions. The contract test is a
// SECOND, INDEPENDENT encoding — it does not make these tables authoritative.

// --- Update merge: the field-class tables above, plus §4.4's and §4.4a's
// existence partitions ---
//
// Narrative and rationale: docs/SPEC_DEVIATIONS.md → SD-2 (tracked and
// readable from any checkout, unlike the spec it supersedes).
//
// ⚠️ READ PROJECT_UPDATE_FIELD_CLASSES, SPRINT_UPDATE_FIELD_CLASSES AND
// MILESTONE_UPDATE_FIELD_CLASSES ABOVE — AND docs/SPEC_DEVIATIONS.md SD-2 —
// BEFORE CHANGING ANY OF THIS. The
// spread makes `incoming` THE DEFAULT FOR EVERY ALLOWLISTED KEY and does not
// read the tables —
// a field not restored below is silently taken from incoming. That is how
// `unitOfMeasure` and then `createdAt` were each missed for a whole revision.
//
// ⚠️ `local-restore-defensive` ("preserved by absence") is restored EXPLICITLY
// here even though a real
// Story Map export never emits those keys (exportForForecaster.ts:124-133
// bounds the emitted set at 8). `source` is DECLARED, not proven, so a
// hand-crafted payload can carry them; explicit restores make the class hold by
// construction rather than by producer behaviour.

/**
 * §4.4's milestone matrix. {matched, incoming-only, existing-only} partitions
 * on `id`.
 *
 * ⚠️ PLACEMENT IS NUMERICALLY CONSEQUENTIAL. `computeCumulativeThresholds`
 * (shared/lib/forecast-derivations.ts:157-158) is a running sum over ARRAY
 * ORDER with no sort, so where a preserved milestone sits moves every later
 * threshold. Only cell 4 is affected — a cell-3 zero contributes no increment
 * wherever it sits. Append is the only deterministic option ("local position"
 * is ill-defined once incoming reorders its own set), and the cost falls on
 * cell 4, where the user's own milestones live permanently: their own
 * threshold moves, and their forecast date with it. §5.4 discloses that.
 */
export function mergeMilestonesForUpdate(
  existing: Milestone[] | undefined,
  incoming: Milestone[] | undefined,
  ts: string,
): { milestones: Milestone[]; added: string[]; kept: string[]; keptCompleted: number } {
  const existingList = existing ?? []
  // `milestones` is emitted CONDITIONALLY (exportForForecaster.ts:133), so an
  // absent array is not "delete everything" — every existing milestone simply
  // falls to the existing-only cells and is preserved.
  const incomingList = incoming ?? []
  const priorById = new Map(existingList.map((m) => [m.id, m]))
  const incomingIds = new Set(incomingList.map((m) => m.id))

  const added: string[] = []
  const milestones: Milestone[] = incomingList.map((inc) => {
    const prior = priorById.get(inc.id)
    if (!prior) {
      // Cell 2 — incoming only. `backlogSize` is Story Map's TOTAL scope, not
      // remaining: the only value available, and overstated when restructuring
      // moved completed work in. `createdAt` from incoming (§4.4a) — there is
      // no local value and `local-restore-required` presupposes one.
      // Disclosed BY NAME.
      added.push(inc.name)
      return { ...inc, updatedAt: ts }
    }
    // Cell 1 — matched. Take `name` and position (`incoming`); override-restore
    // `backlogSize` and `createdAt` (`local-restore-required`), `color` and
    // `showOnChart` (`local-producer-artifact`).
    return {
      ...prior,
      ...inc,
      backlogSize: prior.backlogSize,
      color: prior.color,
      showOnChart: prior.showOnChart,
      createdAt: prior.createdAt,
      updatedAt: ts,
    }
  })

  // Cells 3 and 4 — existing only, both PRESERVE. Appended after the
  // incoming-ordered set, keeping local relative order.
  const kept: string[] = []
  let keptCompleted = 0
  for (const m of existingList) {
    if (incomingIds.has(m.id)) continue
    if (m.backlogSize === 0) keptCompleted++ // cell 3 — inert to thresholds
    else kept.push(m.name) // cell 4 — two populations, nothing distinguishes them
    milestones.push(m)
  }
  return { milestones, added, kept, keptCompleted }
}

/**
 * §4.4a's sprint existence partition.
 *
 * The `existing only` cell cannot occur here: §4.1 makes `update` unavailable
 * when the existing project holds a sprint absent from the incoming set, and
 * that predicate is re-evaluated inside the atomic set(). So every existing
 * sprint is matched, and the merged set is exactly the incoming set.
 *
 * ⚠️ `sprintNumber` is `incoming` — take it wholesale, NEVER mix numbering
 * across sources. Story Map renumbers positionally over dated sprints
 * (exportForForecaster.ts:111), so the incoming set is internally consistent;
 * a locally-numbered sprint mixed into it is what moves the forecast anchor a
 * full cadence period.
 */
export function mergeSprintsForUpdate(
  existingSprints: Sprint[],
  incomingSprints: Sprint[],
  existingProjectId: string,
  incomingProjectId: string,
  ts: string,
): { sprints: Sprint[]; added: number; matched: number } {
  const priorById = new Map(
    existingSprints.filter((s) => s.projectId === existingProjectId).map((s) => [s.id, s]),
  )
  let added = 0
  let matched = 0
  const sprints = incomingSprints
    .filter((s) => s.projectId === incomingProjectId)
    .map((inc) => {
      const prior = priorById.get(inc.id)
      if (!prior) {
        // Incoming only — a NEW sprint, the main thing `update` delivers.
        // `createdAt` AND `includedInForecast` from incoming: both are
        // `local-restore-required`, both presuppose a local value, and a new
        // sprint has neither.
        added++
        return { ...inc, projectId: existingProjectId, updatedAt: ts }
      }
      matched++
      return {
        ...prior,
        ...inc,
        projectId: existingProjectId,
        customFinishDate: prior.customFinishDate, // local-restore-defensive
        includedInForecast: prior.includedInForecast, // local-restore-required
        createdAt: prior.createdAt, // local-restore-required
        updatedAt: ts, // stamp
      }
    })
  return { sprints, added, matched }
}

/**
 * PROJECT_UPDATE_FIELD_CLASSES applied to the project shell. Milestones merge
 * separately. See docs/SPEC_DEVIATIONS.md SD-2 for why `id` is pinned here.
 */
export function mergeProjectForUpdate(
  existing: Project,
  incoming: Project,
  ts: string,
): { project: Project; milestoneReport: ReturnType<typeof mergeMilestonesForUpdate> } {
  const milestoneReport = mergeMilestonesForUpdate(existing.milestones, incoming.milestones, ts)
  return {
    project: {
      ...existing,
      ...incoming,
      // pinned-identity — UNCONDITIONALLY from existing. A no-op under an id
      // conflict; load-bearing under a name conflict, where incoming.id differs
      // and mergeSprintsForUpdate has remapped every sprint to existing.id.
      // Without this line a name-conflict update orphans the whole history.
      id: existing.id,
      // local-restore-defensive — free by absence for a real export, explicit
      // for a crafted one.
      projectStartDate: existing.projectStartDate,
      projectFinishDate: existing.projectFinishDate,
      productivityAdjustments: existing.productivityAdjustments,
      // local-producer-artifact. Story Map hardcodes 'Story Points'
      // (exportForForecaster.ts:127); a user's "Hours" must survive.
      unitOfMeasure: existing.unitOfMeasure,
      // local-restore-required — Story Map emits createdAt on every project.
      createdAt: existing.createdAt,
      // stamp — neither side is right.
      updatedAt: ts,
      milestones: milestoneReport.milestones,
    },
    milestoneReport,
  }
}

// --- applyImportDecisions ---
// Pure synchronous function — no I/O, no store mutation.
// In applySmartImport, this is called inside Zustand's set() updater against
// state.projects at write time. The `conflicts` argument must be the
// re-detected conflicts from that same call, not a pre-captured value.
//
// ── ⚠️ DECLINED FOR ADDED COVERAGE, ON EVIDENCE ─────────────────────────────
// cc 34 puts this among the highest in the codebase, so a future session will
// arrive here meaning to add tests or decompose. It needs neither, and the
// reason is a measurement rather than a judgement.
//
// A perturbation pass put four semantic mutations through this function and
// **all four died** — the only target in that pass to score 4 of 4:
//
//   unanswered conflict defaults to REPLACE instead of skip  -> 2 tests
//   last incoming project wins the slot, not array-order     -> 2 tests
//   replacedIdMap keyed on the wrong conflict type           -> 7 tests, 2 files
//   replaced projects keep their old sprints                 -> 4 tests
//
// Most probes killed MULTIPLE tests, several of them named for the invariant
// they defend, and the replacedIdMap contract is enforced at the store layer
// too — which is why breaking it reaches project-store.test.ts. That is
// redundancy, not coincidence.
//
// ⚠️ Coverage percentage was NOT the basis. The census read this target at
// 96.2% and read `build-snapshot` at 84.0%; measured by perturbation the
// second came in at 1 of 5. The 4-of-4 is the evidence; the percentage merely
// agreed with it here.
//
// If you decompose this, re-run those four perturbations against the result.
export function applyImportDecisions(
  existingProjects: Project[],
  existingSprints: Sprint[],
  incoming: ParsedImportData,
  decisions: Map<string, ConflictAction>,
  conflicts: ImportConflict[],
): ApplyImportResult {
  const timestamp = () => new Date().toISOString()
  const generateId = () => crypto.randomUUID()

  const conflictByIncomingId = new Map<string, ImportConflict>()
  for (const c of conflicts) conflictByIncomingId.set(c.incomingProject.id, c)

  // resolvedOutcome contract:
  // - No conflict → 'added' (stray decision keys silently ignored)
  // - Conflict + no key → 'skip' (safe-by-default)
  // - Conflict + key → that action
  const resolvedOutcome = (id: string): ConflictAction | 'added' => {
    if (!conflictByIncomingId.has(id)) return 'added'
    return decisions.get(id) ?? 'skip'
  }

  // PASS 1: Pre-compute winning slot claims. Iterate in ARRAY ORDER — not
  // decisions.entries() insertion order (pitfall #12).
  //
  // ⚠️ ONE SHARED REGISTRY for 'replace' AND 'update'. A parallel
  // `winningUpdateBySlotId` would be blind to this map and reproduce the very
  // collision it prevents: incoming A id-conflicts with e1 while incoming B
  // name-conflicts with the SAME e1, so both can claim one slot. The
  // counter-sum invariant PASSES on that (replaced=1, updated=1, sum correct)
  // — it catches omission, not double-handling.
  //
  // ⚠️ THE REGISTRY HAS THREE READ SITES, and every one needs the action
  // discriminator: this claim check, the project loop, and the sprint loop.
  //
  // PRECEDENCE IS BY ACTION, NOT ARRAY POSITION: `update` outranks `replace`
  // for the same slot regardless of order, because `update` is the
  // non-destructive action. Array-order precedence is retained unchanged for
  // replace-vs-replace.
  //
  // ⚠️ update-vs-update ON ONE SLOT IS NOW CONSTRUCTIBLE. It used to be
  // impossible: both claims would have needed an id conflict against the same
  // existing project, hence the same incoming id, which validateImportData
  // rejects. Now that a NAME conflict can also offer `update` (§3), incoming A
  // can id-conflict with e1 while incoming B name-conflicts with the same e1
  // and both are decided `update`.
  //
  // ⚠️ THE TWO GROUNDS OF THE ORIGINAL RULE SPLIT HERE, so the tie is broken
  // EXPLICITLY: an ID-conflict `update` outranks a NAME-conflict `update`,
  // because an id match is the stronger identity claim. That is the ground the
  // original rule stated, applied to the case it did not have to consider.
  // `update` still outranks `replace` unconditionally — a name-conflict
  // `update` beating an id-conflict `replace` is the non-destructive ground
  // governing, and is unchanged shipped behaviour. Array order breaks the
  // remaining tie (two name-conflict updates on one slot).
  type SlotClaim = {
    project: Project
    action: 'replace' | 'update'
    conflictType: 'id' | 'name'
  }
  const winningBySlotId = new Map<string, SlotClaim>()
  const downgrades: ImportDowngrade[] = []
  let skipped = 0
  const downgradeToSkip = (p: Project, from: ConflictAction) => {
    // `skip`, not `copy`: `copy` is ALREADY the default for a name conflict
    // (useImportState.ts), so a user who chose `replace` has actively declined
    // it, and re-imposing it would leave two near-identically-named projects.
    skipped++
    downgrades.push({
      incomingProjectId: p.id,
      incomingProjectName: p.name,
      from,
      to: 'skip',
    })
  }
  for (const p of incoming.projects) {
    const outcome = resolvedOutcome(p.id)
    if (outcome !== 'replace' && outcome !== 'update') continue
    const conflict = conflictByIncomingId.get(p.id)
    if (!conflict) continue
    const slotId = conflict.existingProject.id
    const incumbent = winningBySlotId.get(slotId)
    if (!incumbent) {
      winningBySlotId.set(slotId, { project: p, action: outcome, conflictType: conflict.type })
      continue
    }
    // EVICTION — the incumbent is superseded, and counted skipped exactly once.
    const evicts =
      (outcome === 'update' && incumbent.action === 'replace') ||
      (outcome === 'update' &&
        incumbent.action === 'update' &&
        conflict.type === 'id' &&
        incumbent.conflictType === 'name')
    if (evicts) {
      downgradeToSkip(incumbent.project, incumbent.action)
      winningBySlotId.set(slotId, { project: p, action: outcome, conflictType: conflict.type })
      continue
    }
    downgradeToSkip(p, outcome)
  }

  // PASS 2: Slot substitution.
  const mergedProjects: Project[] = []
  const mergedSprints: Sprint[] = []
  const updateSprints: Sprint[] = []
  const replacedExistingIds = new Set<string>()
  const updatedExistingIds = new Set<string>()
  const disclosures: UpdateDisclosure[] = []
  let replaced = 0
  let updated = 0
  const replacedIdMap = new Map<string, string>()
  for (const existingProject of existingProjects) {
    const claim = winningBySlotId.get(existingProject.id)
    // ⚠️ READ SITE 2 of 3. Without the discriminator an `update` falls into the
    // replace branch: `mergedProjects.push(claim.project)` pushes the INCOMING
    // project wholesale, so the merge never happens at all, and the id joins
    // replacedExistingIds, which drives all three of its consumers — sprint
    // drop, burnUpConfigs clear, forecast-store clear.
    if (claim?.action === 'replace') {
      mergedProjects.push(claim.project)
      replacedExistingIds.add(existingProject.id)
      if (conflictByIncomingId.get(claim.project.id)?.type === 'name') {
        replacedIdMap.set(existingProject.id, claim.project.id)
      }
      replaced++
    } else if (claim?.action === 'update') {
      const ts = timestamp()
      const { project, milestoneReport } = mergeProjectForUpdate(
        existingProject,
        claim.project,
        ts,
      )
      const sprintReport = mergeSprintsForUpdate(
        existingSprints,
        incoming.sprints,
        existingProject.id,
        claim.project.id,
        ts,
      )
      mergedProjects.push(project)
      updateSprints.push(...sprintReport.sprints)
      updatedExistingIds.add(existingProject.id)
      disclosures.push({
        projectId: existingProject.id,
        projectName: project.name,
        milestonesAdded: milestoneReport.added,
        milestonesKept: milestoneReport.kept,
        milestonesKeptCompleted: milestoneReport.keptCompleted,
        milestonesAppended: milestoneReport.kept.length + milestoneReport.keptCompleted,
        sprintsAdded: sprintReport.added,
        sprintsMatched: sprintReport.matched,
      })
      updated++
    } else {
      mergedProjects.push(existingProject)
    }
  }
  for (const s of existingSprints) {
    if (replacedExistingIds.has(s.projectId)) continue
    // An updated project's sprints were MERGED above. Carrying the originals
    // through as well would duplicate every matched sprint.
    if (updatedExistingIds.has(s.projectId)) continue
    mergedSprints.push(s)
  }
  for (const [, claim] of winningBySlotId) {
    // ⚠️ READ SITE 3 of 3. Without the discriminator an updated project also
    // receives its incoming sprints here, ON TOP of the merged set —
    // duplicate sprint ids AND duplicate sprintNumbers, which is precisely the
    // anchor drift §4.1 refuses an update to prevent.
    if (claim.action !== 'replace') continue
    for (const s of incoming.sprints.filter((s) => s.projectId === claim.project.id)) {
      mergedSprints.push(s)
    }
  }
  mergedSprints.push(...updateSprints)

  // PASS 3a: Copies.
  // occupiedNames is seeded from post-Pass-2 mergedProjects so the collision-walk
  // accounts for surviving existing projects and all replaced slot winners.
  // nextCopyName mutates occupiedNames to prevent intra-batch collisions.
  const occupiedNames = new Set(mergedProjects.map((p) => p.name))
  let copied = 0
  for (const p of incoming.projects) {
    if (resolvedOutcome(p.id) !== 'copy') continue
    const ts = timestamp()
    const newId = generateId()
    const copyName = nextCopyName(p.name, occupiedNames, MAX_STRING_LENGTH)
    const copyProject: Project = {
      ...p,
      id: newId,
      name: copyName,
      updatedAt: ts,
      milestones: p.milestones?.map((m) => ({ ...m, id: generateId(), updatedAt: ts })) ?? [],
      productivityAdjustments:
        p.productivityAdjustments?.map((a) => ({ ...a, id: generateId(), updatedAt: ts })) ?? [],
    }
    mergedProjects.push(copyProject)
    for (const s of incoming.sprints.filter((s) => s.projectId === p.id)) {
      mergedSprints.push({ ...s, id: generateId(), projectId: newId })
    }
    copied++
  }

  // PASS 3b: Added (non-conflicting).
  let added = 0
  for (const p of incoming.projects) {
    if (resolvedOutcome(p.id) !== 'added') continue
    mergedProjects.push(p)
    for (const s of incoming.sprints.filter((s) => s.projectId === p.id)) {
      mergedSprints.push(s)
    }
    added++
  }
  for (const p of incoming.projects) {
    if (resolvedOutcome(p.id) === 'skip') skipped++
  }

  return {
    mergedProjects,
    mergedSprints,
    result: {
      added,
      skipped,
      copied,
      replaced,
      updated,
      replacedIdMap,
      replacedExistingIds,
      updatedExistingIds,
      disclosures,
      downgrades,
    },
  }
}
