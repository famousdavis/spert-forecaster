// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Will the file this app just SAVED import again? Every JSON export asks, and
// warns when the answer is no — after saving, never instead of it.
//
// The verdict is `validateImportData` on the exact string written to disk, and
// that string's byte size against MAX_FILE_SIZE: the two checks an import runs.
//
// ⚠️ THE VALIDATOR STOPS AT ITS FIRST ERROR. To name EVERY failing project, each
// project is validated alone, with its own sprints, inside a copy of the file's
// OWN envelope. The envelope matters: it carries `_exportType` or the workspace
// reconciliation tokens, which decide the file's milestone limit. A partition
// built without it falls to the Story Map limit and reports a valid
// 13-milestone project as failing.
//
// Then a RESIDUAL pass: the envelope minus every failing project and its
// sprints, keeping any orphan sprints. If that fails too, the failure belongs to
// no single project — two projects sharing a sprint id, say — and is reported
// against the file as a whole. So the warning always has an item when the
// verdict fails.

import { validateImportData } from './import-validation'
import { MAX_FILE_SIZE } from './import-limits'
import { explainRefusal } from './refusal-reasons'

type Obj = Record<string, unknown>

export type ExportCheckItem =
  | {
      kind: 'project'
      name: string
      /** The failing sprint's own number, for a sprint-level refusal. */
      sprintNumber?: number
      reason: string
      /** Set only when another failing project carries the same name. */
      sprintCount?: number
    }
  | { kind: 'file'; reason: string }

export type ExportCheckResult = { ok: true } | { ok: false; items: ExportCheckItem[] }

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const capitalised = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The validator's message, or null when it accepts. Validates a COPY — the validator rewrites its input. */
function firstRefusal(payload: Obj): string | null {
  try {
    validateImportData(structuredClone(payload))
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function fileItem(message: string, payload: Obj): ExportCheckItem {
  return { kind: 'file', reason: explainRefusal(message, payload)?.reason ?? message }
}

const MB = 1024 * 1024
const megabytes = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

function sizeItem(bytes: number): ExportCheckItem {
  // The file's size rounds UP, so a file just over the limit never reads as equal to it.
  const size = megabytes(Math.ceil((bytes / MB) * 10) / 10)
  return { kind: 'file', reason: `the file is ${size} MB; an import accepts at most ${megabytes(MAX_FILE_SIZE / MB)} MB` }
}

/** One project, its own sprints, the file's own envelope. */
function partitionOf(envelope: Obj, project: Obj, sprints: unknown[]): Obj {
  return { ...envelope, projects: [project], sprints: sprints.filter((s) => isObj(s) && s.projectId === project.id) }
}

function projectItem(project: Obj, message: string, partition: Obj): ExportCheckItem {
  const x = explainRefusal(message, partition)
  return {
    kind: 'project',
    name: typeof project.name === 'string' && project.name ? project.name : '(unnamed project)',
    sprintNumber: x?.sprintNumber,
    reason: capitalised(x?.reason ?? message),
  }
}

/** Two failing projects with one name get their sprint counts, so the list tells them apart. */
function disambiguate(items: ExportCheckItem[], sprintCounts: Map<ExportCheckItem, number>): ExportCheckItem[] {
  const seen = new Map<string, number>()
  for (const item of items) if (item.kind === 'project') seen.set(item.name, (seen.get(item.name) ?? 0) + 1)
  return items.map((item) =>
    item.kind === 'project' && (seen.get(item.name) ?? 0) > 1 ? { ...item, sprintCount: sprintCounts.get(item) ?? 0 } : item)
}

function attribute(file: Obj, verdict: string): ExportCheckItem[] {
  const { projects, sprints } = file
  if (!Array.isArray(projects) || !Array.isArray(sprints)) return [fileItem(verdict, file)]
  const envelope: Obj = { ...file, projects: [], sprints: [] }
  const items: ExportCheckItem[] = []
  const sprintCounts = new Map<ExportCheckItem, number>()
  const failing = new Set<unknown>()
  for (const project of projects) {
    if (!isObj(project)) continue // the residual reports it
    const partition = partitionOf(envelope, project, sprints)
    const message = firstRefusal(partition)
    if (message === null) continue
    const item = projectItem(project, message, partition)
    sprintCounts.set(item, (partition.sprints as unknown[]).length)
    items.push(item)
    failing.add(project.id)
  }
  const residual: Obj = {
    ...envelope,
    projects: projects.filter((p) => !(isObj(p) && failing.has(p.id))),
    sprints: sprints.filter((s) => !(isObj(s) && failing.has(s.projectId))),
  }
  const leftover = firstRefusal(residual)
  if (leftover !== null) items.push(fileItem(leftover, residual))
  return disambiguate(items, sprintCounts)
}

/**
 * Judge the exact string an export saved. Pure: it reads nothing but `json`.
 * Throws only on a string that is not JSON — the caller saved it, so it is.
 */
export function checkExportedFile(json: string): ExportCheckResult {
  const file = JSON.parse(json) as Obj
  const verdict = firstRefusal(file)
  const items = verdict === null ? [] : attribute(file, verdict)
  const bytes = new Blob([json]).size
  if (bytes > MAX_FILE_SIZE) items.push(sizeItem(bytes))
  return items.length === 0 ? { ok: true } : { ok: false, items }
}
