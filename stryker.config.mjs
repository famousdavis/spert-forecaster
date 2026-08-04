// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// stryker.config.mjs
// Mutation testing configuration — scoped to the forecast core.
// Run with: npm run mutate <file>   (the guarded runner; see scripts/mutation-run.mjs)
// Do NOT commit Stryker output directories to source control.
//
// ⚠️ `npm run mutate` is NOT a gate step. It is a measurement tool, like the ship gate's
// hash checks are not. It never enters `npm run shipgate`.

// Named rather than exported anonymously: this repo's lint baseline is 0 errors AND
// 0 warnings under --max-warnings=0, and a bare `export default {…}` trips
// import/no-anonymous-default-export.
/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  // "json" writes reports/mutation/mutation.json — the machine-readable survivor
  // list (line, mutator, status), which is how a run is compared against a recorded
  // baseline rather than eyeballed. It is bundled in @stryker-mutator/core, no
  // plugin install. NOTE: a CLI `--reporters` flag REPLACES this list rather than
  // adding to it — same semantics as `--mutate`.
  reporters: ["html", "clear-text", "progress", "json"],
  testRunner: "vitest",
  // Removes mutants that cannot compile. Without it they report as survivors.
  checkers: ["typescript"],
  // ⚠️ NOT tsconfig.json. The checker compiles the whole program before running a
  // single mutant, and this repo has 48 pre-existing type errors in *.test.ts files
  // (none in production source) that make it crash at init — which the guarded
  // runner caught on the very first run here, 2026-08-04. tsconfig.stryker.json
  // excludes test files and nothing else; see its header for the full reasoning.
  //
  // ⚠️ Pointing this at a tsconfig that EXCLUDES a mutate target makes the checker
  // crash on the first mutant instead, with "no watcher is registered for it".
  // Whatever it points at, every target below must be inside its program.
  tsconfigFile: "tsconfig.stryker.json",
  // ⚠️ Mutate whole files, never line ranges — ranges drift under every subsequent
  // edit and the drift is silent.
  //
  // Scope chosen 2026-08-04 against the candidacy gate. These three state their
  // rules exactly ONCE — no schema, no server rule, no sibling implementation
  // re-checks them — and a wrong answer here becomes a wrong sprint date or
  // percentile in front of a user. Branch coverage at selection: monte-carlo
  // 97.95%, dates 98.11%, math 100%.
  mutate: [
    "src/features/forecast/lib/monte-carlo.ts",
    "src/shared/lib/math.ts",
    "src/shared/lib/dates.ts",
  ],
  // Run only the tests that cover the mutated files via a scoped vitest config.
  // ⚠️ Forgetting this reports every mutant as `NoCoverage` — which reads as
  // "untested" rather than "misconfigured".
  vitest: {
    configFile: "vitest.stryker.config.ts",
  },
  // Kept as INSURANCE, not as a fix for a defect observed here.
  //
  // In spert-scheduler, unlimited test-runner reuse made mutant activation go stale
  // in the reused vitest workers: the run exited 0 while nearly every mutant
  // "survived", including mutants whose covering tests directly assert the mutated
  // behavior. That failure reports as GOOD NEWS, which is what makes it dangerous.
  //
  // ⚠️ CONTROL RUN AT THIS SITE, 2026-08-04 — IT DID NOT REPRODUCE.
  // src/shared/lib/math.ts run both ways, incremental cache cleared each time:
  //     maxTestRunnerReuse: 1 → Killed 120, Timeout 4, Survived 41, NoCoverage 1
  //                             = 124/166 = 74.70%
  //     default (unlimited)   → Killed 120, Timeout 4, Survived 41, NoCoverage 1
  //                             = 124/166 = 74.70%   ← byte-identical
  // Toolchain here: Stryker 9.6.1 + vitest-runner 9.6.1 + Vitest 4.1.5 + Node 24.18
  // + TypeScript 6.0.3. Scheduler saw the collapse on Vitest 4.1.6.
  //
  // So this line buys nothing measurable in this repo today, and it is retained
  // anyway: the scoped suite is ~1.1s, so the cost is noise, and the failure it
  // prevents is silent and self-congratulatory. ⚠️ Do NOT remove it on the grounds
  // that the control was clean — the control was clean ON ONE FILE ON ONE DAY, and
  // the toolchain moves.
  //
  // If scores ever look like mass survival of obviously-killable mutants, suspect
  // runner staleness first — and delete reports/mutation/.stryker-incremental.json
  // so a poisoned incremental cache does not replay old false "Survived" results.
  // Known recovery for a sandbox "ENOENT ... chdir" crash at startup:
  // rm -rf .stryker-tmp
  maxTestRunnerReuse: 1,
  // Exclude type-only constructs that cannot be meaningfully mutated
  mutator: {
    excludedMutations: [
      "StringLiteral",   // string content changes produce equivalent mutants
      "ObjectLiteral",   // empty object mutations rarely affect behavior
    ],
  },
  // ⚠️ Consequence of the two above: DECOMPOSITION SHRINKS THE DENOMINATOR, because
  // new helper returns are object literals. A score that fell after a refactor while
  // `Survived` held is arithmetic, not a regression. Gate on whether the delta
  // reconciles mutant-by-mutant, never on either number alone.

  // Concurrency: this machine has 10 cores, so "half the CPUs" would be 5. Held at
  // 2 deliberately for the baseline — higher concurrency thrashes and inflates
  // `Timeout`, which counts as DETECTED and therefore inflates the score. The
  // scoped suite runs in ~1.1s, so the speed is not worth the risk to the number.
  // Raising this has not been tested here.
  concurrency: 2,
  // Timeout: generous for the 10,000-trial simulations in monte-carlo.test.ts
  timeoutMS: 10000,
  timeoutFactor: 2.5,
  // Output directory
  htmlReporter: {
    fileName: "reports/mutation/mutation-report.html",
  },
  // Incremental mode: cache results between runs.
  // ⚠️ Must be cleared for any run you intend to COMPARE — scripts/mutation-run.mjs
  // does that for you, which is why comparison runs go through it.
  incremental: true,
  incrementalFile: "reports/mutation/.stryker-incremental.json",
};

export default config;
