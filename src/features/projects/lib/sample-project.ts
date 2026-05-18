// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Sample project seeder for the "Load Sample Project" CTA.
// New users see a working forecast on first session instead of staring at empty form fields.
//
// Design constraints captured in the v0.31.1 plan, amended in v0.33.2:
//  - Generic agile content (NOT NCCI-flavored) to avoid optical concerns
//  - Originally (v0.31.1) the name was an IDEMPOTENCY KEY — a second call no-op'd with
//    a friendly toast. This worked when the only entry point was the empty-state CTA
//    (which itself disappeared once a project existed), so a re-trigger could only fire
//    on a double-click. v0.33.2 added a persistent toolbar button on the Projects tab,
//    which makes the sample re-loadable at any time. Re-loading must produce a NEW copy
//    rather than silently no-op, so trainees can compare an edited sample against a
//    pristine one. The collision strategy is now a numeric "(N)" suffix walker, matching
//    the idiom users already know from duplicate-file flows: "Sample: Mobile App Launch",
//    then "Sample: Mobile App Launch (2)", "(3)", and so on.
//  - Required Project fields per src/shared/types/index.ts: name, unitOfMeasure, plus
//    firstSprintStartDate is technically optional in the type but the burn-up chart uses
//    a non-null assertion on it — undefined would crash. Set it explicitly.
//  - All sprint dates go through calculateSprintStartDate / calculateSprintFinishDate
//    (which ensures business-day finish dates via getPrecedingBusinessDay). Never
//    hand-roll dates.
//  - Every sprint MUST have includedInForecast: true. The Forecast tab's auto-derivation
//    of remainingBacklog (useForecastInputs.ts) reads from useSprintData's filtered set,
//    which keeps only includedInForecast === true. If any sprint has false, the seed's
//    "200 pre-fill backlog" promise breaks silently.
//  - Last sprint's backlogAtSprintEnd = 200 is the pre-fill source. No setForecastInput
//    needed — auto-derivation handles it on every page load (sprints are persisted,
//    forecastInputs are session-only).

import { toast } from 'sonner'
import { useProjectStore } from '@/shared/state/project-store'
import { addDays, addWeeks, today, calculateSprintStartDate, calculateSprintFinishDate } from '@/shared/lib/dates'

export const SAMPLE_PROJECT_NAME = 'Sample: Mobile App Launch'

// Hand-chosen velocity sequence: realistic variability for a generic agile team.
// Mean ~42.5, σ ~18, CV ~42% — matches the messy reality of teams hit by production
// fires, unplanned absences, and competing priorities (the failure modes that motivate
// statistical forecasting in the first place). A too-tight sequence collapses the
// P10/P90 spread and makes the forecast date look hard-pinned even when sliding the
// custom percentile, which reads as "broken" to first-time users.
// Eight sprints aligns with the MIN_SPRINTS_FOR_BOOTSTRAP threshold (5) so the
// Bootstrap distribution is available if the user re-enables it in Settings.
// Shape: slow start, normal, production-fire dip, recovery, productivity-hit dip,
// catch-up surge, normal, late push.
const SAMPLE_VELOCITIES = [25, 50, 18, 55, 22, 62, 48, 60] as const

// Declining backlog: starts at 800 (sum of velocities + final backlog), ends at 460.
// 340 / 800 = 42.5% done after 8 sprints — the team is still well short of project
// completion, leaving room for multiple downstream milestones to be visible in the
// forecast. The final entry (460) is what the Forecast tab pre-fills as
// remainingBacklog via the auto-derivation in useForecastInputs.ts:63-66.
const SAMPLE_BACKLOG_AT_SPRINT_END = [775, 725, 707, 652, 630, 568, 520, 460] as const

const SPRINT_CADENCE_WEEKS = 2 as const
const SPRINT_COUNT = 8

/**
 * Walk from the base name through "(2)", "(3)", ... until an unused name is found.
 * Pure helper — no store reads, takes the set of existing names as input so it's trivially
 * testable. Caller is responsible for passing a fresh snapshot of project names.
 */
export function generateUniqueProjectName(
  baseName: string,
  existingNames: ReadonlySet<string>,
): string {
  if (!existingNames.has(baseName)) return baseName
  let n = 2
  while (existingNames.has(`${baseName} (${n})`)) {
    n++
  }
  return `${baseName} (${n})`
}

/**
 * Load the sample project into the store. If a project with the canonical sample name
 * already exists, the new project is created with a numeric suffix — "Sample: Mobile
 * App Launch (2)", "(3)", and so on — rather than silently no-op'ing (v0.33.2). The
 * sample's structure (sprints, milestones, productivity adjustment) is identical
 * regardless of name; only the project name varies.
 *
 * Plain module function — uses useProjectStore.getState() (NOT hooks) because it's invoked
 * from event handlers, not from a React render path.
 */
