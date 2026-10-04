// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// SprintForm's date logic, outside the component so the component stays simple
// and the logic is testable: the dates the form shows and saves, and what the
// form must say about them.

import type { Project, Sprint } from '@/shared/types'
import {
  calculateSprintFinishDate,
  findInvalidSprintDates,
  findResolvedDateSpill,
  formatDateRange,
  getNextBusinessDay,
  isValidIsoDate,
  resolveAllSprintDates,
  resolveAnchorDate,
  spillRank,
  type ResolvedDateSpill,
  type ResolvedSprintDates,
} from '@/shared/lib/dates'
import {
  formAssumptionNote,
  formCausesSpillNote,
  formInsideSpillNote,
  formSavedCustomNote,
  formSavedFieldsNote,
  groupBySprint,
} from '@/shared/lib/sprint-date-texts'
import { hasDateProblem, sprintRowDateText } from './sprint-date-display'

const NO_SCHEDULE: SprintFormDates = {
  sprintStartDate: '',
  computedFinishDate: '',
  dateLabel: 'Set sprint configuration above to calculate dates',
  assumedFrom: null,
}

export interface SprintFormDates {
  sprintStartDate: string
  computedFinishDate: string
  dateLabel: string
  /** Add only: the last sprint's saved custom date is refused, so these dates follow its standard finish. */
  assumedFrom: { sprintNumber: number; finishDate: string } | null
}

type DateInput = { sprintNumber: number; customFinishDate?: string }
const toInputs = (sprints: Sprint[]): DateInput[] =>
  sprints.map((s) => ({ sprintNumber: s.sprintNumber, customFinishDate: s.customFinishDate }))

/**
 * The label never formats a refused or past-limit date: it then reads as the
 * row does in Sprint History. On valid data it is unchanged.
 */
function label(
  sprintNumber: number,
  shown: { sprintStartDate: string; sprintFinishDate: string },
  resolved: ResolvedSprintDates,
  sprint: Sprint | null
): string {
  const problem = sprint ? groupBySprint(findInvalidSprintDates([sprint]))[0] : undefined
  const text = hasDateProblem(shown.sprintStartDate, shown.sprintFinishDate)
    ? sprintRowDateText(shown, resolved, problem)
    : formatDateRange(shown.sprintStartDate, shown.sprintFinishDate)
  return `Sprint ${sprintNumber}: ${text}`
}

function editPlan(sprint: Sprint, resolved: ResolvedSprintDates | undefined, cadence: number): SprintFormDates {
  const start = resolved?.startDate ?? sprint.sprintStartDate
  const computed = calculateSprintFinishDate(start, cadence)
  const shown = { sprintStartDate: start, sprintFinishDate: sprint.customFinishDate ?? computed }
  return {
    sprintStartDate: start,
    computedFinishDate: computed,
    dateLabel: label(sprint.sprintNumber, shown, resolved ?? { startDate: start, finishDate: computed }, sprint),
    assumedFrom: null,
  }
}

function addPlan(resolved: Map<number, ResolvedSprintDates>, first: string, cadence: number, sprintNumber: number): SprintFormDates {
  const last = resolved.size > 0 ? Math.max(...resolved.keys()) : null
  const lastResolved = last === null ? undefined : resolved.get(last)
  const start = lastResolved ? getNextBusinessDay(lastResolved.finishDate) : first
  const finish = calculateSprintFinishDate(start, cadence)
  const assumedFrom = lastResolved && 'invalidFinishDate' in lastResolved
    ? { sprintNumber: last!, finishDate: lastResolved.finishDate }
    : null
  const shown = { sprintStartDate: start, sprintFinishDate: finish }
  return {
    sprintStartDate: start,
    computedFinishDate: finish,
    dateLabel: label(sprintNumber, shown, { startDate: start, finishDate: finish }, null),
    assumedFrom,
  }
}

