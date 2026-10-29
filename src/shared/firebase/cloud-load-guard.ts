// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What a project document read from the cloud must look like before it reaches
// the store (W4). Another user can write a project document that lists you as a
// member, and its shape is checked by nothing on the server, so every document
// passes through here on its way from `docSnap.data()` to the store.
//
// ⚠️ EVERY RULE BELOW ACCEPTS EVERYTHING THIS APP HAS EVER WRITTEN, and that is
// what makes setting a value aside safe. A set-aside value is not in the store,
// so the next save of that project does not carry it: the save repairs the
// document. That is acceptable only because no version since cloud storage
// (v0.21.0) could have written the value. Each rule names the writer that
// proves it. A rule tightened past the writers would delete real data at the
// next save. Widen the rule rather than the writers.
//
// ⚠️ THE LOAD NEVER WRITES. This module returns a copy; it never touches the
// document it was given, and nothing on the load path saves.
//
// Rules for values that only make a calculation slow or wrong are not here:
// those are bounded where the calculation runs (productivity.ts), which changes
// no data. What lives here is what would break the list or another project.

import type { FirestoreProjectDoc } from './types'
import { MAX_SPRINT_NUMBER } from '@/shared/state/import-validation'

/**
 * Why something in a document was set aside. Logged with the document id, and
 * never the value.
 */
export type CloudLoadRule =
  | 'project-not-an-object'
  | 'text-not-text'
  | 'cadence-out-of-range'
  | 'list-not-a-list'
  | 'item-not-an-object'
  | 'sprint-of-another-project'
  | 'sprint-number-out-of-range'
  | 'project-unreadable'

export interface GuardedProjectDoc {
  doc: FirestoreProjectDoc
  /** Every rule that set something aside, each once, in the order found. */
  setAside: CloudLoadRule[]
}

// The import's cadence rule (import-validation.ts, `must be 1-52`, since
// v0.12.0). The Sprint History select offers 1–4 (SPRINT_CADENCE_OPTIONS, since
// v0.1.0), so every cadence this app has written lies in this range.
export const MIN_CLOUD_CADENCE_WEEKS = 1
export const MAX_CLOUD_CADENCE_WEEKS = 52

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Rendered as text in the project list, outside any one project's view. The
// project form requires both, and the import requires both to be strings.
const TEXT_FIELDS = ['name', 'unitOfMeasure'] as const

// Always written as lists: projectToFirestoreDoc writes `|| []` for the two
// project lists and a filtered array for sprints, since v0.21.0.
const LIST_FIELDS = ['sprints', 'milestones', 'productivityAdjustments'] as const

const isCadence = (v: unknown): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= MIN_CLOUD_CADENCE_WEEKS && v <= MAX_CLOUD_CADENCE_WEEKS

/**
 * A sprint number this app can write: an integer from 1 to MAX_SPRINT_NUMBER.
 * The import refuses anything else (since v0.12.0), and Sprint History numbers
 * a new sprint `existingSprintCount + 1`, which a 1 MiB document cannot carry
 * past it. Beyond it, the forecast's sprint arithmetic stops making progress.
 */
const isSprintNumber = (v: unknown): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_SPRINT_NUMBER

/** A list's elements that are objects; anything else is set aside. */
function keepRecords(list: unknown[], note: (rule: CloudLoadRule) => void): Record<string, unknown>[] {
  const kept = list.filter(isRecord)
  if (kept.length < list.length) note('item-not-an-object')
  return kept
}

/**
 * A sprint belongs in the store only under the document it came from. The store
 * keeps every project's sprints in one array, keyed by `projectId`, so a sprint
 * naming another project would join that project, and the next save of THAT
 * project would write it there. projectToFirestoreDoc saves only a project's own
 * sprints (`s.projectId === project.id`, since v0.21.0), and the migration
 * rewrites projectId when it gives a project a new id (v0.42.1; before that it
 * dropped those sprints), so this app never wrote one.
 */
function keepOwnSprints(
  docId: string,
  sprints: Record<string, unknown>[],
  note: (rule: CloudLoadRule) => void
): Record<string, unknown>[] {
  const own = sprints.filter((s) => s.projectId === docId)
  if (own.length < sprints.length) note('sprint-of-another-project')
  const numbered = own.filter((s) => isSprintNumber(s.sprintNumber))
  if (numbered.length < own.length) note('sprint-number-out-of-range')
  return numbered
}

/**
 * Check one project document from the cloud. Returns a checked copy, and what
 * was set aside, or null when the document is not an object at all.
 */
export function guardCloudProjectDoc(docId: string, raw: unknown): GuardedProjectDoc | null {
  if (!isRecord(raw)) return null
  const setAside: CloudLoadRule[] = []
  const note = (rule: CloudLoadRule) => {
    if (!setAside.includes(rule)) setAside.push(rule)
  }
  const doc: Record<string, unknown> = { ...raw }

  for (const field of TEXT_FIELDS) {
    if (typeof doc[field] !== 'string') {
      doc[field] = ''
      note('text-not-text')
    }
  }

  if (doc.sprintCadenceWeeks !== undefined && !isCadence(doc.sprintCadenceWeeks)) {
    delete doc.sprintCadenceWeeks
    note('cadence-out-of-range')
  }

  for (const field of LIST_FIELDS) {
    const value = doc[field]
    // Absent or null: the converters already read either as an empty list.
    if (value === undefined || value === null) continue
    if (!Array.isArray(value)) {
      doc[field] = []
      note('list-not-a-list')
      continue
    }
    doc[field] = keepRecords(value, note)
  }

  if (Array.isArray(doc.sprints)) {
    doc.sprints = keepOwnSprints(docId, doc.sprints as Record<string, unknown>[], note)
  }

  return { doc: doc as unknown as FirestoreProjectDoc, setAside }
}
