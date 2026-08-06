// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Measure cognitive complexity — including for code that does not exist yet.
//
// WHY THIS EXISTS
// `npm run lint` only tells you which functions are OVER the threshold of 15, and by
// how much. It cannot answer the two questions that actually decide a refactor:
//
//   1. What does every function in this file measure, including the ones passing?
//   2. What WOULD this block of code measure if I lifted it into its own function?
//
// Question 2 is the valuable one. It lets a decomposition be measured before a single
// line moves. Every target in the v0.60.0 quality campaign was set this way — and it
// caught a recipe that would have burned 18–26 h to land a residual of 23 instead of
// the predicted 6.
//
// HOW IT WORKS
// ESLint's Node API, against THIS repo's own config, with
// `sonarjs/cognitive-complexity` overridden to threshold 0 so every function reports
// rather than only the failing ones. Region measurement wraps the requested lines in a
// bare function shell and lints it as TEXT via `lintText`, using a synthetic sibling
// path so the real config and parser still apply. Nothing is ever written to disk, so
// there is no untracked file for the copyright-header guard to fail on and no risk of
// a scratch probe being committed by accident.
//
// USAGE
//   node scripts/measure-complexity.mjs src/core/schedule/deterministic.ts
//   node scripts/measure-complexity.mjs src/core/schedule/deterministic.ts 282-380
//
// The second form answers "if I lifted lines 282–380 into their own function, what
// would it cost?" — references to outer-scope variables are irrelevant, because
// cognitive complexity is computed from the AST and this config is not type-aware.
//
// ── SUPPRESSED FUNCTIONS ARE MEASURED, AND MARKED ──────────────────────────────────
// This script used to report NOTHING for a function carrying an in-file
// `eslint-disable-next-line sonarjs/cognitive-complexity`, and then print
// "no functions reported (every function measures 0)" — a statement it had not checked.
// `lintText` honours inline directives, so the finding was filtered out before counting.
// Measured 2026-08-01: `firestore-migration.ts` reported 0 functions while hiding cc 21,
// and `migrations.ts` reported 16 while hiding cc 18. Both are targets of the very
// decomposition work this tool exists to size — and it failed in the SAFE-LOOKING
// direction, which is the shape of every harness bug this project has had.
//
// The fix is deliberately NOT an opt-in flag. A flag reintroduces the same failure for
// anyone who does not know to pass it, and the whole point of this tool is that its
// default answer is the true one. Instead it lints TWICE — once ignoring inline
// directives (authoritative), once honouring them (what `npm run lint` would surface) —
// and marks any finding present in the first but absent from the second as
// `[suppressed]`. Suppression becomes visible information rather than missing
// information.
//
// Guarded by src/integration/measure-complexity.test.ts, which fails if a suppressed
// function ever goes unreported again.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const { ESLint } = createRequire(path.join(ROOT, "package.json"))("eslint");

// Two instances differing ONLY in whether in-file `eslint-disable` directives apply.
// `allowInlineConfig` is a real behavioural switch here, not a no-op: verified against
// firestore-migration.ts, which yields 0 cognitive-complexity messages with it left at
// its default and 1 (L58, cc 21) with it off.
const makeESLint = (allowInlineConfig) =>
  new ESLint({
    cwd: ROOT,
    allowInlineConfig,
    overrideConfig: { rules: { "sonarjs/cognitive-complexity": ["error", 0] } },
  });

const authoritative = makeESLint(false); // every function's TRUE complexity
const asLintSeesIt = makeESLint(true); // only what `npm run lint` would surface

/**
 * Cognitive-complexity findings for a source string, from one ESLint instance.
 * `filePath` decides which config block applies, so it must be a real in-repo path
 * (or a synthetic sibling of one) with the right extension.
 */
