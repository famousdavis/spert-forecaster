// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// How a sprint's dates read in a row (and in the form's label) when one is bad.
// A refused date is never formatted: V8 prints "Invalid Date NaN" and
// JavaScriptCore a plausible false date, and a year-10000 date formats without
// its year. It is quoted raw instead.

import { formatDateLong, formatDateRange, isValidIsoDate, type ResolvedSprintDates } from '@/shared/lib/dates'
import { PAST_MAX_TEXT, quoted, rowProblemText, type SprintProblem } from '@/shared/lib/sprint-date-texts'

/** "February 2" for a valid date; the raw value, quoted, for a refused one. */
const shortDate = (date: string): string => (isValidIsoDate(date) ? formatDateLong(date).replace(/, \d+$/, '') : quoted(date))

/** formatDateRange when both dates pass the rule; otherwise each date on its own, refused ones quoted. */
export function sprintRangeText(start: string, finish: string): string {
  return isValidIsoDate(start) && isValidIsoDate(finish) ? formatDateRange(start, finish) : `${shortDate(start)} - ${shortDate(finish)}`
}

/** A date cell in two parts: the dates, and one warning carrying every problem, joined by "; " (shown after a ⚠, in amber). */
export function sprintRowDateParts(
  sprint: { sprintStartDate: string; sprintFinishDate: string },
  resolved: ResolvedSprintDates | undefined,
  problem: SprintProblem | undefined
): { dates: string; warning: string | null } {
  const start = resolved?.startDate ?? sprint.sprintStartDate
  // A refused custom date: its stand-in is not the user's date, so no finish is shown.
  if (problem?.customValue !== undefined) return { dates: `${shortDate(start)} -`, warning: rowProblemText(problem) }
  const finish = resolved?.finishDate ?? sprint.sprintFinishDate
  const pastMax = resolved !== undefined && !(isValidIsoDate(start) && isValidIsoDate(finish))
  const parts = [pastMax ? PAST_MAX_TEXT : '', problem ? rowProblemText(problem) : ''].filter(Boolean)
  return { dates: sprintRangeText(start, finish), warning: parts.length > 0 ? parts.join('; ') : null }
}

/** The same cell as one line of text. */
export function sprintRowDateText(
  sprint: { sprintStartDate: string; sprintFinishDate: string },
  resolved: ResolvedSprintDates | undefined,
  problem: SprintProblem | undefined
): string {
  const { dates, warning } = sprintRowDateParts(sprint, resolved, problem)
  return warning ? `${dates} ⚠ ${warning}` : dates
}

/** Whether a row or label has anything to mark: a refused or past-limit date in it. */
export function hasDateProblem(start: string, finish: string): boolean {
  return !(isValidIsoDate(start) && isValidIsoDate(finish))
}
