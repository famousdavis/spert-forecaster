// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Stored states with bad sprint dates, for the rows that prove the app survives
 * them (Brief 38 PR C). Each is STORED state, set with setState, never typed:
 * the forms refuse these values, but older versions and cloud collaborators
 * can still leave them behind.
 *
 * ⚠️ This module and the row files import only modules that existed before
 * PR C, so the same rows run against the earlier tree and go red there per
 * assertion, not by failing to import.
 *
 * The base project: a 2-week cadence, first sprint 2026-01-05, 8 sprints,
 * Done 10+k, Backlog at End 200−10k. Its forecast inputs include a backlog,
 * which a "can it run?" check needs before the worker is ever called.
 */
import type { Project, Sprint } from '@/shared/types'
import { calculateSprintStartDate, calculateSprintFinishDate } from '@/shared/lib/dates'
import { mergeSprintsForUpdate } from '@/shared/state/import-utils'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'

export const T = '2026-01-01T00:00:00.000Z'
export const START = '2026-01-05'
export const PID = 'p1'
export const FIVE_DIGIT = '20276-09-04'
const Y9999 = '9999-12-31'

export function baseSprint(k: number): Sprint {
  const start = calculateSprintStartDate(START, k, 2)
  return {
    id: `s${k}`, projectId: PID, sprintNumber: k, sprintStartDate: start,
    sprintFinishDate: calculateSprintFinishDate(start, 2), doneValue: 10 + k,
    backlogAtSprintEnd: 200 - 10 * k, includedInForecast: true, createdAt: T, updatedAt: T,
  }
}

/** n base sprints, in sprint order, each patched as given. */
export const sprints = (patches: Record<number, Partial<Sprint>>, n = 8): Sprint[] =>
  Array.from({ length: n }, (_, i) => ({ ...baseSprint(i + 1), ...(patches[i + 1] ?? {}) }))

const bothFields = (date: string): Partial<Sprint> => ({ sprintFinishDate: date, customFinishDate: date })

export const SEEDS = {
  control: () => sprints({}),
  /** Sprint 3's saved finish and custom finish: a five-digit year (throws in V8). */
  a3: () => sprints({ 3: bothFields(FIVE_DIGIT) }),
  /** Only the custom date, as a Story Map Update that keeps a local bad custom date leaves it. */
  b3: () => sprints({ 3: { customFinishDate: FIVE_DIGIT } }),
  /** An impossible day: silent in V8 (rolls over to March 2), throws in JavaScriptCore. */
  c3: () => sprints({ 3: bothFields('2026-02-30') }),
  a8: () => sprints({ 8: bothFields(FIVE_DIGIT) }),
  /** Saved start and finish only, which the forecast never reads: marked, not refused. */
  f31_5: () => sprints({ 5: { sprintStartDate: '+020276-09-05', sprintFinishDate: '+020276-09-18' } }),
  y9999_mid: () => sprints({ 3: bothFields(Y9999) }),
  y9999_last: () => sprints({ 8: bothFields(Y9999) }),
  /** Two causes, and a refused stored start inside the spill. */
  stuck: () => sprints({ 2: bothFields(Y9999), 3: { sprintStartDate: '+010000-01-03', ...bothFields(Y9999) } }, 3),
  two_bad: () => sprints({ 3: bothFields(FIVE_DIGIT), 5: bothFields(FIVE_DIGIT) }),
  /** The real Update merge's output on a valid project: every matched sprint has an own `customFinishDate: undefined`. */
  merge: () => mergeSprintsForUpdate(sprints({}), sprints({}).map((s) => ({ ...s, projectId: 'sm' })), PID, 'sm', T).sprints,
  /** NM1: a spill that stops before the last sprint — only sprints 4–6 run past. */
  nm1: () => sprints({ 3: bothFields(Y9999), 6: bothFields('2026-03-25') }),
  /** NM2: a spill of one sprint — only sprint 3 runs past. */
  nm2: () => sprints({ 2: bothFields(Y9999), 3: bothFields('2026-02-12') }),
  /** A refused custom date on a sprint inside a spill (sprint 3's 9999-12-31 spills sprints 4–8). */
  insideBad: () => sprints({ 3: bothFields(Y9999), 5: bothFields(FIVE_DIGIT) }),
  /** Two sprints, for a first-sprint date late in 9999 (the cause-less spill). */
  two: () => sprints({}, 2),
} satisfies Record<string, () => Sprint[]>

export type SeedName = keyof typeof SEEDS

export const seedProject = (extra: Partial<Project> = {}): Project => ({
  id: PID, name: 'Beta', unitOfMeasure: 'points', sprintCadenceWeeks: 2, firstSprintStartDate: START,
  milestones: [], productivityAdjustments: [], createdAt: T, updatedAt: T, ...extra,
})

/** Store state as the app would hold it after loading this seed. */
export function seedStores(name: SeedName, opts: { project?: Partial<Project>; autoRecalculate?: boolean } = {}): void {
  useSettingsStore.setState({ autoRecalculate: opts.autoRecalculate ?? false, trialCount: 1000 })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
  useProjectStore.setState({
    projects: [seedProject(opts.project)],
    sprints: SEEDS[name](),
    viewingProjectId: PID,
    forecastInputs: { [PID]: { remainingBacklog: '120', velocityMean: '15', velocityStdDev: '3' } },
    burnUpConfigs: {},
    _originRef: 'o',
    _changeLog: [],
  })
}

export const storedSprint = (k: number): Sprint => useProjectStore.getState().sprints.find((s) => s.sprintNumber === k)!
