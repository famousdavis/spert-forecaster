// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ImportDecisionResult, UpdateDisclosure } from '@/shared/state/import-utils'

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/**
 * Disclosure lines for an import that ran the `update` path.
 *
 * ⚠️ EVERY VALUE HERE DERIVES FROM THE WRITE-TIME RESULT. `ImportDecisionResult`
 * is built inside applySmartImport's atomic set(), so these lines describe what
 * was actually written. A preview-computed summary would lie under exactly the
 * race the §4.1 re-evaluation guards: a cloud snapshot can change the sprint set
 * mid-preview without changing any conflict tuple.
 *
 * ⚠️ THE SCOPE LINE REPORTS A LEVEL, NOT A DELTA. Nothing stores the previous
 * imported total, so "backlog is Story Map's total scope" reads identically
 * whether that total has been steady for months or doubled last week — which
 * would demand opposite responses from the user. The wording says what the
 * number IS and asks them to check it, rather than implying movement it cannot
 * detect.
 */
/** The lines for ONE updated project. Split out to keep each piece simple. */
function disclosureLines(d: UpdateDisclosure): string[] {
  const out: string[] = []
  const p = d.projectName

  const sprintBits: string[] = []
  if (d.sprintsMatched > 0) {
    sprintBits.push(`${d.sprintsMatched} ${plural(d.sprintsMatched, 'sprint')} refreshed`)
  }
  if (d.sprintsAdded > 0) {
    sprintBits.push(`${d.sprintsAdded} ${plural(d.sprintsAdded, 'sprint')} added`)
  }
  if (sprintBits.length === 0) sprintBits.push('no sprint changes')
  out.push(
    `${p}: ${sprintBits.join(', ')}. Your project dates, productivity adjustments, ` +
      `custom sprint finish dates and sprint-exclusion choices were kept, and so was your ` +
      `unit of measure.`,
  )

  // Cell 2 — disclosed BY NAME, because the number that arrives is Story Map's
  // TOTAL scope written into a field this app reads as REMAINING work.
  if (d.milestonesAdded.length > 0) {
    out.push(
      `${p}: added ${d.milestonesAdded.length} ${plural(d.milestonesAdded.length, 'milestone')} ` +
        `from Story Map — ${d.milestonesAdded.join(', ')}. Their backlog figure is Story Map's ` +
        `TOTAL scope for that release, not the work remaining, so check each one.`,
    )
  }

  // Cell 4 — two populations, and NOTHING STORED DISTINGUISHES THEM. The
  // heuristic that would (an id seen in a previous import) is not available, so
  // the message names both possibilities instead of guessing one.
  if (d.milestonesKept.length > 0) {
    out.push(
      `${p}: kept ${d.milestonesKept.length} ${plural(d.milestonesKept.length, 'milestone')} ` +
        `that Story Map did not send — ${d.milestonesKept.join(', ')}. Each is either one you ` +
        `created here, which can never match a Story Map release, or a release that was emptied ` +
        `or deleted there. Nothing recorded tells the two apart.`,
    )
  }

  if (d.milestonesKeptCompleted > 0) {
    out.push(
      `${p}: kept ${d.milestonesKeptCompleted} completed ` +
        `${plural(d.milestonesKeptCompleted, 'milestone')} (backlog 0).`,
    )
  }

  // The placement rule and its cost, named rather than buried.
  if (d.milestonesAppended > 0) {
    out.push(
      `${p}: kept milestones are placed after the imported ones. Because milestone totals ` +
        `accumulate in order, a kept milestone's own target — and the forecast date that ` +
        `follows from it — moves later than where you had it.`,
    )
  }
  return out
}

export function buildImportBannerDetails(result: ImportDecisionResult): string[] {
  const details: string[] = []
  for (const d of result.disclosures) details.push(...disclosureLines(d))

  for (const dg of result.downgrades) {
    details.push(
      `"${dg.incomingProjectName}" was set to ${dg.from}, but another project in this file ` +
        `claimed the same existing project, so it was skipped. Import it on its own if you ` +
        `still want it.`,
    )
  }

  if (result.updated > 0) {
    // Non-idempotence against `replace`.
    details.push(
      `Sprints you excluded from forecasting stay excluded, so updating does not leave the ` +
        `project in the same state a replace would.`,
    )
    // The asymmetry a refresh cannot produce.
    details.push(
      `Your backlog and velocity entries survive, but the forecast deadline and scope-growth ` +
        `settings are reset — visit the Forecast tab to set them again.`,
    )
  }
  return details
}
