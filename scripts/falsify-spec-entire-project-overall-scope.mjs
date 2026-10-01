// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the v0.44.1 guards can FAIL — "Entire Project" reads the overall scope,
// the pickers share one builder, and every milestone-vs-backlog comparison goes
// through one rounding allowance.
//
// ⚠️ testFile IS THE WHOLE SUITE, ON PURPOSE. The guards live in seven test files
// across three features, and the runner takes one vitest filter. The whole suite
// runs in about ten seconds, and it also proves the mutations break nothing the
// named tests do not own — an OTHER FAILURES line on a mutation is information.
//
// ── WHAT EACH MUTATION IS FOR ──────────────────────────────────────────────────────────
// E0 is a SANITY PROBE and must run first: it widens the allowance to absurdity, which
// any working harness reports red. Fewer failures than expected means the edit did not
// apply, not that the guards are weak.
//
// E1-E4 are the allowance itself, including BOTH known-bad rules it replaced or rejected:
// a fixed half-hundredth (E1, red on 0.13 + 0.13 against 0.25) and a strict comparison
// (E2, red on 0.1 + 0.2 against 0.3).
//
// E5-E10 are "Entire Project", one per surface. Each reverts one consumer to the SELECTED scope,
// which is exactly the v0.44.0 wiring. E10 breaks the definition of "overall" itself.
//
// E11-E12 are the pickers (the shared completion filter and the last-option fallback).
//
// E13-E18 are the Connect AI snapshot: the divergence fields, renderedOnScreen, and the
// two notVisibleToYou sentences v0.44.1 corrected.
//
// E19-E20 guard the guard: a second private allowance must trip the one-rule scan, and a
// scan that cannot see the literal at all must fail its must-find control.
//
// USAGE
//   node scripts/falsify.mjs scripts/falsify-spec-entire-project-overall-scope.mjs

const src = (p) => new URL(`../src/${p}`, import.meta.url).pathname

const TOLERANCE = src('shared/lib/backlog-tolerance.ts')
const TOLERANCE_TEST = src('shared/lib/backlog-tolerance.test.ts')
const STATE = src('features/forecast/hooks/useForecastState.ts')
const TAB = src('features/forecast/components/ForecastTab.tsx')
const SELECTOR = src('features/forecast/components/PercentileSelector.tsx')
const MILESTONES = src('features/forecast/lib/milestones.ts')
const SNAPSHOT = src('features/connect-ai/lib/build-snapshot.ts')
const CONTRACT = src('shared/state/storymap-contract/storymap-contract.test.ts')

export const testFile = 'src'

/** Re-add the selected-scope `results` to ForecastTab's destructuring. */
const RESTORE_RESULTS = {
  find: '    isSimulating,\n    simulationData,\n    overallResults,\n',
  replace: '    isSimulating,\n    results,\n    simulationData,\n    overallResults,\n',
}

const P0 = /"Entire Project" is independent of the chart selection/

