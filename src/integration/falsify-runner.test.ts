// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";

import {
  parseTestTotal,
  parseFailedNames,
  checkRunComparable,
  countOccurrences,
  checkNeedleUnique,
} from "../../scripts/falsify.mjs";

/**
 * Guard for the falsification runner's comparability check.
 *
 * ⚠️ WHY THIS EXISTS. On 2026-08-02 the runner produced a wrong answer that looked right: a
 * mutation swapped a JSX opening tag but not its closing tag, the file stopped parsing,
 * vitest ran ZERO tests, and the runner counted "0 failing" — which reads as SURVIVOR. A
 * strong test looked weak.
 *
 * That was the THIRD instance of the same defect inside this project's tooling — `cc`'s
 * region mode reporting a parse error as cc 0, `cc`'s suppression filter reporting "no
 * functions", and this. All three share one signature: a tool that cannot do its job
 * returns the value it returns when there is nothing to report, so ABSENCE OF A RESULT is
 * indistinguishable from a NULL RESULT.
 *
 * The rule the project keeps re-learning is that knowing about this confers no immunity —
 * only guards do. So the fix lives in the tool, and this file proves the fix can fail.
 */

// A real transform failure produces no "Tests" summary line at all.
const TRANSFORM_ERROR_OUTPUT = `
 RUN  v4.1.6 /repo

Error: Transform failed with 1 error:
/repo/src/ui/components/ScenarioTabs.tsx:189:10: ERROR: Unexpected closing "button" tag does not match opening "span" tag
`;

const GREEN_OUTPUT = ` Test Files  1 passed (1)
      Tests  25 passed (25)`;

const RED_OUTPUT = ` × src/x.test.tsx > suite > a keyboard user can focus a scenario tab 12ms
 Test Files  1 failed (1)
      Tests  1 failed | 24 passed (25)`;

describe("parseTestTotal", () => {
  it("reads the total from an all-passing run", () => {
    expect(parseTestTotal(GREEN_OUTPUT)).toBe(25);
  });

  it("reads the total from a run with failures, not just the passing count", () => {
    expect(parseTestTotal(RED_OUTPUT)).toBe(25);
  });

  it("RETURNS NULL WHEN NOTHING RAN — the case that produced the wrong answer", () => {
    // The whole point. If this returned 0, "0 failing" would be indistinguishable from a
    // surviving mutant, which is exactly the bug being guarded.
    expect(parseTestTotal(TRANSFORM_ERROR_OUTPUT)).toBeNull();
  });
});

describe("parseFailedNames", () => {
  it("extracts the named failing test", () => {
    expect(parseFailedNames(RED_OUTPUT)).toEqual([
      "src/x.test.tsx > suite > a keyboard user can focus a scenario tab",
    ]);
  });

  it("returns nothing for a green run", () => {
    expect(parseFailedNames(GREEN_OUTPUT)).toEqual([]);
  });
});

describe("checkRunComparable", () => {
  it("accepts a run that executed the same number of tests as the baseline", () => {
    expect(checkRunComparable(25, 25).ok).toBe(true);
  });

  it("REJECTS a run that never produced a summary, rather than reading it as zero failures", () => {
    const result = checkRunComparable(25, parseTestTotal(TRANSFORM_ERROR_OUTPUT));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/failed to compile|NOTHING RAN/i);
  });

  it("rejects a run whose test count drifted, in either direction", () => {
    expect(checkRunComparable(25, 24).ok).toBe(false);
    expect(checkRunComparable(25, 26).ok).toBe(false);
  });

  it("a rejection always carries a reason, so an abort is never silent", () => {
    for (const mutantTotal of [null, 0, 24, 26]) {
      const result = checkRunComparable(25, mutantTotal);
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });
});

/**
 * ⚠️ FOURTH INSTANCE, found the same day the third was fixed — in the tool that fixed it.
 *
 * `String.replace(string, …)` rewrites only the FIRST occurrence. A needle appearing twice
 * silently mutates the wrong site; if that site is untested the run comes back green and
 * reads as "the test did not catch it". Three of nine mutations in the analytics spec landed
 * in `bootstrapPercentileCI` instead of `computeBatchPercentileCIs` exactly this way, and
 * all three were reported as survivors.
 *
 * ⚠️ NOT the same DIRECTION as instances 1-2, and the distinction is load-bearing. `cc`'s two
 * failures flattered the CODE; these two make the TEST look weak. So "be suspicious when
 * results look good" would have caught those and missed these — and the defaming direction is
 * the more dangerous, because a result that criticises your own work does not get audited.
 * What all four share is direction-agnostic: THE TOOL RETURNS THE VALUE IT WOULD RETURN IF
 * THERE WERE GENUINELY NOTHING TO REPORT. Existence was checked; uniqueness was not.
 */
describe("countOccurrences", () => {
  it("counts a unique needle once", () => {
    expect(countOccurrences("alpha beta", "beta")).toBe(1);
  });

  it("counts every occurrence, not just the first", () => {
    expect(countOccurrences("x = 1;\nx = 1;\n", "x = 1;")).toBe(2);
  });

  it("does not count overlapping matches twice", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
  });

  it("returns 0 for an absent needle, and for an empty one", () => {
    expect(countOccurrences("abc", "zzz")).toBe(0);
    expect(countOccurrences("abc", "")).toBe(0);
  });
});

describe("checkNeedleUnique", () => {
  const twoSiblings = [
    "function a() {",
    "  const sorted = Float64Array.from(samples).sort();",
    "}",
    "function b() {",
    "  const sorted = Float64Array.from(samples).sort();",
    "}",
  ].join("\n");

  it("accepts a needle that matches exactly once", () => {
    expect(checkNeedleUnique(twoSiblings, "function b() {", "needle 1").ok).toBe(true);
  });

  it("REJECTS A DUPLICATED NEEDLE — the case that produced three false survivors", () => {
    // The whole point. Existence alone was the old check, and this input passes it.
    const result = checkNeedleUnique(
      twoSiblings,
      "  const sorted = Float64Array.from(samples).sort();",
      "needle 1",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/matches 2 places/);
    expect(result.reason).toMatch(/FIRST/);
  });

  it("rejects an absent needle with a different reason than a duplicated one", () => {
    const missing = checkNeedleUnique(twoSiblings, "function c() {", "needle 1");
    expect(missing.ok).toBe(false);
    expect(missing.reason).toMatch(/not found/);
    expect(missing.reason).not.toMatch(/matches/);
  });

  it("names the needle in the reason, so a multi-edit mutation says WHICH one failed", () => {
    const result = checkNeedleUnique(twoSiblings, "nope", "needle 2");
    expect(result.reason).toMatch(/^needle 2 /);
  });
});
