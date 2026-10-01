// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  ImportDecisionResult,
  MilestoneFigureChange,
  UpdateDisclosure,
} from '@/shared/state/import-utils'

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

// Story Map rounds to 2 places; a figure typed here can carry float noise.
const figure = (n: number) => String(Math.round(n * 100) / 100)

// A completion flip changes which milestones the forecast pickers offer, so it
// is named as such rather than left as a bare number.
function describeChange(c: MilestoneFigureChange): string {
  const base = `${c.name} ${figure(c.from)} → ${figure(c.to)}`
  if (c.from > 0 && c.to === 0) return `${base} (now completed)`
  if (c.from === 0 && c.to > 0) return `${base} (reopened)`
  return base
}

/**
 * Disclosure lines for an import that ran the `update` path.
 *
 * ⚠️ EVERY VALUE HERE DERIVES FROM THE WRITE-TIME RESULT. `ImportDecisionResult`
 * is built inside applySmartImport's atomic set(), so these lines describe what
 * was actually written. A preview-computed summary would lie under exactly the
 * race the §4.1 re-evaluation guards: a cloud snapshot can change the sprint set
 * mid-preview without changing any conflict tuple.
 *
 * ⚠️ WHAT THE MILESTONE LINES CAN SAY DEPENDS ON THE PAYLOAD'S DECLARED BASIS
 * (`d.milestoneBacklog`, from classifyImportData):
 *   - 'remaining' (Story Map v0.53.8+): a matched milestone takes Story Map's
 *     figure, so the change is a real delta — the local figure before, Story
 *     Map's after, both known inside the merge — and it is reported old → new.
 *   - 'total' (every older file): nothing changes on a matched milestone, and an
 *     ADDED milestone's figure is a LEVEL. Nothing stores the previous imported
 *     total, so "backlog is Story Map's total scope" reads identically whether
 *     that total has been steady for months or doubled last week. That wording
 *     says what the number IS and asks the user to check it.
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

  out.push(...storyMapMilestoneLines(d))

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

  // The placement rule and its cost, named rather than buried. ⚠️ It makes NO
  // claim about direction. It used to say a kept milestone "moves later than where
  // you had it", which was false whenever the milestone already sat last (its
  // target did not move) and, under 'remaining', false the other way: Story Map's
  // smaller figures ahead of it move it EARLIER.
  if (d.milestonesAppended > 0) {
    out.push(
      `${p}: kept milestones are placed after the imported ones, and milestone figures add ` +
        `up in order — so a kept milestone's target now includes every imported milestone ` +
        `ahead of it, and its forecast date follows their figures.`,
    )
  }
  return out
}

/** Cells 2 and 1 — the milestones Story Map sent. Split out to keep each piece simple. */
function storyMapMilestoneLines(d: UpdateDisclosure): string[] {
  const out: string[] = []
  const p = d.projectName
  const added = d.milestonesAdded
  // Cell 2 — disclosed BY NAME, because what the figure IS depends on the file.
  if (added.length > 0) {
    out.push(
      `${p}: added ${added.length} ${plural(added.length, 'milestone')} from Story Map — ` +
        `${added.join(', ')}. ` +
        (d.milestoneBacklog === 'remaining'
          ? `Their backlog figure is the work remaining in that release.`
          : `Their backlog figure is Story Map's TOTAL scope for that release, not the work ` +
            `remaining, so check each one.`),
    )
  }
  // Cell 1 under 'remaining' — Update now REPLACES a figure the user may have set
  // here, so every replaced one is named with what it was and what it is now.
  const changed = d.milestonesChanged
  if (changed.length > 0) {
    out.push(
      `${p}: took Story Map's remaining work for ${changed.length} ` +
        `${plural(changed.length, 'milestone')} — ${changed.map(describeChange).join(', ')}. ` +
        `Story Map's figure replaces any you had set here.`,
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
    // What survives of the forecast setup. ⚠️ This line said, until v0.44.0, that
    // "the forecast deadline and scope-growth settings are reset". They are not:
    // `clearRecordForProject` clears only the stale RUN and keeps the view state
    // (C5 asserts the values), and a browser check at v0.43.8 confirmed both
    // survive an Update. The test beside C5 now binds this wording to that fact.
    details.push(
      `Your backlog and velocity entries, forecast deadline and scope-growth settings were ` +
        `kept. The previous forecast run was cleared, because the sprints changed.`,
    )
  }
  return details
}
