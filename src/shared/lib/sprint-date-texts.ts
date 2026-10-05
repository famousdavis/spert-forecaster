// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Every user-facing sentence about a bad stored sprint date, in one module, so
// Sprint History, the Forecast tab and the AI snapshot cannot drift apart.
//
// Values come from data. Valid dates are spelled out; refused ones are quoted
// raw, never formatted: formatting a refused value prints "Invalid Date NaN" in
// one engine and a plausible false date in another.

import { formatDateLong, isValidIsoDate, MAX_ISO_DATE, type InvalidSprintDate, type ResolvedDateSpill } from './dates'
import type { ForecastDateBlock } from './forecast-derivations'

const MAX_LONG = formatDateLong(MAX_ISO_DATE) // "December 31, 9999"
const LIMIT = 'the latest date this app accepts'
export const OTHERWISE_OWNER = 'Otherwise, ask its owner to fix it.'

export const quoted = (value: unknown): string => `"${String(value)}"`
export const spell = (date: string): string => (isValidIsoDate(date) ? formatDateLong(date) : quoted(date))

/** "a" · "a and b" · "a, b and c" */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
export const listNumbers = (numbers: number[]): string => joinAnd(numbers.map(String))

/** Exactly these sprints: a run as a range, runs joined with "and" — "4–6", "3 and 5–6". */
export function sprintSet(numbers: number[]): string {
  const runs: Array<[number, number]> = []
  for (const n of numbers) {
    const run = runs[runs.length - 1]
    if (run && n === run[1] + 1) run[1] = n
    else runs.push([n, n])
  }
  return joinAnd(runs.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)))
}

const sprintsNamed = (numbers: number[]): string =>
  numbers.length === 1 ? `sprint ${numbers[0]}` : `sprints ${listNumbers(numbers)}`

// ── One sprint's stored problems ─────────────────────────────────────────────

export interface SprintProblem {
  sprintNumber: number
  /** The custom finish date is refused: the user must choose a date, or Reset. */
  customValue?: unknown
  /** Saved fields the forecast never reads: Update re-saves the dates shown. */
  savedStart?: unknown
  savedFinish?: unknown
}

/** One entry per sprint, however many of its fields are refused ("one" vs "several" counts sprints). */
export function groupBySprint(invalid: InvalidSprintDate[]): SprintProblem[] {
  const bySprint = new Map<number, SprintProblem>()
  for (const d of invalid) {
    const p = bySprint.get(d.sprintNumber) ?? { sprintNumber: d.sprintNumber }
    if (d.field === 'customFinishDate') p.customValue = d.value
    else if (d.field === 'sprintStartDate') p.savedStart = d.value
    else p.savedFinish = d.value
    bySprint.set(d.sprintNumber, p)
  }
  return [...bySprint.values()].sort((a, b) => a.sprintNumber - b.sprintNumber)
}

/** What is wrong with one sprint's saved dates: the row marker, and the notice's lines. */
export function rowProblemText(p: SprintProblem): string {
  if (p.customValue !== undefined) return `finish date ${quoted(p.customValue)} isn't a valid date`
  if (p.savedStart !== undefined && p.savedFinish !== undefined) {
    return `saved start date ${quoted(p.savedStart)} and finish date ${quoted(p.savedFinish)} aren't valid dates`
  }
  return p.savedStart !== undefined
    ? `saved start date ${quoted(p.savedStart)} isn't a valid date`
    : `saved finish date ${quoted(p.savedFinish)} isn't a valid date`
}

/** The row marker for a resolved date past MAX_ISO_DATE. */
export const PAST_MAX_TEXT = `past ${MAX_LONG}`

// ── Year 9999: the spill ─────────────────────────────────────────────────────

/** "sprint 3 finishes on December 31, 9999" · "sprints 2 and 3 finish on …" · "sprint 2 finishes on X and sprint 3 on Y" */
export function causesClause(causes: ResolvedDateSpill['causes']): string {
  if (causes.length === 1) return `sprint ${causes[0].sprintNumber} finishes on ${spell(causes[0].finishDate)}`
  if (causes.every((c) => c.finishDate === causes[0].finishDate)) {
    return `sprints ${listNumbers(causes.map((c) => c.sprintNumber))} finish on ${spell(causes[0].finishDate)}`
  }
  return joinAnd(causes.map((c, i) => `sprint ${c.sprintNumber} ${i === 0 ? 'finishes ' : ''}on ${spell(c.finishDate)}`))
}

/** Exactly the spilled sprints, or the sprint after the last when only the forecast start spills. */
function spillSubject(spill: ResolvedDateSpill, lastSprintNumber: number): string {
  const ns = spill.spilledSprints
  if (ns.length === 0) return `The sprint after sprint ${lastSprintNumber} would start after ${MAX_LONG}`
  return `${ns.length === 1 ? `Sprint ${ns[0]}` : `Sprints ${sprintSet(ns)}`} would run past ${MAX_LONG}`
}

