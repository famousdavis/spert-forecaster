// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The two lines under a project's name on its dashboard tile (v0.49.0, D14):
//   "8 sprints · 2-week cadence · story points"
//   "Last sprint ended Nov 6, 2026 · Finish: Dec 18, 2026"
//
// ⚠️ "Last sprint ended" never disagrees with Sprint History. The last sprint is the one with
// the highest sprintNumber (as SprintList marks it), not the last in the array, and its finish
// is computed exactly as SprintList computes that sprint's row: the resolver over the
// project's sprints, the stored-date problem map, then `sprintRowDateParts`. The line shows
// only when that row carries no warning and its finish passes the date rule. When the
// resolver gives nothing (no valid first sprint date, or no cadence), the row shows the
// stored finish, and so does the tile, under the same two conditions.
//
// ⚠️ A tile must render with any stored date. Safari's JavaScriptCore and V8 fail on
// different dates, so the date rule (`isValidIsoDate`) is applied before anything is
// formatted: an unchecked `formatDate` prints "Invalid Date" on Safari and a rolled-over
// date on V8.

import type { Project, Sprint } from '@/shared/types'
import { findInvalidSprintDates, formatDate, isValidIsoDate, resolveAllSprintDates } from '@/shared/lib/dates'
import { groupBySprint } from '@/shared/lib/sprint-date-texts'
import { sprintRowDateParts } from '@/features/sprint-history/lib/sprint-date-display'

export interface TileSprintSummary {
  /** Every recorded sprint of the project, included in the forecast or not: the tile describes history. */
  count: number
  /** The last sprint's finish, as its Sprint History row shows it; null when that row has a warning or no valid date. */
  lastFinish: string | null
}

/** What a tile says about its project's sprints. `projectSprints` holds that project's sprints only. */
export function summarizeSprints(
  project: Pick<Project, 'firstSprintStartDate' | 'sprintCadenceWeeks'>,
  projectSprints: readonly Sprint[],
): TileSprintSummary {
  if (projectSprints.length === 0) return { count: 0, lastFinish: null }
  const last = projectSprints.reduce((a, b) => (b.sprintNumber > a.sprintNumber ? b : a))

  // As SprintList.tsx: a refused first date counts as missing.
  const resolved =
    isValidIsoDate(project.firstSprintStartDate) && project.sprintCadenceWeeks
      ? resolveAllSprintDates(
          project.firstSprintStartDate!,
          project.sprintCadenceWeeks,
          projectSprints.map((s) => ({ sprintNumber: s.sprintNumber, customFinishDate: s.customFinishDate })),
        )
      : null
  const problem = new Map(groupBySprint(findInvalidSprintDates(projectSprints)).map((p) => [p.sprintNumber, p])).get(
    last.sprintNumber,
  )
  const lastResolved = resolved?.get(last.sprintNumber)
  const { warning } = sprintRowDateParts(last, lastResolved, problem)
  const finish = lastResolved?.finishDate ?? last.sprintFinishDate
  return { count: projectSprints.length, lastFinish: warning === null && isValidIsoDate(finish) ? finish : null }
}

const countText = (n: number) => (n === 0 ? 'No sprints yet' : n === 1 ? '1 sprint' : `${n} sprints`)

/** The tile's meta lines, in order; a line with nothing to say is left out. */
export function tileMetaLines(
  project: Pick<Project, 'sprintCadenceWeeks' | 'unitOfMeasure' | 'projectFinishDate'>,
  summary: TileSprintSummary,
): string[] {
  const line1 = [
    countText(summary.count),
    project.sprintCadenceWeeks ? `${project.sprintCadenceWeeks}-week cadence` : null,
    project.unitOfMeasure,
  ]
    .filter(Boolean)
    .join(' · ')
  const line2 = [
    summary.count > 0 && summary.lastFinish ? `Last sprint ended ${formatDate(summary.lastFinish)}` : null,
    isValidIsoDate(project.projectFinishDate) ? `Finish: ${formatDate(project.projectFinishDate!)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return [line1, line2].filter(Boolean)
}
