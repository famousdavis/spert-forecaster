// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Milestone derivations.
//
// SPERT Forecaster's milestone model is **dynamic remaining work**:
//
//  • milestone.backlogSize is "remaining work to deliver this milestone's release,"
//    kept current as work progresses (and as scope is added or removed). The system
//    does not auto-derive this from sprint history — milestone scope can change
//    independently of sprint delivery (descopes, additions).
//
//  • WHO keeps it current depends on where the milestone came from. For a milestone
//    created here, the user is the source of truth. For one matched to a SPERT Story
//    Map release, an Update from a Story Map v0.53.8+ export writes Story Map's
//    remaining work over it — Story Map is then the source of truth, as it already is
//    for sprint progress. An older export carries release TOTALS and never overwrites
//    it (docs/SPEC_DEVIATIONS.md SD-5).
//
//  • cumulativeThresholds[i] = sum of remaining work to reach milestone i from current
//    state = sum(milestone[0..i].backlogSize). This is what the Monte Carlo simulation
//    needs: the per-trial check "delivered-this-trial ≥ threshold" reads correctly
//    as "have we delivered enough to cross this milestone?"
//
//  • A milestone is "completed" when its backlogSize is 0 — set by the user, or sent
//    by Story Map v0.53.8+ for a release whose work is all done. No work remains for
//    that release window. "Completed" is the term used throughout
//    because not every milestone represents a release event — some are internal
//    markers ("Feature Complete," "Code Freeze") — but every milestone can be in
//    a state of "all its remaining work is done." The system surfaces this state
//    visually (italic in the breakdown, filtered from Scope picker and per-
//    milestone forecast tables) but does not record *when* it completed — that
//    history lives in GanttApp, which this tool feeds into.

import type { Milestone } from '@/shared/types'

export interface MilestoneCompletionInfo {
  /** True iff this milestone's backlogSize is 0 (zeroed here, or sent as 0 by Story Map). */
  completed: boolean
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
 * Per-milestone completion status. A milestone is completed when its backlogSize is
 * 0 — no work remains for that release, whether the user zeroed it or Story Map sent
 * it that way. Returns an array aligned 1:1 with `milestones` by index.
 */
export function computeMilestoneCompletionInfo(milestones: Milestone[]): MilestoneCompletionInfo[] {
  return milestones.map((m) => ({ completed: m.backlogSize === 0 }))
}

/**
 * Milestones eligible to appear in a forecast-control dropdown (chart toolbars,
 * Forecast Summary scope picker, per-milestone forecast tables). Two conditions
 * must hold: (1) the user has not unchecked the milestone's chart toggle, and
 * (2) the milestone is not completed. A completed milestone's cumulative threshold
 * equals the preceding milestone's, so offering it as a forecast option would
 * render an identical chart under a misleading label. Returns `{ milestone, originalIndex }`
 * pairs so callers can reference back into the source `milestones` array by index.
 */
export function computeVisibleForecastMilestones(
  milestones: Milestone[],
  completionInfo: MilestoneCompletionInfo[] = [],
): Array<{ milestone: Milestone; originalIndex: number }> {
  return milestones
    .map((m, idx) => ({ milestone: m, originalIndex: idx }))
    .filter(({ milestone: m }) => m.showOnChart !== false)
    .filter(({ originalIndex }) => !completionInfo[originalIndex]?.completed)
}

/** One option in a forecast-control milestone picker. `value` indexes the run's scopes. */
export interface MilestonePickerOption {
  value: number
  label: string
}

/**
 * The options every forecast-control milestone picker offers: the CDF and
 * Histogram toolbars, and the Custom Percentile panel. ONE builder for all
 * three. They used to keep separate copies, and the copies drifted — v0.32.1
 * taught the chart pickers to hide completed milestones, and the Custom
 * Percentile picker kept offering them until v0.44.1, where picking one
 * charted a threshold of zero.
 *
 * Charted, not-completed milestones, in order. When there is more than one,
 * the last carries "(Total)".
 */
export function buildMilestonePickerOptions(
  milestones: Milestone[],
  completionInfo: MilestoneCompletionInfo[] = [],
): MilestonePickerOption[] {
  const visible = computeVisibleForecastMilestones(milestones, completionInfo)
  return visible.map(({ milestone, originalIndex }, i) => ({
    value: originalIndex,
    label: i === visible.length - 1 && visible.length > 1 ? `${milestone.name} (Total)` : milestone.name,
  }))
}

/**
 * Where a picker moves a selection it no longer offers: the LAST option, never
 * the first. A run leaves the selection on its last scope; when that milestone
 * is complete, the last option still shares its cumulative threshold (a
 * completed milestone adds nothing to the running sum), so the chart keeps
 * showing what it showed. The first option is a different forecast entirely.
 * Null when nothing is offered.
 */
export function pickerFallback(options: MilestonePickerOption[]): number | null {
  return options.length > 0 ? options[options.length - 1].value : null
}
