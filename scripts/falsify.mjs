// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification runner — prove a test can FAIL, not merely that it passes.
//
// Break the thing a guard protects, then confirm the NAMED test fails. Every guard in the
// v0.60.0 campaign and everything since was confirmed this way; it is the only technique
// that distinguishes a real guard from a test that happens to be green.
//
// ── WHY THIS IS A COMMITTED TOOL AND NOT A SCRATCH SCRIPT ──────────────────────────────
// It was a scratch script, and on 2026-08-02 it produced a WRONG ANSWER that looked right.
// A mutation swapped a JSX opening tag but not its closing tag, so the file no longer
// parsed; vitest reported a transform error, ran ZERO tests, and the runner counted "0
// failing" — which reads as SURVIVOR. A strong test looked weak.
//
// ⚠️ That is the THIRD instance of the same defect inside this project's measurement
// tooling:
//     1. `cc`'s region mode reported a parse error as `cc 0`
//     2. `cc`'s suppression filter reported "no functions" for suppressed functions
//     3. this runner reported a non-compiling mutant as "0 failing"
// All three share one signature: A TOOL THAT CANNOT DO ITS JOB RETURNS THE VALUE IT
// RETURNS WHEN THERE IS NOTHING TO REPORT. Absence of a result is indistinguishable from a
// null result. It is not three coincidences — it is a design defect the tooling keeps
// reproducing, so the fix belongs in the tool, not in the operator's memory.
//
// ⚠️ The direction is NOT the same across the four, and the difference matters. `cc`'s two
// failures flattered the CODE; this runner's two make the TEST look weak. "Be suspicious of
// good news" catches the former and misses the latter — and the defaming direction is the
// more dangerous one, because a result that criticises your own work does not get audited.
// Wasteful if you respond by writing more tests; actively dangerous if falsification is ever
// used to justify DELETING a test as redundant.
//
// THE GUARD: every mutated run must execute the SAME NUMBER OF TESTS as the baseline. A
// run with no test summary at all, or with a different total, cannot be compared and
// ABORTS rather than reporting. Pure halves are exported and guarded by
// src/integration/falsify-runner.test.ts.
//
// USAGE
//   node scripts/falsify.mjs <spec.mjs>
//
// The spec module exports:
//   export const testFile = "src/ui/pages/ProjectPage.test.tsx";
//   export const mutations = [
//     { id, file, find, replace, expectFailing: /regex/, also?: { find, replace } },
//   ];
//
// `also` applies a second paired edit in the same mutation — needed when a single logical
// change spans two places, e.g. a JSX element's opening AND closing tag. That pairing is
// exactly what the first broken mutation lacked.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Total tests vitest reported, or null when there is no summary line at all.
 *
 * null is the signal that matters: a file that fails to transform produces an error and no
 * summary, which is precisely the case this tool used to misread as a survivor.
 */
