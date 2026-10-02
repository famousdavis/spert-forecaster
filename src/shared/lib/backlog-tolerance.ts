// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Milestone figures against the remaining backlog — compared the way those
// numbers are actually produced, not as if they were exact.
//
// WHY A TOLERANCE AT ALL. SPERT Story Map rounds every milestone figure AND
// the backlog to two decimal places, separately (its exportForForecaster
// `round2`). A cumulative threshold summed from k rounded milestones can
// therefore miss the backlog it was cut from by up to floor(k/2) hundredths,
// in EITHER direction, with nothing wrong in the data: 0.125 + 0.125 = 0.25
// arrives as 0.13 + 0.13 = 0.26. Float addition adds its own noise on top —
// 0.1 + 0.2 sums to 0.30000000000000004 — so even hand-entered figures that
// match exactly fail a strict comparison.
//
// WHY 0.005 × (k + 1). It bounds the worst rounding error with at least 0.005
// to spare (floor(k/2) / 100 <= 0.005k), which also swallows the float noise,
// so no epsilon is stacked on top. backlog-tolerance.test.ts measures rather
// than trusts this: it drives both extremes — exact half-hundredths, which
// all round up, and values just under a half, which all round down — through
// Story Map's rounding for every k up to 13, and requires each to land on
// floor(k/2) hundredths without being flagged.
//
// ⚠️ IT GROWS WITH k, AND THAT IS NOT OPTIONAL. A fixed allowance would have
// to cover the largest k any path can produce, and nothing bounds k tightly:
// the panel's add cap (MAX_MILESTONES) binds hand-adding only, this app's own
// files may carry up to MILESTONE_CEILING, and the Story Map Update merge keeps
// local milestones alongside Story Map's with no cap on the total at all.
// Past whatever k a fixed allowance was sized for, it reads honest rounding as
// a real overshoot.
//
// k is the number of milestones summed into the figure being compared: i + 1
// for the cumulative threshold of milestone i, N for the total of N.
//
// ⚠️ ONE RULE. Every comparison of milestone figures against the backlog goes
// through this module — the unreachable flag on a run's scopes, the Connect AI
// divergence fields, the Story Map contract check, and (v0.45.0) the switch
// that gives a run an Entire Project scope and the notice for milestones past
// the backlog. A second constant anywhere is a bug; backlog-tolerance.test.ts
// fails on a stray literal.

/** The rounding allowance for a figure summed from `k` separately rounded milestones. */
export function backlogTolerance(k: number): number {
  return 0.005 * (k + 1)
}

/**
 * True when `threshold` is past `backlog` by more than rounding can explain —
 * a real overshoot, not 0.13 + 0.13 against 0.25.
 */
export function exceedsBacklog(threshold: number, backlog: number, k: number): boolean {
  return threshold - backlog > backlogTolerance(k)
}

/**
 * True when `sum` and `backlog` agree to within rounding, in EITHER direction.
 * Story Map's rounding can land a fully allocated total just under the backlog
 * as well as just over it.
 */
export function coversBacklog(sum: number, backlog: number, k: number): boolean {
  return Math.abs(sum - backlog) <= backlogTolerance(k)
}

/**
 * True when `sum` is SHORT of `backlog` by more than rounding can explain —
 * work exists outside every milestone. The condition for a run to date the
 * backlog as its own Entire Project scope (v0.45.0).
 */
export function fallsShortOfBacklog(sum: number, backlog: number, k: number): boolean {
  return !coversBacklog(sum, backlog, k) && sum < backlog
}
