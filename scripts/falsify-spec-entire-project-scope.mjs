// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the v0.45.0 guards can FAIL — the Entire Project scope a run carries when its
// milestones fall short of the backlog, everywhere it has to appear, and the notice for
// milestones past the backlog.
//
// ⚠️ testFile IS THE WHOLE SUITE, ON PURPOSE, as in the v0.44.1 spec: the guards span the
// engine, the hook, four components, the CSV and the Connect AI snapshot, and the whole
// suite runs in about ten seconds.
//
// ── WHAT EACH MUTATION IS FOR ──────────────────────────────────────────────────────────
// S0 is a SANITY PROBE and must run first: it makes every milestone run grow a project
// scope, which breaks the D20 shape every existing milestone test relies on.
//
// S1-S6 are the switch: never firing, appending the wrong threshold, ignoring rounding in
// either direction, firing past the backlog too, keeping 'cumulative-final' beside a
// project scope, and selecting the last milestone instead of the project after a run.
//
// S7-S11 are where the scope must appear on screen: the pickers' "Entire Project (Total)"
// option, the moved "(Total)", the chart wiring, and the Forecast Results table.
//
// S12-S16 are the CSV and the Connect AI snapshot.
//
// S17-S19 are the notice for milestones past the backlog, including the KNOWN-BAD rule the
// brief named: a strict comparison, which shows the notice on Story Map's rounding.
//
// S20 is the shared helper that finds the project scope.
//
// S21-S22 are the ENGINE properties the scope rests on. The engine is unchanged by this
// release; these prove the committed pins would catch it changing under the scope.
//
// USAGE
//   node scripts/falsify.mjs scripts/falsify-spec-entire-project-scope.mjs

const src = (p) => new URL(`../src/${p}`, import.meta.url).pathname

const MILESTONES = src('features/forecast/lib/milestones.ts')
const TOLERANCE = src('shared/lib/backlog-tolerance.ts')
const STATE = src('features/forecast/hooks/useForecastState.ts')
const CDF = src('features/forecast/components/DistributionChart.tsx')
const RESULTS = src('features/forecast/components/ForecastResults.tsx')
const SUMMARY = src('features/forecast/components/ForecastSummary.tsx')
const CSV = src('features/forecast/lib/export-csv.ts')
const SNAPSHOT = src('features/connect-ai/lib/build-snapshot.ts')
const ENGINE = src('features/forecast/lib/monte-carlo.ts')

export const testFile = 'src'

const SWITCH = /appends the backlog to the SAME run/

