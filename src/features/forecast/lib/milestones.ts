// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Milestone derivations.
//
// SPERT Forecaster's milestone model is **user-maintained dynamic remaining work**:
//
//  • milestone.backlogSize is "remaining work to deliver this milestone's release,"
//    set and updated by the user as work progresses (and as scope is added or removed).
//    The system does not auto-derive this from sprint history — milestone scope can
//    change independently of sprint delivery (descopes, additions) and the user is
//    the source of truth.
//
//  • cumulativeThresholds[i] = sum of remaining work to reach milestone i from current
//    state = sum(milestone[0..i].backlogSize). This is what the Monte Carlo simulation
//    needs: the per-trial check "delivered-this-trial ≥ threshold" reads correctly
//    as "have we delivered enough to cross this milestone?"
//
//  • A milestone is "completed" when the user has set backlogSize to 0. No work
//    remains for that release window. "Completed" is the term used throughout
//    because not every milestone represents a release event — some are internal
//    markers ("Feature Complete," "Code Freeze") — but every milestone can be in
//    a state of "all its remaining work is done." The system surfaces this state
//    visually (italic in the breakdown, filtered from Scope picker and per-
//    milestone forecast tables) but does not record *when* it completed — that
//    history lives in GanttApp, which this tool feeds into.

import type { Milestone } from '@/shared/types'

export interface MilestoneCompletionInfo {
  /** True iff the user has zeroed out backlogSize for this milestone. */
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
 * Per-milestone completion status. A milestone is completed when the user has set
 * its backlogSize to 0 — i.e., they've declared that no work remains for that
 * release. Returns an array aligned 1:1 with `milestones` by index.
 */
export function computeMilestoneCompletionInfo(milestones: Milestone[]): MilestoneCompletionInfo[] {
  return milestones.map((m) => ({ completed: m.backlogSize === 0 }))
}
