// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The validator's refusals, in the user's words.
//
// `validateImportData` throws ONE message, written for developers: it names an
// array position ("Project at index 3 …", "… found at index 7.") and a field
// key. Its text cannot change — the Story Map contract register reads it. So
// this module translates instead: it matches the message against the
// validator's own templates, resolves the position to the project (and sprint)
// it points at in the payload, and builds a reason from that item's data.
//
// ⚠️ ONE ENTRY PER THROW, IN SOURCE ORDER. refusal-reasons.test.ts extracts the
// throw templates from import-validation.ts and requires set equality in BOTH
// directions, so a new throw without an entry — or an entry whose throw is gone
// — fails a named test.
//
// Reasons carry no position and no trailing period. Every limit a reason
// quotes comes from its constant. Throws no screen of this app can trip get a
// reason without numbers, rather than new constants for bounds nobody reaches.

import { MAX_STRING_LENGTH, MAX_NUMERIC_VALUE, MILESTONE_CEILING } from './import-limits'

type Obj = Record<string, unknown>

/** Where a refusal points: one project (or something inside it), or the file as a whole. */
export type RefusalScope = 'project' | 'milestone' | 'sprint' | 'file'

export interface ExplainedRefusal {
  scope: RefusalScope
  /** The project the refusal belongs to, when it has one with a name. */
  projectName?: string
  /** The sprint's own number, for a sprint refusal, when that number is a positive integer. */
  sprintNumber?: number
  /** The user's words: no position, no trailing period. */
  reason: string
}

interface Ctx {
  holes: Record<string, string>
  project?: Obj
  milestone?: Obj
  sprint?: Obj
}

interface Entry {
  template: string
  scope: RefusalScope
  reason: (ctx: Ctx) => string
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (n: number): string => n.toLocaleString('en-US')
const quoted = (v: unknown): string => `"${String(v)}"`
const lengthOf = (v: unknown): number => (typeof v === 'string' ? v.length : 0)

/** Longest a name is shown before it is cut, with an ellipsis. */
export const NAME_DISPLAY_LENGTH = 80

export function displayName(name: string): string {
  return name.length > NAME_DISPLAY_LENGTH ? `${name.slice(0, NAME_DISPLAY_LENGTH)}…` : name
}

const milestoneLabel = (c: Ctx): string =>
  typeof c.milestone?.name === 'string' && c.milestone.name ? ` ${quoted(displayName(c.milestone.name))}` : ''

/** A figure over the maximum is quoted; anything else that failed was not a usable number. */
function figure(label: string, v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v) && v > MAX_NUMERIC_VALUE) {
    return `${label} is ${num(v)}; the most allowed is ${num(MAX_NUMERIC_VALUE)}`
  }
  return `${label} is not a number from 0 to ${num(MAX_NUMERIC_VALUE)}`
}

function milestoneCount(c: Ctx): string {
  const count = Array.isArray(c.project?.milestones) ? c.project.milestones.length : 0
  const limit = Number(c.holes.limit)
  return limit === MILESTONE_CEILING
    ? `${num(count)} milestones; a file from this app holds at most ${num(limit)}`
    : `${num(count)} milestones; this file can hold at most ${num(limit)} per project`
}

