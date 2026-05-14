// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Project, Sprint } from '@/shared/types'
import type { ExportData } from './import-validation'

// Must match the private MAX_STRING_LENGTH in import-validation.ts. Defined
// locally to avoid exposing it from that module.
const MAX_STRING_LENGTH = 200

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

export type ConflictAction = 'skip' | 'copy' | 'replace'

// --- Result types ---

export type ImportDecisionResult = {
  added: number
  skipped: number
  copied: number
  replaced: number
  // Keyed by EXISTING project ID → incoming project ID. ONLY populated for
  // name-conflict replaces (existingId ≠ winner.id).
  replacedIdMap: Map<string, string>
  // Set of ALL existing project IDs replaced (ID-conflict AND name-conflict).
  replacedExistingIds: Set<string>
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

// Known limitation: if incoming.id matches existing A AND incoming.name matches
// different existing B, only the ID conflict is surfaced. Planned: v0.31.0.
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

// --- applyImportDecisions ---
// Pure synchronous function — no I/O, no store mutation.
// In applySmartImport, this is called inside Zustand's set() updater against
// state.projects at write time. The `conflicts` argument must be the
// re-detected conflicts from that same call, not a pre-captured value.
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

  // PASS 1: Pre-compute winning replaces by slot. Iterate in ARRAY ORDER —
  // not decisions.entries() insertion order (pitfall #12).
  const winningReplaceBySlotId = new Map<string, Project>()
  let skipped = 0
  for (const p of incoming.projects) {
    if (resolvedOutcome(p.id) !== 'replace') continue
    const conflict = conflictByIncomingId.get(p.id)
    if (!conflict) continue
    const slotId = conflict.existingProject.id
    if (winningReplaceBySlotId.has(slotId)) {
      // Multiple incoming projects targeting the same slot — array-order winner
      // already chosen; downgrade subsequent ones to skip.
      skipped++
      continue
    }
    winningReplaceBySlotId.set(slotId, p)
  }

  // PASS 2: Slot substitution.
  const mergedProjects: Project[] = []
  const mergedSprints: Sprint[] = []
  const replacedExistingIds = new Set<string>()
  let replaced = 0
  const replacedIdMap = new Map<string, string>()
  for (const existingProject of existingProjects) {
    const winner = winningReplaceBySlotId.get(existingProject.id)
    if (winner) {
      mergedProjects.push(winner)
      replacedExistingIds.add(existingProject.id)
      if (conflictByIncomingId.get(winner.id)?.type === 'name') {
        replacedIdMap.set(existingProject.id, winner.id)
      }
      replaced++
    } else {
      mergedProjects.push(existingProject)
    }
  }
  for (const s of existingSprints) {
    if (!replacedExistingIds.has(s.projectId)) mergedSprints.push(s)
  }
  for (const [, winner] of winningReplaceBySlotId) {
    for (const s of incoming.sprints.filter((s) => s.projectId === winner.id)) {
      mergedSprints.push(s)
    }
  }

  // PASS 3a: Copies.
  const COPY_SUFFIX = ' (2)'
  let copied = 0
  for (const p of incoming.projects) {
    if (resolvedOutcome(p.id) !== 'copy') continue
    const ts = timestamp()
    const newId = generateId()
    const truncated = p.name.trimEnd().slice(0, MAX_STRING_LENGTH - COPY_SUFFIX.length)
    const copyProject: Project = {
      ...p,
      id: newId,
      name: truncated + COPY_SUFFIX,
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
    result: { added, skipped, copied, replaced, replacedIdMap, replacedExistingIds },
  }
}