/**
 * The approved wording for a spill in which a cause is itself a spilled sprint
 * (the stuck shape): sprint X starts past the limit because the cause before it
 * finishes on December 31, 9999, and X finishes on that date too, so the sprint
 * after X would start past it as well.
 *
 * Used only where every fact it states holds: exactly two causes, the second
 * being X, the first spilled sprint (a spilled cause always finishes on
 * December 31, 9999: no other date's next business day is past it); the first
 * finishing on December 31, 9999; and nothing spilled beyond the sprint after
 * X. Any other shape keeps the general form.
 */
function spilledCauseSentence(spill: ResolvedDateSpill): string | null {
  const [before, x] = spill.causes
  if (spill.causes.length !== 2 || x.sprintNumber !== spill.sprintNumber) return null
  if (before.finishDate !== MAX_ISO_DATE || spill.spilledSprints.length > 2) return null
  return `Sprint ${x.sprintNumber} would start after ${MAX_LONG}, ${LIMIT}, because sprint ${before.sprintNumber} finishes on that date, and the sprint after it would too, because sprint ${x.sprintNumber} does.`
}

export function spillSentence(spill: ResolvedDateSpill, lastSprintNumber: number, firstSprintStartDate: string): string {
  const stuck = spilledCauseSentence(spill)
  if (stuck) return stuck
  const because = spill.causes.length > 0 ? causesClause(spill.causes) : `the first sprint starts on ${spell(firstSprintStartDate)}`
  return `${spillSubject(spill, lastSprintNumber)}, ${LIMIT}, because ${because}.`
}

export function spillFix(spill: ResolvedDateSpill): string {
  if (spill.causes.length === 0) {
    return `If you can edit this project, delete its sprints (latest first), then choose an earlier first sprint start date in Sprint Configuration above: it can be changed only while the project has no sprints. ${OTHERWISE_OWNER}`
  }
  const ns = spill.causes.map((c) => c.sprintNumber)
  return `If you can edit this project, choose an earlier finish date for ${sprintsNamed(ns)} (Edit sprint at the end of ${ns.length === 1 ? 'its row' : 'each row'}). ${OTHERWISE_OWNER}`
}

// ── Sprint History's notice ──────────────────────────────────────────────────

export interface NoticeContext {
  scheduleUsable: boolean
  firstDateRefused: boolean
  /** A sprint's standard (computed) finish, when the schedule can work it out. */
  standardFinish: (sprintNumber: number) => string | undefined
  /** Whether a sprint's own resolved start or finish is past the limit: it lies inside a spill. */
  ownDatesPastMax: (sprintNumber: number) => boolean
  spill: ResolvedDateSpill | null
}

/** Inside a spill a sprint cannot be saved until earlier dates move: name them first. */
function firstStep(sprintNumber: number, spill: ResolvedDateSpill | null): string {
  const before = (spill?.causes ?? []).filter((c) => c.sprintNumber < sprintNumber).map((c) => c.sprintNumber)
  if (before.length === 0) return 'first correct the schedule (see below)'
  return before.length === 1
    ? `first make sprint ${before[0]}'s finish date earlier`
    : `first make the finish dates of sprints ${listNumbers(before)} earlier`
}

/** The fix for one sprint, in schedule mode. */
function fixClause(p: SprintProblem, ctx: NoticeContext): string {
  const action = p.customValue !== undefined ? 'choose the right date or click Reset' : 'click Update'
  if (ctx.ownDatesPastMax(p.sprintNumber)) {
    return `${firstStep(p.sprintNumber, ctx.spill)}, then open sprint ${p.sprintNumber} and ${action}`
  }
  return p.customValue !== undefined ? action : 'click Update to save the dates shown'
}

function forecastLine(problems: SprintProblem[]): string[] {
  const ns = problems.filter((p) => p.customValue !== undefined).map((p) => p.sprintNumber)
  if (ns.length === 0) return []
  return [ns.length === 1
    ? `Until sprint ${ns[0]}'s finish date is fixed, this project can't be forecast.`
    : `Until the finish dates of sprints ${listNumbers(ns)} are fixed, this project can't be forecast.`]
}

function noScheduleLines(ctx: NoticeContext, count: number): string[] {
  if (ctx.firstDateRefused) return [`${count === 1 ? 'It' : 'They'} can be corrected once the first sprint start date is valid.`]
  return [
    "Sprint dates can't be worked out or edited until this project has a sprint cadence and a valid first sprint start date.",
    `If you can edit this project, set them in Sprint Configuration above; they can be changed only while the project has no sprints (delete them, latest first). ${OTHERWISE_OWNER}`,
  ]
}