const ENTRIES: readonly Entry[] = [
  { template: 'Import data must be a JSON object.', scope: 'file', reason: () => 'the file is not a JSON object' },
  { template: 'Import data is missing a valid "projects" array.', scope: 'file', reason: () => 'the file has no list of projects' },
  { template: 'Import data is missing a valid "sprints" array.', scope: 'file', reason: () => 'the file has no list of sprints' },
  { template: 'Project at index ${i} is not a valid object.', scope: 'file', reason: () => 'a project entry is not valid' },
  { template: 'Project at index ${i} is missing a valid "id".', scope: 'project', reason: () => 'Project ID is missing' },
  { template: 'Duplicate project ID "${p.id}" found at index ${i}.', scope: 'file', reason: (c) => `two projects share the ID ${quoted(c.holes['p.id'])}` },
  { template: 'Project at index ${i} is missing a valid "name".', scope: 'project', reason: () => 'Project name is missing' },
  { template: 'Project at index ${i} has a name exceeding ${MAX_STRING_LENGTH} characters.', scope: 'project', reason: (c) => `Project name is ${num(lengthOf(c.project?.name))} characters; the most allowed is ${num(MAX_STRING_LENGTH)}` },
  { template: 'Project at index ${i} is missing a valid "unitOfMeasure".', scope: 'project', reason: () => 'Unit of measure is missing' },
  { template: 'Project at index ${i} has a unitOfMeasure exceeding ${MAX_STRING_LENGTH} characters.', scope: 'project', reason: (c) => `Unit of measure is ${num(lengthOf(c.project?.unitOfMeasure))} characters; the most allowed is ${num(MAX_STRING_LENGTH)}` },
  { template: 'Project at index ${i} has invalid sprintCadenceWeeks (must be 1-52).', scope: 'project', reason: () => 'Sprint cadence is outside the allowed range' },
  { template: 'Project at index ${i} has invalid firstSprintStartDate (must be YYYY-MM-DD format).', scope: 'project', reason: (c) => `First sprint start date ${quoted(c.project?.firstSprintStartDate)} is not a valid date` },
  { template: 'Project at index ${i} has invalid "milestones" (must be an array).', scope: 'project', reason: () => 'Milestones are not a list' },
  { template: 'Project at index ${i} has more than ${limit} milestones.', scope: 'project', reason: milestoneCount },
  { template: 'Project ${i}, milestone at index ${j} is not a valid object.', scope: 'milestone', reason: () => 'A milestone entry is not valid' },
  { template: 'Project ${i}, milestone at index ${j} is missing a valid "id".', scope: 'milestone', reason: (c) => `Milestone${milestoneLabel(c)} has no ID` },
  { template: 'Project ${i}, duplicate milestone ID "${m.id}" at index ${j}.', scope: 'milestone', reason: (c) => `Two milestones share the ID ${quoted(c.holes['m.id'])}` },
  { template: 'Project ${i}, milestone at index ${j} is missing a valid "name".', scope: 'milestone', reason: () => 'A milestone has no name' },
  { template: 'Project ${i}, milestone at index ${j} has a name exceeding ${MAX_STRING_LENGTH} characters.', scope: 'milestone', reason: (c) => `Milestone name${milestoneLabel(c)} is ${num(lengthOf(c.milestone?.name))} characters; the most allowed is ${num(MAX_STRING_LENGTH)}` },
  { template: 'Project ${i}, milestone at index ${j} has invalid backlogSize (must be >= 0 and <= ${MAX_NUMERIC_VALUE}).', scope: 'milestone', reason: (c) => figure(`Remaining Work for milestone${milestoneLabel(c)}`, c.milestone?.backlogSize) },
  { template: 'Project ${i}, milestone at index ${j} is missing a valid "color".', scope: 'milestone', reason: (c) => `Milestone${milestoneLabel(c)} has no color` },
  { template: 'Project ${i}, milestone at index ${j} has invalid "showOnChart" (must be a boolean).', scope: 'milestone', reason: (c) => `Milestone${milestoneLabel(c)} has an invalid show-on-chart setting` },
  { template: 'Sprint at index ${i} is not a valid object.', scope: 'file', reason: () => 'a sprint entry is not valid' },
  { template: 'Sprint at index ${i} is missing a valid "id".', scope: 'sprint', reason: () => 'Sprint ID is missing' },
  { template: 'Duplicate sprint ID "${s.id}" found at index ${i}.', scope: 'file', reason: (c) => `two sprints share the ID ${quoted(c.holes['s.id'])}` },
  { template: 'Sprint at index ${i} is missing a valid "projectId".', scope: 'file', reason: () => 'a sprint does not say which project it belongs to' },
  { template: 'Sprint at index ${i} has invalid sprintNumber (must be ${MIN_SPRINT_NUMBER}-${MAX_SPRINT_NUMBER}).', scope: 'sprint', reason: () => 'Sprint number is outside the allowed range' },
  { template: 'Sprint at index ${i} has non-integer sprintNumber.', scope: 'sprint', reason: () => 'Sprint number is not a whole number' },
  { template: 'Sprint at index ${i} has invalid doneValue (must be 0-${MAX_NUMERIC_VALUE}).', scope: 'sprint', reason: (c) => figure('Done this sprint', c.sprint?.doneValue) },
  { template: 'Sprint at index ${i} has invalid backlogAtSprintEnd (must be 0-${MAX_NUMERIC_VALUE}).', scope: 'sprint', reason: (c) => figure('Backlog at End', c.sprint?.backlogAtSprintEnd) },
  { template: 'Sprint at index ${i} has invalid sprintStartDate (must be YYYY-MM-DD format).', scope: 'sprint', reason: (c) => `Start date ${quoted(c.sprint?.sprintStartDate)} is not a valid date` },
  { template: 'Sprint at index ${i} has invalid sprintFinishDate (must be YYYY-MM-DD format).', scope: 'sprint', reason: (c) => `Finish Date ${quoted(c.sprint?.sprintFinishDate)} is not a valid date` },
  { template: 'Sprint at index ${i} has invalid customFinishDate (must be YYYY-MM-DD format).', scope: 'sprint', reason: (c) => `Finish Date ${quoted(c.sprint?.customFinishDate)} is not a valid date` },
]