/** The dates the form shows and saves. A refused first date counts as missing (D14). */
export function planSprintFormDates(sprint: Sprint | null, project: Project, sprintNumber: number, allSprints: Sprint[]): SprintFormDates {
  const first = project.firstSprintStartDate
  const cadence = project.sprintCadenceWeeks
  if (!isValidIsoDate(first) || !cadence) return NO_SCHEDULE
  const resolved = resolveAllSprintDates(first!, cadence, toInputs(allSprints))
  return sprint
    ? editPlan(sprint, resolved.get(sprint.sprintNumber), cadence)
    : addPlan(resolved, first!, cadence, sprintNumber)
}

function spillOf(project: Project, inputs: DateInput[]): ResolvedDateSpill | null {
  const first = project.firstSprintStartDate!
  const cadence = project.sprintCadenceWeeks!
  return findResolvedDateSpill(inputs, resolveAllSprintDates(first, cadence, inputs), resolveAnchorDate(first, cadence, inputs))
}

/**
 * Why the dates this form would save cannot be saved, or null (D15, D16):
 *  1. no schedule: null — the form cannot save, and says nothing about dates;
 *  2. this sprint's own start, or its computed finish with no custom date,
 *     fails the rule: it lies inside a spill caused before it, and saving would
 *     store refused dates. Name the causes;
 *  3. a refused custom date: null — the date rule already disables Update;
 *  4. otherwise block only when the candidate CAUSES or WORSENS a spill: its
 *     first spilled point is earlier than the stored state's. Never block on
 *     the stored state alone.
 */
export function sprintFormDateIssue(args: {
  sprint: Sprint | null
  project: Project
  allSprints: Sprint[]
  sprintNumber: number
  sprintStartDate: string
  effectiveFinishDate: string
  candidateCustom: string | undefined
}): string | null {
  const { sprint, project, allSprints, sprintNumber, sprintStartDate, effectiveFinishDate, candidateCustom } = args
  if (!sprintStartDate) return null
  const others = toInputs(allSprints.filter((s) => s.id !== sprint?.id))
  const candidate: DateInput[] = [...others, { sprintNumber, customFinishDate: candidateCustom }]
  const candidateSpill = spillOf(project, candidate)
  if (!isValidIsoDate(sprintStartDate) || (candidateCustom === undefined && !isValidIsoDate(effectiveFinishDate))) {
    const before = (candidateSpill?.causes ?? []).filter((c) => c.sprintNumber < sprintNumber)
    return formInsideSpillNote(sprintNumber, before, project.firstSprintStartDate!)
  }
  if (!isValidIsoDate(effectiveFinishDate)) return null
  if (spillRank(candidateSpill) >= spillRank(spillOf(project, toInputs(allSprints)))) return null
  return formCausesSpillNote(candidateSpill!, Math.max(...candidate.map((c) => c.sprintNumber)))
}

/**
 * Edit only, schedule mode only, and only when this sprint's own dates pass the
 * rule (inside a spill, sprintFormDateIssue speaks instead): what the form says
 * about this sprint's saved values.
 */
export function savedDateNote(sprint: Sprint | null, customFinishDate: string, computedFinishDate: string, sprintStartDate: string): string | null {
  if (!sprint || !isValidIsoDate(sprintStartDate) || !isValidIsoDate(computedFinishDate)) return null
  const savedCustom = sprint.customFinishDate
  if (savedCustom !== undefined && !isValidIsoDate(savedCustom)) {
    // Only while the field still holds it: once the user picks a date, the note has done its job.
    return customFinishDate === savedCustom ? formSavedCustomNote(savedCustom, computedFinishDate) : null
  }
  const badStart = sprint.sprintStartDate !== undefined && !isValidIsoDate(sprint.sprintStartDate)
  const badFinish = sprint.sprintFinishDate !== undefined && !isValidIsoDate(sprint.sprintFinishDate)
  if (!badStart && !badFinish) return null
  return formSavedFieldsNote(badStart ? sprint.sprintStartDate : undefined, badFinish ? sprint.sprintFinishDate : undefined)
}

/** Add only: the dates assume the last sprint's standard finish, because its saved one is refused. */
export function assumptionNote(plan: SprintFormDates): string | null {
  return plan.assumedFrom ? formAssumptionNote(plan.assumedFrom.sprintNumber, plan.assumedFrom.finishDate) : null
}