function oneSprintNotice(p: SprintProblem, ctx: NoticeContext): string[] {
  const heading = `Sprint ${p.sprintNumber}'s ${rowProblemText(p)}.`
  if (!ctx.scheduleUsable) return [heading, ...noScheduleLines(ctx, 1)]
  const inside = ctx.ownDatesPastMax(p.sprintNumber)
  const standard = ctx.standardFinish(p.sprintNumber)
  // Inside a spill the standard date is itself past the limit, so it is not offered.
  const state = p.customValue === undefined
    ? ["The app doesn't use the saved value."]
    : !inside && standard
      ? [`Until it's fixed, sprint ${p.sprintNumber} counts as ending on its standard date, ${spell(standard)}, and this project can't be forecast.`]
      : []
  const where = inside ? '' : `click Edit sprint at the end of sprint ${p.sprintNumber}'s row, then `
  return [heading, ...state, `If you can edit this project, ${where}${fixClause(p, ctx)}. ${OTHERWISE_OWNER}`]
}

/** Sprint History's stored-date block: heading first, then lines. */
export function storedDatesNotice(problems: SprintProblem[], ctx: NoticeContext): string[] | null {
  if (problems.length === 0) return null
  if (problems.length === 1) return oneSprintNotice(problems[0], ctx)
  const heading = "Some sprint dates aren't valid dates."
  if (!ctx.scheduleUsable) {
    return [heading, ...problems.map((p) => `Sprint ${p.sprintNumber} — ${rowProblemText(p)}.`), ...noScheduleLines(ctx, problems.length)]
  }
  return [
    heading,
    ...forecastLine(problems),
    ...problems.map((p) => `Sprint ${p.sprintNumber} — ${rowProblemText(p)}: ${fixClause(p, ctx)}.`),
    `If you can edit this project, use Edit sprint at the end of each row. ${OTHERWISE_OWNER}`,
  ]
}

/** Sprint History's first-date block (D14). */
export function firstDateNotice(value: unknown, hasSprints: boolean): string[] {
  const heading = `This project's first sprint start date, ${quoted(value)}, isn't a valid date.`
  if (!hasSprints) return [heading, `If you can edit this project, choose a valid date in Sprint Configuration above. ${OTHERWISE_OWNER}`]
  return [
    heading,
    "Until it's corrected, sprint dates can't be worked out, sprints can't be added or edited, and this project can't be forecast.",
    `If you can edit this project, it can be changed in Sprint Configuration above only while the project has no sprints (delete them, latest first). ${OTHERWISE_OWNER}`,
  ]
}

export const ADD_TITLE_FIRST_DATE = "The first sprint start date isn't a valid date"

// ── The Edit / Add form (schedule mode only) ─────────────────────────────────

export function formSavedCustomNote(savedCustom: unknown, standardFinish: string): string {
  return `The saved finish date, ${quoted(savedCustom)}, isn't a valid date. Choose a date, or click Reset to use the standard date, ${spell(standardFinish)}.`
}

export function formSavedFieldsNote(savedStart: unknown, savedFinish: unknown): string {
  const what = savedStart !== undefined && savedFinish !== undefined
    ? `saved start date, ${quoted(savedStart)}, and finish date, ${quoted(savedFinish)}, aren't valid dates`
    : savedStart !== undefined
      ? `saved start date, ${quoted(savedStart)}, isn't a valid date`
      : `saved finish date, ${quoted(savedFinish)}, isn't a valid date`
  return `This sprint's ${what}. Click Update to save the dates shown above.`
}

export function formAssumptionNote(sprintNumber: number, standardFinish: string): string {
  return `These dates assume sprint ${sprintNumber} ended on its standard date, ${spell(standardFinish)}, because its saved finish date isn't valid.`
}

/** This sprint's own dates fall past the limit because of earlier dates: name what causes it. */
export function formInsideSpillNote(sprintNumber: number, causesBefore: ResolvedDateSpill['causes'], firstSprintStartDate: string): string {
  const head = `Sprint ${sprintNumber} would run past ${MAX_LONG}, ${LIMIT}, because`
  if (causesBefore.length === 0) {
    return `${head} the first sprint starts on ${spell(firstSprintStartDate)}. The note at the top of this tab says how to correct the schedule.`
  }
  const ns = causesBefore.map((c) => c.sprintNumber)
  const which = ns.length === 1 ? `sprint ${ns[0]} and choose an earlier finish date` : `sprints ${listNumbers(ns)} and choose earlier finish dates`
  return `${head} ${causesClause(causesBefore)}. Edit ${which} first.`
}

