// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the export-csv oracle can FAIL — the seven hand-run perturbations that authorised
// the #171 decomposition, made repeatable.
//
// ⚠️ WHY THIS EXISTS AS A COMMITTED SPEC. `export-csv-oracle.test.ts` says in its own header
// that "every one of the seven sections below was perturbed by hand and confirmed to break
// this oracle before the refactor was allowed to start." That claim was true and
// unreproducible: the perturbations lived in a session transcript, and re-deriving them means
// fourteen steps with a revert between each. An audit nobody can re-run is a claim, not a
// check — the same reasoning that moved spert-scheduler's specs out of scratchpad.
//
// ⚠️ THE NEEDLES ARE POST-REFACTOR. X4's original site (`percentileHeader` as a local of
// `generateForecastCsv`) no longer exists — the preparatory hoist moved it into
// `percentileHeaderFor`. A spec transcribed from the pre-refactor run would fail on X4.
//
// ── WHAT EACH MUTATION IS FOR ──────────────────────────────────────────────────────────
// X3, X6 and X7 are LOAD-BEARING: the oracle is the only thing in the suite that catches
// them. The 26-test export-csv.test.ts passes all three at 93.1% branch coverage. X7 is the
// sharpest — an off-by-one shifting the first column of every raw-trial row, missed by every
// existing test.
//
// ⚠️ X1, X2, X4 and X5 are CONFIRMATORY and must stay. The existing suite would also fail
// them, so they prove nothing about coverage — they prove the oracle's REACH. Without them a
// fixture change could silently stop exercising a section while the load-bearing three still
// fail, which reads as "the oracle is fine."
//
// ⚠️ X0 IS A SANITY PROBE AND MUST STAY, AND MUST RUN FIRST. Without it, a harness that
// silently fails to apply its edit reports seven clean passes — indistinguishable from an
// oracle that cannot fail. That is this project's recurring tooling defect: a tool that
// cannot do its job returns the value it returns when there is nothing to report. X0 touches
// `escCsv`, which every fixture reaches through the Section 1 project name, so anything less
// than six failures means the harness, not the oracle.
//
// Every perturbation is SEMANTIC, not a label edit — each breaks arithmetic, a running total,
// a conditional branch or an index, so none can be satisfied by a test that pins only text.
//
// USAGE
//   node scripts/falsify.mjs scripts/falsify-spec-export-csv-oracle.mjs

const CSV = new URL("../src/features/forecast/lib/export-csv.ts", import.meta.url).pathname;

export const testFile = "src/features/forecast/lib/export-csv-oracle.test.ts";

/** Every fixture in the matrix, for the two perturbations that reach all six. */
const ALL_SIX = /matches the pinned output: /;

export const mutations = [
  {
    id: "X0  escCsv appends a tilde  [SANITY — the oracle must be able to fail]",
    file: CSV,
    find: "return /^[=+\\-@\\t]/.test(cleaned) ? `'${cleaned}` : cleaned",
    replace: "return `${cleaned}~`",
    expectFailing: ALL_SIX, // expect 6 — fewer means the harness did not apply the edit
  },
  {
    id: "X1  A Parameters: velocityEstimate row never emitted  [confirmatory]",
    file: CSV,
    find: "if (data.config.velocityEstimate !== undefined)",
    replace: "if (false)",
    // Drops an emitted row rather than editing text, so it also proves this fixture
    // actually reaches the subjective branch.
    expectFailing: /matches the pinned output: subjective mode with all optional config/,
  },
  {
    id: "X2  B Adjustments: factor percentage arithmetic  [confirmatory]",
    file: CSV,
    find: "Math.round(adj.factor * 100)",
    replace: "Math.round(adj.factor * 10)",
    // Perturbs the value conversion, not the header — a literal edit would prove only
    // that the header is pinned.
    expectFailing: /matches the pinned output: productivity adjustments present/,
  },
  {
    id: "X3  C Milestones: running total becomes assignment  [LOAD-BEARING — suite MISSES this]",
    file: CSV,
    find: "cumulative += m.backlogSize",
    replace: "cumulative = m.backlogSize",
    // Every individual row stays correct; only the SECOND milestone's cumulative is
    // wrong (60 instead of 100). Nothing but the oracle pins it.
    expectFailing:
      /matches the pinned output: (config milestones without per-milestone results|full with bootstrap and per-milestone results|per-milestone results without bootstrap)/,
  },
  {
    id: "X4  D Percentiles: bootstrap header branch disabled  [confirmatory]",
    file: CSV,
    find: "if (hasBootstrap) header += ',Bootstrap Sprints,Bootstrap Finish Date'",
    replace: "if (false) header += ',Bootstrap Sprints,Bootstrap Finish Date'",
    // ⚠️ Post-refactor site: `percentileHeaderFor`, using `header` not `percentileHeader`.
    expectFailing: /matches the pinned output: full with bootstrap and per-milestone results/,
  },
  {
    id: "X5  E Per-milestone: the (Total) suffix conditional  [confirmatory]",
    file: CSV,
    find: "isLast ? ' (Total)' : ''",
    replace: "''",
    // Fires on exactly one iteration, so only a fixture with >= 2 milestones can catch
    // it. Both of these have two, deliberately.
    expectFailing:
      /matches the pinned output: (full with bootstrap and per-milestone results|per-milestone results without bootstrap)/,
  },
  {
    id: "X6  F Frequency: bootstrap header branch disabled  [LOAD-BEARING — suite MISSES this]",
    file: CSV,
    find: "if (hasBootstrap) freqHeader += ',Bootstrap Count,Bootstrap %,Bootstrap Cumul %'",
    replace: "if (false) freqHeader += ',Bootstrap Count,Bootstrap %,Bootstrap Cumul %'",
    // Same branch-disabling shape as X4 but a different section, which is the point:
    // the two headers are built independently and either could regress alone.
    expectFailing: /matches the pinned output: full with bootstrap and per-milestone results/,
  },
  {
    id: "X7  G Raw Trials: off-by-one in the trial index  [LOAD-BEARING — suite MISSES this]",
    file: CSV,
    find: "let line = `${i + 1},${data.truncatedNormalSprintsRequired[i]}",
    replace: "let line = `${i},${data.truncatedNormalSprintsRequired[i]}",
    // The broadest of the seven — every row's first column shifts, in all six fixtures —
    // and the existing suite still misses it. The sharpest single argument for the oracle.
    expectFailing: ALL_SIX,
  },
];