export function loadSampleProject(): void {
  const store = useProjectStore.getState()

  // Collision strategy: walk to the next available "(N)" suffix. Snapshot the current
  // project names so the walker can't race with concurrent adds (Zustand mutations are
  // synchronous, but reading once is still cleaner than re-querying inside the loop).
  const existingNames = new Set(store.projects.map((p) => p.name))
  const projectName = generateUniqueProjectName(SAMPLE_PROJECT_NAME, existingNames)

  // First sprint date: walk back 16 weeks from today so the last sprint ends around now.
  // No bespoke "snap to Monday" — calculateSprintFinishDate uses getPrecedingBusinessDay
  // internally, which guarantees the finish-date side is always a business day. The
  // start-date weekday inherits from whatever today minus 16 weeks lands on.
  const firstSprintStartDate = addWeeks(today(), -16)

  store.addProject({
    name: projectName,
    unitOfMeasure: 'story points',
    sprintCadenceWeeks: SPRINT_CADENCE_WEEKS,
    firstSprintStartDate,
    productivityAdjustments: [],
    milestones: [],
  })

  // addProject generates the id internally — recover it from store state (Zustand set
  // is synchronous, so this works without delay).
  const newProjectId = useProjectStore.getState().projects.find((p) => p.name === projectName)?.id
  if (!newProjectId) {
    toast.error('Failed to seed sample project.')
    return
  }

  // Seed eight sprints. Dates flow through the shared date helpers so finish dates
  // always land on a business day.
  for (let i = 0; i < SPRINT_COUNT; i++) {
    const sprintNumber = i + 1
    const sprintStartDate = calculateSprintStartDate(firstSprintStartDate, sprintNumber, SPRINT_CADENCE_WEEKS)
    const sprintFinishDate = calculateSprintFinishDate(sprintStartDate, SPRINT_CADENCE_WEEKS)

    useProjectStore.getState().addSprint({
      projectId: newProjectId,
      sprintNumber,
      sprintStartDate,
      sprintFinishDate,
      doneValue: SAMPLE_VELOCITIES[i],
      backlogAtSprintEnd: SAMPLE_BACKLOG_AT_SPRINT_END[i],
      includedInForecast: true, // non-negotiable; see file header
    })
  }

  // Four ordered milestones. Under SPERT Forecaster's user-maintained dynamic-remaining
  // model, milestone.backlogSize is "work the user knows remains to deliver this
  // milestone's release." The user updates these values as work is completed and as
  // scope is added or removed. A milestone is "completed" when the user has set its
  // backlogSize to 0.
  //
  // Seeded shape (sum of remaining = 460, matching the final backlogAtSprintEnd):
  //  - MVP Release: 0   — already completed (the trainee sees a zero value as the cue)
  //  - Beta Release: 100 — near-term, ~Sprint 11 at P85 given mean velocity ~42.5
  //  - GA Release: 150  — mid-future, ~Sprint 14
  //  - v2 Release: 210  — project completion, ~Sprint 19
  //
  // Colors mirror DEFAULT_MILESTONE_COLORS in order so seeded milestones look the same
  // as ones a user would add manually one at a time.
  useProjectStore.getState().addMilestone(newProjectId, {
    name: 'MVP Release',
    backlogSize: 0,
    color: '#10b981', // emerald
  })
  useProjectStore.getState().addMilestone(newProjectId, {
    name: 'Beta Release',
    backlogSize: 100,
    color: '#3b82f6', // blue
  })
  useProjectStore.getState().addMilestone(newProjectId, {
    name: 'GA Release',
    backlogSize: 150,
    color: '#f59e0b', // amber
  })
  useProjectStore.getState().addMilestone(newProjectId, {
    name: 'v2 Release',
    backlogSize: 210,
    color: '#8b5cf6', // purple
  })

  // Two-week "Summer Break" window placed at the start of forecast sprint 4 (project
  // sprint 12, ~6 weeks past the forecast start). Factor 0 wipes out a full sprint's
  // worth of working days, shifting the overall project finish by exactly +1 sprint
  // when the user toggles the adjustment on — the pedagogical point of seeding it.
  // Position matters: must be in the forecast period or it gets filtered out by
  // preCalculateSprintFactors. Sprint 4 also sits between Beta Release (~sprint 11,
  // unaffected by the toggle) and GA/v2 (after the break, each shift +1 sprint),
  // demonstrating that adjustments only affect releases whose work hasn't started yet.
  const adjStart = addWeeks(firstSprintStartDate, 22)
  const adjEnd = addDays(adjStart, 13)
  useProjectStore.getState().addProductivityAdjustment(newProjectId, {
    name: 'Summer Break',
    startDate: adjStart,
    endDate: adjEnd,
    factor: 0,
    enabled: true,
  })

  toast.success(`Loaded "${projectName}" — eight sprints, four milestones, one productivity adjustment.`)
}