async function findings(eslint, code, filePath) {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });

  // A parse failure produces a `fatal` message and NO rule messages — which, filtered
  // for cognitive-complexity, is indistinguishable from "every function measures 0".
  // That is the same shape as the three harness failures documented in
  // scripts/mutation-run.mjs, so it fails loudly here rather than reporting a zero.
  // It matters most in region mode, where slicing arbitrary lines easily yields code
  // that does not parse.
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) {
    throw new Error(
      `PARSE ERROR at line ${fatal.line}: ${fatal.message}\n` +
        `The measured text is not valid syntax, so no complexity could be computed.\n` +
        `In region mode this usually means the line range starts or ends mid-statement — ` +
        `pick a range that is a whole set of statements.`,
    );
  }

  const lines = code.split("\n");
  return result.messages
    .filter((m) => m.ruleId === "sonarjs/cognitive-complexity")
    .map((m) => {
      const cc = Number(/from (\d+) to the/.exec(m.message)?.[1] ?? NaN);
      const src = lines[m.line - 1] ?? "";
      // Both patterns are ANCHORED at the start of the line. An unanchored
      // `([A-Za-z0-9_$]+)\s*[:(]` is quadratic on a long line with no match — the
      // sonarjs/slow-regex shape — and this runs over every reported line.
      const name =
        /^\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/.exec(src)?.[1] ??
        /^\s*([A-Za-z0-9_$]+)\s*[:(]/.exec(src)?.[1] ??
        `L${m.line}`;
      return { line: m.line, column: m.column, cc, name };
    });
}

/**
 * Per-function cognitive complexity for a source string, highest first.
 *
 * Every function is measured, including ones whose finding is suppressed by an in-file
 * `eslint-disable`; those carry `suppressed: true`. Keyed on line AND column, because
 * two functions can legally start on the same line.
 *
 * @returns {Promise<Array<{line:number,column:number,cc:number,name:string,suppressed:boolean}>>}
 */
export async function measure(code, filePath) {
  const all = await findings(authoritative, code, filePath);
  const visible = await findings(asLintSeesIt, code, filePath);
  const visibleKeys = new Set(visible.map((r) => `${r.line}:${r.column}`));

  return all
    .map((r) => ({ ...r, suppressed: !visibleKeys.has(`${r.line}:${r.column}`) }))
    .sort((a, b) => b.cc - a.cc);
}

async function main() {
  const [target, region] = process.argv.slice(2);
  if (!target) {
    console.error("usage: node scripts/measure-complexity.mjs <file> [startLine-endLine]");
    process.exit(2);
  }

  const absolute = path.resolve(ROOT, target);
  const source = readFileSync(absolute, "utf-8");

  if (region) {
    const [start, end] = region.split("-").map(Number);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      console.error(`bad region "${region}" — expected startLine-endLine, e.g. 282-380`);
      process.exit(2);
    }
    const body = source.split("\n").slice(start - 1, end).join("\n");
    const ext = path.extname(absolute);
    const probePath = path.join(path.dirname(absolute), `_probe_measure${ext}`);
    const rows = await measure(`function _region() {\n${body}\n}\n`, probePath);
    const outer = rows.find((r) => r.line === 1);
    console.log(`${target} lines ${start}-${end} lifted standalone: cc ${outer ? outer.cc : 0}`);
    for (const r of rows.filter((r) => r.line !== 1)) {
      console.log(`  nested: ${r.name} = ${r.cc}`);
    }
    return;
  }

  const rows = await measure(source, absolute);
  if (rows.length === 0) {
    // Now a claim this script has actually checked: inline directives cannot hide a
    // finding from the authoritative pass, so an empty result really is an empty result.
    console.log(`${target}: no function in this file scores above 0`);
  }
  for (const r of rows) {
    const over = r.cc > 15 ? "  <-- over threshold" : "";
    const hidden = r.suppressed ? "  [suppressed]" : "";
    console.log(`${String(r.cc).padStart(4)}  L${String(r.line).padEnd(5)}  ${r.name}${over}${hidden}`);
  }
  const suppressed = rows.filter((r) => r.suppressed).length;
  const note = suppressed > 0 ? ` (${suppressed} suppressed by an in-file eslint-disable)` : "";
  console.log(`\n${rows.length} functions reported${note}`);
}

// Run only when invoked as a CLI, so the module can be imported by its guard test.
// ⚠️ If this predicate is ever wrong, `npm run cc` silently does nothing — exactly the
// failure class this file's header is about. It is exercised on every real invocation.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