export function parseTestTotal(out) {
  const m = /Tests\s+[^\n(]*\((\d+)\)/.exec(out);
  return m ? Number(m[1]) : null;
}

/** Test names vitest's verbose reporter marked as failed. */
export function parseFailedNames(out) {
  return [...out.matchAll(/^\s*[×✗]\s+(.*?)(?:\s+\d+ms)?$/gm)].map((m) => m[1].trim());
}

/** How many times `needle` occurs in `haystack`. Plain substring count, no regex. */
export function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/**
 * Is a mutation's needle safe to apply?
 *
 * ⚠️ FOURTH INSTANCE OF THIS PROJECT'S TOOLING DEFECT, found the day the third was fixed.
 * `String.replace(string, …)` rewrites the FIRST occurrence only. A needle that appears
 * twice — trivially common, because sibling functions share lines like
 * `const sortedOriginal = Float64Array.from(samples).sort();` — silently mutates the wrong
 * function. If that other function is untested, the run comes back green and reads as
 * "the test did not catch it": a MISAPPLIED mutation, indistinguishable from a weak test,
 * and once again failing in the direction that makes a strong test look weak.
 *
 * Three of nine mutations in the analytics spec landed in `bootstrapPercentileCI` instead
 * of `computeBatchPercentileCIs` this way, and all three read as survivors.
 *
 * So a needle must match EXACTLY ONCE. Ambiguity is not a weaker signal; it is no signal.
 */
export function checkNeedleUnique(source, needle, label) {
  const n = countOccurrences(source, needle);
  if (n === 1) return { ok: true };
  if (n === 0) {
    return { ok: false, reason: `${label} not found — the edit would have silently no-opped` };
  }
  return {
    ok: false,
    reason:
      `${label} matches ${n} places — String.replace would rewrite only the FIRST, ` +
      `probably in a different function. Extend the needle with surrounding context ` +
      `until it is unique.`,
  };
}

/**
 * Is a mutated run comparable to the baseline at all?
 *
 * Answers only "can this run be interpreted", never "did the mutation survive". A run that
 * executed a different number of tests than the baseline is not weaker evidence — it is no
 * evidence, and must stop the tool rather than flow into a verdict.
 */
export function checkRunComparable(baselineTotal, mutantTotal) {
  if (mutantTotal === null) {
    return {
      ok: false,
      reason:
        "no test summary — the mutant almost certainly failed to compile, so NOTHING RAN. " +
        '"0 failing" here would read as a survivor and mean the opposite.',
    };
  }
  if (mutantTotal !== baselineTotal) {
    return {
      ok: false,
      reason: `ran ${mutantTotal} tests, baseline ran ${baselineTotal} — the run is not comparable`,
    };
  }
  return { ok: true };
}

function runTests(testFile) {
  try {
    return {
      code: 0,
      out: execFileSync("npx", ["vitest", "run", testFile, "--reporter=verbose"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Apply one mutation's edits, asserting each needle exists and the file really changed. */
function applyMutation(m) {
  const before = readFileSync(m.file, "utf8");
  const edits = [{ find: m.find, replace: m.replace }, ...(m.also ? [m.also] : [])];
  let after = before;
  for (const [i, e] of edits.entries()) {
    // Existence is not enough — the needle must be UNIQUE, or the wrong site gets mutated
    // and the run reads as a survivor. See checkNeedleUnique.
    const unique = checkNeedleUnique(after, e.find, `needle ${i + 1}`);
    if (!unique.ok) return unique;
    after = after.replace(e.find, e.replace);
  }
  if (after === before) return { ok: false, reason: "the edits produced no change" };
  writeFileSync(m.file, after);
  if (readFileSync(m.file, "utf8") === before) {
    return { ok: false, reason: "file on disk unchanged after write" };
  }
  return { ok: true };
}

/** Abort with a message. Every exit path here is loud, never a silent fall-through. */
function abort(message, detail) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(1);
}

/** Run one mutation end to end and report whether the NAMED test failed. */
function runOneMutation(m, testFile, baselineTotal) {
  const backup = `${m.file}.falsify-backup`;
  copyFileSync(m.file, backup);

  const applied = applyMutation(m);
  if (!applied.ok) {
    copyFileSync(backup, m.file);
    rmSync(backup);
    abort(`${m.id}\n   ✖ ${applied.reason}. ABORT.`);
  }

  const res = runTests(testFile);
  copyFileSync(backup, m.file);
  rmSync(backup);

  // ⚠️ Comparability BEFORE verdict. This is the check whose absence produced a wrong
  // answer on 2026-08-02: a non-compiling mutant ran zero tests and read as a survivor.
  const comparable = checkRunComparable(baselineTotal, parseTestTotal(res.out));
  if (!comparable.ok) {
    abort(`${m.id}\n   ✖ UNINTERPRETABLE: ${comparable.reason}. ABORT.`, res.out.slice(-1500));
  }

  const failed = parseFailedNames(res.out);
  const matched = failed.filter((n) => m.expectFailing.test(n));
  const ok = res.code !== 0 && matched.length > 0;
  console.log(
    `${ok ? "✔" : "✖"} ${m.id}\n   exit ${res.code}, ${failed.length} failing; named-match ${matched.length}`
  );
  if (!ok && failed.length) console.log(`   OTHER FAILURES: ${JSON.stringify(failed.slice(0, 5))}`);
  return ok;
}

async function main() {
  const [specArg] = process.argv.slice(2);
  if (!specArg) {
    console.error("usage: node scripts/falsify.mjs <spec.mjs>");
    process.exit(2);
  }
  const { testFile, mutations } = await import(
    pathToFileURL(path.resolve(ROOT, specArg)).href
  );

  const baseline = runTests(testFile);
  const baselineTotal = parseTestTotal(baseline.out);
  if (baseline.code !== 0 || baselineTotal === null) {
    abort(
      "BASELINE IS NOT GREEN — stop. Mutation results would be meaningless.",
      baseline.out.slice(-3000)
    );
  }
  console.log(`baseline: ${baselineTotal} tests, exit 0\n`);

  let allOk = true;
  for (const m of mutations) {
    if (!runOneMutation(m, testFile, baselineTotal)) allOk = false;
  }

  const restored = runTests(testFile);
  console.log(`\nrestored: exit ${restored.code}, ${parseTestTotal(restored.out)} tests`);
  if (restored.code !== 0) {
    abort("RESTORE FAILED — sources are not back to baseline.");
  }
  process.exit(allOk ? 0 : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