export const mutations = [
  {
    id: 'S0  every milestone run grows a project scope  [SANITY — the suite must be able to fail]',
    file: MILESTONES,
    find: 'const addProjectScope = fallsShortOfBacklog(thresholds[n - 1], backlog, n)',
    replace: 'const addProjectScope = true',
    expectFailing: /an exact match adds nothing/,
  },
  {
    id: 'S1  the switch never fires',
    file: MILESTONES,
    find: 'const addProjectScope = fallsShortOfBacklog(thresholds[n - 1], backlog, n)',
    replace: 'const addProjectScope = false',
    expectFailing: SWITCH,
  },
  {
    id: 'S2  the project scope is dated at the milestones\' total, not the backlog',
    file: MILESTONES,
    find: 'runThresholds: [...thresholds, backlog],',
    replace: 'runThresholds: [...thresholds, thresholds[n - 1]],',
    expectFailing: SWITCH,
  },
  {
    id: 'S3  the switch ignores rounding (fires on 0.12 + 0.12 against 0.25)',
    file: TOLERANCE,
    find: 'return !coversBacklog(sum, backlog, k) && sum < backlog',
    replace: 'return sum < backlog',
    expectFailing: /rounding UNDER the backlog adds nothing/,
  },
  {
    id: 'S4  the switch fires past the backlog too',
    file: TOLERANCE,
    find: 'return !coversBacklog(sum, backlog, k) && sum < backlog',
    replace: 'return !coversBacklog(sum, backlog, k)',
    expectFailing: /milestones PAST the backlog add nothing either/,
  },
  {
    id: 'S5  the last milestone stays cumulative-final beside a project scope',
    file: MILESTONES,
    find: "kind: i === n - 1 && !addProjectScope ? 'cumulative-final' : 'milestone',",
    replace: "kind: i === n - 1 ? 'cumulative-final' : 'milestone',",
    expectFailing: SWITCH,
  },
  {
    id: 'S6  a run selects the last milestone, not the project scope',
    file: STATE,
    find: 'setSelectedMilestoneIndexAction(runProjectId, plan.scopes.length - 1)',
    replace: 'setSelectedMilestoneIndexAction(runProjectId, thresholds.length - 1)',
    expectFailing: SWITCH,
  },
  {
    id: 'S7  the pickers never offer "Entire Project (Total)"',
    file: MILESTONES,
    find: "options.push({ value: projectScopeIndex, label: 'Entire Project (Total)' })",
    replace: '',
    expectFailing: /offers it last as/,
  },
  {
    id: 'S8  a milestone keeps "(Total)" beside the project scope',
    file: MILESTONES,
    find: 'const lastIsTotal = projectScopeIndex === null && visible.length > 1',
    replace: 'const lastIsTotal = visible.length > 1',
    expectFailing: /no milestone is the total/,
  },
  {
    id: 'S9  the CDF chart does not tell its picker about the project scope',
    file: CDF,
    find: '            projectScopeIndex={projectScopeIndex}\n',
    replace: '            projectScopeIndex={null}\n',
    expectFailing: /keeps the selection on it/,
  },
  {
    id: 'S10 Forecast Results has no Entire Project table',
    file: RESULTS,
    find: '{projectResult && (',
    replace: '{false && (',
    expectFailing: /Forecast Results adds an Entire Project table/,
  },
  {
    id: 'S11 the last milestone\'s table stays the total beside the project\'s',
    file: RESULTS,
    find: 'const isLast = !projectResult && visIdx === visibleMilestones.length - 1',
    replace: 'const isLast = visIdx === visibleMilestones.length - 1',
    expectFailing: /Forecast Results adds an Entire Project table/,
  },
  {
    id: 'S12 the CSV has no Entire Project row',
    file: CSV,
    find: 'if (md.project) csvProjectRow(lines, hasBootstrap, md.project)',
    replace: '',
    expectFailing: /adds the Entire Project row after the milestones/,
  },
  {
    id: 'S13 the CSV milestone rows are handed the project scope too',
    file: CSV,
    find: 'const quads = projectIdx !== null ? record.quadResults.slice(0, projectIdx) : record.quadResults',
    replace: 'const quads = record.quadResults',
    expectFailing: /the milestone rows stop before it/,
  },
  {
    id: 'S14 the CSV keeps "(Total)" on the last milestone beside the project row',
    file: CSV,
    find: 'const isLast = mi === milestoneData.milestones.length - 1 && !milestoneData.project',
    replace: 'const isLast = mi === milestoneData.milestones.length - 1',
    expectFailing: /adds the Entire Project row after the milestones, and only it is the total/,
  },
  {
    id: 'S15 the snapshot collapse drops the project scope',
    file: SNAPSHOT,
    find: 'return projectIdx !== null ? [mapped[projectIdx]] : [collapsedScope()]',
    replace: 'return [collapsedScope()]',
    expectFailing: /the collapse KEEPS the project scope/,
  },
  {
    id: 'S16 the snapshot loses the selection on the kept project scope',
    file: SNAPSHOT,
    find: ': (keptProject !== null && clamped === keptProject ? 0 : null)',
    replace: ': null',
    expectFailing: /the collapse KEEPS the project scope/,
  },
  {
    id: 'S17 KNOWN-BAD: the notice compares strictly, so rounding shows it',
    file: STATE,
    find: 'return exceedsBacklog(milestones.total, backlog, milestones.count)',
    replace: 'return milestones.total > backlog',
    expectFailing: /reports nothing for rounding past the backlog/,
  },
  {
    id: 'S18 the notice shows for milestones short of the backlog too',
    file: STATE,
    find: 'return exceedsBacklog(milestones.total, backlog, milestones.count)',
    replace: 'return milestones.total !== backlog',
    expectFailing: /reports nothing when the milestones match or fall short/,
  },
  {
    id: 'S19 the forecast summary never renders the notice',
    file: SUMMARY,
    find: '{pastBacklogText && (',
    replace: '{false && (',
    expectFailing: /shows when the milestones add up to more than the backlog/,
  },
  {
    id: 'S20 the project scope is never found',
    file: MILESTONES,
    find: "return scopes[last].kind === 'project' ? last : null",
    replace: 'return null',
    expectFailing: SWITCH,
  },
  {
    id: 'S21 ENGINE: a threshold is crossed only when strictly passed',
    file: ENGINE,
    find: 'remaining <= remainingBacklog - cumulativeThresholds[nextIdx]) {',
    replace: 'remaining < remainingBacklog - cumulativeThresholds[nextIdx]) {',
    expectFailing: /milestones \[10, 40, 60\] cross at 1, 4, 6/,
  },
  {
    id: 'S22 ENGINE: a threshold past the backlog is dated after completion',
    file: ENGINE,
    find: '  while (nextIdx < cumulativeThresholds.length) {\n    results[nextIdx] = sprints\n',
    replace: '  while (nextIdx < cumulativeThresholds.length) {\n    results[nextIdx] = sprints + 1\n',
    expectFailing: /milestones past the backlog are dated at completion/,
  },
]