/** Every template this module translates — read by the completeness test. */
export const REFUSAL_TEMPLATES: readonly string[] = ENTRIES.map((e) => e.template)

interface Matcher { entry: Entry; pattern: RegExp; holes: string[] }

/** A template's `${…}` holes become lazy capture groups; the rest must match verbatim. */
function compile(entry: Entry): Matcher {
  const holes: string[] = []
  const parts = entry.template.split(/\$\{([^}]*)\}/)
  let source = '^'
  parts.forEach((part, k) => {
    if (k % 2 === 1) {
      holes.push(part)
      source += '(.+?)'
    } else {
      source += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  })
  return { entry, pattern: new RegExp(`${source}$`), holes }
}

const MATCHERS: readonly Matcher[] = ENTRIES.map(compile)

function locate(entry: Entry, holes: Record<string, string>, payload: unknown): Ctx {
  const d = isObj(payload) ? payload : {}
  const projects = Array.isArray(d.projects) ? d.projects : []
  const sprints = Array.isArray(d.sprints) ? d.sprints : []
  const at = (list: unknown[], key: string): Obj | undefined => {
    const v = list[Number(holes[key])]
    return isObj(v) ? v : undefined
  }
  if (entry.scope === 'sprint') {
    const sprint = at(sprints, 'i')
    const project = projects.find((p) => isObj(p) && p.id === sprint?.projectId)
    return { holes, sprint, project: isObj(project) ? project : undefined }
  }
  if (entry.scope === 'file') return { holes }
  const project = at(projects, 'i')
  const milestones = Array.isArray(project?.milestones) ? project.milestones : []
  return { holes, project, milestone: entry.scope === 'milestone' ? at(milestones, 'j') : undefined }
}

/**
 * Translate one validator message against the payload it was thrown for.
 * Returns null for a message that is not one of the validator's.
 */
export function explainRefusal(message: string, payload: unknown): ExplainedRefusal | null {
  for (const { entry, pattern, holes } of MATCHERS) {
    const m = pattern.exec(message)
    if (!m) continue
    const named = Object.fromEntries(holes.map((h, k) => [h, m[k + 1]]))
    const ctx = locate(entry, named, payload)
    const name = ctx.project?.name
    const sprintNumber = ctx.sprint?.sprintNumber
    return {
      scope: entry.scope,
      projectName: entry.scope !== 'file' && typeof name === 'string' && name ? name : undefined,
      sprintNumber: typeof sprintNumber === 'number' && Number.isInteger(sprintNumber) && sprintNumber > 0 ? sprintNumber : undefined,
      reason: entry.reason(ctx),
    }
  }
  return null
}

/**
 * The import path's refusal, naming the project the thrown error belongs to —
 * `projects[i]` for a project refusal, the project of `sprints[i].projectId`
 * for a sprint refusal. Never the first failing project: the validator checks
 * every project before any sprint. A refusal with no named project to point at
 * keeps the validator's own text.
 */
export function describeImportRefusal(message: string, payload: unknown): string {
  const x = explainRefusal(message, payload)
  if (!x || x.projectName === undefined) return `Import failed: ${message}`
  const where = x.sprintNumber === undefined
    ? quoted(displayName(x.projectName))
    : `${quoted(displayName(x.projectName))}, sprint ${x.sprintNumber}`
  return `Import failed: ${where} — ${x.reason}.`
}
