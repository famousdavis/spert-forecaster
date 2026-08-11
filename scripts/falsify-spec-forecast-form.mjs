// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the ForecastForm characterisation suite can FAIL.
//
// ⚠️ WHY THIS EXISTS. Item 2 established that coverage overstates "would a break be caught" —
// export-csv had 93.1% branch coverage and three of its seven sections were pinned by nothing.
// A suite written against a component with ZERO prior executions is exactly where that error
// would repeat: 29 green tests look like 29 pinned behaviours, and only perturbation can tell
// the difference. The Phase 2 pre-registration asked how many sites end up *asserted*; reading
// the file cannot answer that, so this does.
//
// ⚠️ THESE PERTURBATIONS TARGET CLAIM CLASSES, NOT EVERY SITE. Nine probes covering: harness
// sanity, sentinel discrimination in both velocity fields, the `.toFixed` asymmetry, a
// presence marker, a threshold, plural logic, one boolean leg of a compound condition, and a
// callback contract. Each is the representative of a class the suite depends on. It is not a
// claim that all 47 distinguishable sites were individually perturbed — see the record.
//
// ⚠️ S0 IS THE SANITY PROBE AND MUST RUN FIRST. Without it, a harness that fails to apply its
// edits reports nine clean passes, which reads as a suite that cannot fail rather than a
// harness that did not run.
//
// ⚠️ S1 AND S3 ARE THE POINT OF THE SENTINEL DESIGN. Each swaps one prop for another that
// carries a *different* two-decimal value. Had the fixture set every numeric prop to the same
// number — the obvious way to write it — both would survive, and the suite would claim to pin
// a composition it never touched.
//
// USAGE
//   node scripts/falsify.mjs scripts/falsify-spec-forecast-form.mjs

const FORM = new URL("../src/features/forecast/components/ForecastForm.tsx", import.meta.url)
  .pathname;

export const testFile = "src/features/forecast/components/ForecastForm.test.tsx";

export const mutations = [
  {
    id: "S0  isSubjective pinned false  [SANITY — the suite must be able to fail]",
    file: FORM,
    find: "const isSubjective = forecastMode === 'subjective'",
    replace: "const isSubjective = false",
    expectFailing: /subjective mode/,
  },
  {
    id: "S1  velocity value reads calculatedMean instead of effectiveMean  [sentinel]",
    file: FORM,
    find: "? (effectiveMean > 0 ? effectiveMean.toFixed(1) : '')",
    replace: "? (effectiveMean > 0 ? calculatedMean.toFixed(1) : '')",
    // 22.2 becomes 11.1. Identical-value fixtures would not notice.
    expectFailing: /shows the EFFECTIVE props/,
  },
  {
    id: "S2  velocityMean override gets .toFixed(1) applied  [formatting asymmetry]",
    file: FORM,
    find: ": velocityMean || (calculatedMean > 0 ? calculatedMean.toFixed(1) : '')",
    replace:
      ": (velocityMean ? Number(velocityMean).toFixed(1) : '') || (calculatedMean > 0 ? calculatedMean.toFixed(1) : '')",
    // '55.55' would become '55.6'. Only a non-integer sentinel catches this.
    expectFailing: /does NOT reformat it/,
  },
  {
    id: "S3  adjusted variability reads calculatedStdDev instead of effectiveStdDev  [sentinel]",
    file: FORM,
    find: "isAdjusterActive\n                ? effectiveStdDev.toFixed(1)",
    replace: "isAdjusterActive\n                ? calculatedStdDev.toFixed(1)",
    // 44.4 becomes 33.3 while the panel is open.
    expectFailing: /takes over the variability field/,
  },
  {
    id: "S4  backlog reset link offers lastSprintBacklog instead of the derived value",
    file: FORM,
    find: "Reset to {derivedBacklogFromIncluded.toLocaleString()}",
    replace: "Reset to {lastSprintBacklog?.toLocaleString()}",
    // 888 becomes 777 — two distinct sentinels for two props that are easy to confuse.
    expectFailing: /offers the derived value/,
  },
  {
    // ⚠️ RE-AIMED AFTER A SURVIVOR, AND THE SURVIVOR IS THE FINDING.
    // This probe first read `sprints.length >= 2` -> `>= 1` and SURVIVED: the
    // suite went green with the threshold relaxed. `VelocitySparkline` carries
    // its own `if (data.length < 2) return null`, so the outer guard is
    // redundant and no fixture can distinguish the two — the site is executed
    // but unpinnable through this component. The suite's own comment header
    // records it. The mode leg below is the half that IS pinned, so that is
    // what this probe now tests.
    id: "S5  sparkline loses its history-mode guard  [presence, re-aimed after a survivor]",
    file: FORM,
    find: "{!isSubjective && sprints.length >= 2 && (",
    replace: "{sprints.length >= 2 && (",
    expectFailing: /withdraws every history-only affordance/,
  },
  {
    id: "S6  cadence plural suffix dropped  [plural logic]",
    file: FORM,
    find: "`${sprintCadenceWeeks} Week${sprintCadenceWeeks > 1 ? 's' : ''}`",
    replace: "`${sprintCadenceWeeks} Week`",
    expectFailing: /cadence singular, plural, or as an em dash/,
  },
  {
    id: "S7  hasOverrides drops its multiplier leg  [one leg of a compound condition]",
    file: FORM,
    find: "volatilityMultiplier !== DEFAULT_VOLATILITY_MULTIPLIER\n\n  const handleResetOverrides",
    replace: "false\n\n  const handleResetOverrides",
    // The other two legs still hold, so only the multiplier-only fixture fails —
    // which is why that test renders each leg in isolation.
    expectFailing: /surfaces the reset link for any single override source/,
  },
  {
    id: "S8  expanding the adjuster no longer clears the manual SD  [callback contract]",
    file: FORM,
    find: "      onVelocityStdDevChange('')\n      setAdjusterOpen(true)",
    replace: "      setAdjusterOpen(true)",
    expectFailing: /opens on Adjust/,
  },
];