export const mutations = [
  {
    id: 'E0  the allowance is absurdly wide  [SANITY — the suite must be able to fail]',
    file: TOLERANCE,
    find: 'return 0.005 * (k + 1)',
    replace: 'return 0.5 * (k + 1)',
    expectFailing: /a genuine overshoot just past the allowance IS flagged/,
  },
  {
    id: 'E1  KNOWN-BAD: a fixed half-hundredth, whatever k is',
    file: TOLERANCE,
    find: 'return 0.005 * (k + 1)',
    replace: 'return 0.005',
    expectFailing: /0\.13 \+ 0\.13 against 0\.25 is rounding, not an overshoot/,
  },
  {
    id: 'E2  KNOWN-BAD: a strict comparison, no allowance',
    file: TOLERANCE,
    find: 'return threshold - backlog > backlogTolerance(k)',
    replace: 'return threshold > backlog',
    expectFailing: /float noise is not an overshoot/,
  },
  {
    id: 'E3  coversBacklog forgets the undershoot direction',
    file: TOLERANCE,
    find: 'return Math.abs(sum - backlog) <= backlogTolerance(k)',
    replace: 'return sum - backlog <= backlogTolerance(k)',
    expectFailing: /a genuine shortfall just past the allowance is NOT covered/,
  },
  {
    id: 'E4  the unreachable flag ignores how many milestones are summed (k = 0)',
    file: STATE,
    find: 'exceedsBacklog(threshold, runConfig.remainingBacklog, i + 1)',
    replace: 'exceedsBacklog(threshold, runConfig.remainingBacklog, 0)',
    expectFailing: /Story Map rounding past the backlog is NOT unreachable/,
  },
  {
    id: 'E5  Entire Project: the forecast summary reads the SELECTED scope again',
    file: TAB,
    find: '                <ForecastSummary\n                  results={overallResults}\n                  simulationData={overallSimulationData}',
    replace: '                <ForecastSummary\n                  results={results!}\n                  simulationData={simulationData!}',
    also: RESTORE_RESULTS,
    expectFailing: P0,
  },
  {
    id: 'E6  Entire Project: the Deadline Probability panel reads the SELECTED scope again',
    file: TAB,
    find: '            onTargetDateChange={setTargetDate}\n            simulationData={overallSimulationData}',
    replace: '            onTargetDateChange={setTargetDate}\n            simulationData={simulationData!}',
    expectFailing: P0,
  },
  {
    id: 'E7  Entire Project: the results-table fallback reads the SELECTED scope again',
    file: TAB,
    find: '                      simulationData={overallSimulationData}\n                      selectedPercentiles={selectedResultsPercentiles}',
    replace: '                      simulationData={simulationData!}\n                      selectedPercentiles={selectedResultsPercentiles}',
    expectFailing: /the results table fallback reads the overall scope/,
  },
  {
    id: 'E8  Entire Project: the CSV percentile section exports the SELECTED scope again',
    file: STATE,
    find: 'lognormalResults: overallResults.lognormal',
    replace: 'lognormalResults: (results ?? overallResults).lognormal',
    expectFailing: /CSV sections 2-4 export the overall scope/,
  },
  {
    id: 'E9  Entire Project: the CSV trial sections export the SELECTED scope again',
    file: STATE,
    find: 'lognormalSprintsRequired: overallSimulationData.lognormal',
    replace: 'lognormalSprintsRequired: (simulationData ?? overallSimulationData).lognormal',
    expectFailing: /CSV sections 2-4 export the overall scope/,
  },
  {
    id: 'E10 "overall" is defined as the selected scope',
    file: STATE,
    find: 'const overallSimulationData = record ? (record.simData[record.simData.length - 1] ?? null) : null',
    replace: 'const overallSimulationData = record ? (record.simData[activeScopeIndex] ?? null) : null',
    expectFailing: P0,
  },
  {
    id: 'E11 the Custom Percentile picker drops the completion filter',
    file: SELECTOR,
    find: 'buildMilestonePickerOptions(milestones, milestoneCompletionInfo)',
    replace: 'buildMilestonePickerOptions(milestones)',
    expectFailing: /does not offer a completed milestone/,
  },
  {
    id: 'E12 both pickers fall back to the FIRST option',
    file: MILESTONES,
    find: 'options[options.length - 1].value',
    replace: 'options[0].value',
    expectFailing: /LAST visible milestone/,
  },
  {
    id: 'E13 the divergence fields read the LAST scope again',
    file: SNAPSHOT,
    find: 'run.scopes.filter((s) => s.milestoneIndex !== null)',
    replace: 'run.scopes',
    expectFailing: /reads the MILESTONE scopes, never the last scope/,
  },
  {
    id: 'E14 the divergence fields compare strictly again',
    file: SNAPSHOT,
    find: 'if (coversBacklog(total, backlog, milestoneScopes.length)) {',
    replace: 'if (total === backlog) {',
    expectFailing: /Story Map rounding is not a divergence/,
  },
  {
    id: 'E15 renderedOnScreen forgets what the forecast summary shows',
    file: SNAPSHOT,
    find: '  if (ctx.summaryScope === null ? i === ctx.lastIdx : milestoneIndex === ctx.summaryScope) return true\n',
    replace: '',
    expectFailing: /rendered whenever the summary shows Entire Project/,
  },
  {
    id: 'E16 renderedOnScreen forgets the results-table fallback',
    file: SNAPSHOT,
    find: 'return ctx.chartedIncomplete.size === 0 && i === ctx.lastIdx',
    replace: 'return false',
    expectFailing: /with every milestone hidden, the results table shows the overall scope/,
  },
  {
    id: 'E17 the deadline note claims a swapped series again',
    file: SNAPSHOT,
    find: 'for the Entire Project scope and every computed',
    replace: 'for a milestone-swapped series and every computed',
    expectFailing: /no longer claims the panel receives a swapped series/,
  },
  {
    id: 'E18 the all-complete note promises sprint 1 again',
    file: SNAPSHOT,
    find: 'which is the first forecast sprint when scope growth is not modelled',
    replace: 'so all scopes resolve at the first sprint, scope growth or not',
    expectFailing: /does not promise sprint 1/,
  },
  {
    id: 'E19 the Story Map contract check grows its own allowance again',
    file: CONTRACT,
    find: 'expect(exceedsBacklog(sum, lastBacklog!, milestones.length)).toBe(false)',
    replace: 'expect(exceedsBacklog(sum, lastBacklog!, milestones.length) && sum > lastBacklog! + 0.005).toBe(false)',
    expectFailing: /finds it nowhere else/,
  },
  {
    id: 'E20 the one-rule scan cannot see the literal at all',
    file: TOLERANCE_TEST,
    find: 'const LITERAL = /(?<![\\d.])0\\.005(?!\\d)/',
    replace: 'const LITERAL = /(?<![\\d.])0\\.0050(?!\\d)/',
    expectFailing: /finds the literal where it belongs/,
  },
]