/** The edit or add would cause a spill, or move it earlier (D16). */
export function formCausesSpillNote(spill: ResolvedDateSpill, lastSprintNumber: number): string {
  const ns = spill.spilledSprints
  const who = ns.length === 0
    ? `the sprint after sprint ${lastSprintNumber} would start after ${MAX_LONG}`
    : `${ns.length === 1 ? `sprint ${ns[0]}` : `sprints ${sprintSet(ns)}`} would run past ${MAX_LONG}`
  return `With that finish date, ${who}, ${LIMIT}. Choose an earlier date.`
}

// ── The Forecast tab ─────────────────────────────────────────────────────────

/** Under the Run Forecast button: short, role-neutral. */
export function forecastBlockedReason(block: ForecastDateBlock): string {
  if (block.kind === 'first-date') return "The first sprint start date isn't a valid date."
  if (block.kind === 'past-max') {
    const ns = block.spill.causes.map((c) => c.sprintNumber)
    if (ns.length === 0) return 'The sprint schedule runs past the year 9999.'
    return ns.length === 1 ? `Sprint ${ns[0]}'s finish date needs to be earlier first.` : `Sprints ${listNumbers(ns)} need earlier finish dates first.`
  }
  const ns = block.sprints.map((s) => s.sprintNumber)
  return ns.length === 1 ? `Sprint ${ns[0]}'s finish date needs fixing first.` : `Sprints ${listNumbers(ns)} need their finish dates fixed first.`
}

/** The Forecast tab's notice in place of results: [notice, fix line]. */
export function forecastBlockedNotice(block: ForecastDateBlock, lastSprintNumber: number): [string, string] {
  if (block.kind === 'first-date') {
    return [
      `This project can't be forecast because its first sprint start date, ${quoted(block.value)}, isn't a valid date, so its sprint dates can't be worked out.`,
      `If you can edit this project, the Sprint History tab says how to correct it. ${OTHERWISE_OWNER}`,
    ]
  }
  if (block.kind === 'past-max') {
    const ns = block.spill.causes.map((c) => c.sprintNumber)
    const fix = ns.length === 0
      ? `If you can edit this project, the Sprint History tab says how to correct the schedule. ${OTHERWISE_OWNER}`
      : `If you can edit this project, choose an earlier finish date for ${sprintsNamed(ns)} on the Sprint History tab. ${OTHERWISE_OWNER}`
    return [`This project can't be forecast. ${spillSentence(block.spill, lastSprintNumber, block.firstSprintStartDate)}`, fix]
  }
  if (block.sprints.length === 1) {
    const s = block.sprints[0]
    return [
      `This project can't be forecast until sprint ${s.sprintNumber}'s finish date is fixed. It's saved as ${quoted(s.value)}, which isn't a valid date.`,
      `If you can edit this project, fix it on the Sprint History tab. ${OTHERWISE_OWNER}`,
    ]
  }
  return [
    `This project can't be forecast until the finish dates of sprints ${listNumbers(block.sprints.map((s) => s.sprintNumber))} are fixed. They're saved as ${joinAnd(block.sprints.map((s) => quoted(s.value)))}, which aren't valid dates.`,
    `If you can edit this project, fix them on the Sprint History tab. ${OTHERWISE_OWNER}`,
  ]
}

// ── The AI snapshot (D13) ────────────────────────────────────────────────────

export function aiBlockedStatusReason(block: ForecastDateBlock, lastSprintNumber: number): string {
  const tail = ' No forecast results are carried while this lasts, even if an earlier forecast exists.'
  if (block.kind === 'first-date') {
    return `The project's first sprint start date, ${quoted(block.value)}, isn't a valid date, so its sprint dates can't be worked out and it can't be forecast.${tail}`
  }
  if (block.kind === 'past-max') {
    const ns = block.spill.causes.map((c) => c.sprintNumber)
    const until = ns.length === 0
      ? 'its first sprint start date is moved earlier, which the app allows only while the project has no sprints'
      : `the user chooses an earlier finish date for ${sprintsNamed(ns)} on the Sprint History tab`
    return `${spillSentence(block.spill, lastSprintNumber, block.firstSprintStartDate)} The project can't be forecast until ${until}.${tail}`
  }
  const ns = block.sprints.map((s) => s.sprintNumber)
  const what = ns.length === 1
    ? `Sprint ${ns[0]}'s saved finish date, ${quoted(block.sprints[0].value)}, isn't a valid date`
    : `The saved finish dates of sprints ${listNumbers(ns)} (${block.sprints.map((s) => quoted(s.value)).join(', ')}) aren't valid dates`
  return `${what}, so the project can't be forecast until the user fixes ${ns.length === 1 ? 'it' : 'them'} on the Sprint History tab, or asks the project's owner to.${tail}`
}
