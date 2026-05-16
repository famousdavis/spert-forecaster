// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Milestone history derivation.
//
// Two key concepts live in this module:
//
//  • cumulativeScope[i] — project-zero cumulative backlog at milestone i: the sum of
//    `backlogSize` for milestones 0..i. This is a static, project-level fact derived
//    purely from the milestones array; it does not depend on what the team has done.
//    Used for: burn-up chart reference-line positions, "X cumulative" display labels,
//    CSV export.
//
//  • cumulativeThresholds[i] — work to deliver from the team's *current* state to
//    reach milestone i. Defined as max(0, cumulativeScope[i] − alreadyDone), so that
//    already-shipped milestones report zero remaining work. This is what the Monte
//    Carlo simulation needs: the sim's per-trial check is "delivered-this-trial ≥
//    threshold", and passing project-zero cumulative would inflate the threshold by
//    alreadyDone, causing late milestones to fall through to the trial's max-sprint
//    fallback (a latent bug exposed when alreadyDone > 0 and milestones span project
//    history).
//
// Shipped detection: walk included sprints in sprintNumber order, accumulate doneValue,
// mark each milestone shipped the first sprint at which cumulative work meets/exceeds
// the milestone's cumulativeScope. Result is 1:1 aligned with milestones[] by index.

import type { Milestone, Sprint } from '@/shared/types'

export interface MilestoneShippedInfo {
  shipped: boolean
  /** Sprint number at which cumulative work first met/exceeded the milestone's threshold. */
  shippedAtSprintNumber?: number
  /** Finish date of that sprint (YYYY-MM-DD). */
  shippedAtFinishDate?: string
}

/** Sum of backlogSize across milestones 0..i, returned per milestone (aligned by index). */
export function computeCumulativeScope(milestones: Milestone[]): number[] {
  let cumulative = 0
  return milestones.map((m) => {
    cumulative += m.backlogSize
    return cumulative
  })
}

/**
 * Per-milestone shipped status, derived from sprint history.
 *
 * Walks `includedSprints` in sprintNumber order, accumulating `doneValue`. The first
 * sprint at which cumulative work meets or exceeds a milestone's cumulativeScope is
 * recorded as that milestone's shipping sprint.
 *
 * Returns an array aligned 1:1 with `milestones` by index.
 */
export function computeShippedMilestoneInfo(
  milestones: Milestone[],
  includedSprints: Sprint[] | undefined,
): MilestoneShippedInfo[] {
  if (milestones.length === 0) return []
  if (!includedSprints || includedSprints.length === 0) {
    return milestones.map(() => ({ shipped: false }))
  }

  const cumulativeScope = computeCumulativeScope(milestones)
  const info: MilestoneShippedInfo[] = milestones.map(() => ({ shipped: false }))
  const sorted = [...includedSprints].sort((a, b) => a.sprintNumber - b.sprintNumber)

  let cumulativeDone = 0
  let nextIdx = 0
  for (const sprint of sorted) {
    cumulativeDone += sprint.doneValue
    while (nextIdx < cumulativeScope.length && cumulativeScope[nextIdx] <= cumulativeDone) {
      info[nextIdx] = {
        shipped: true,
        shippedAtSprintNumber: sprint.sprintNumber,
        shippedAtFinishDate: sprint.sprintFinishDate,
      }
      nextIdx++
    }
    if (nextIdx >= cumulativeScope.length) break
  }

  return info
}
