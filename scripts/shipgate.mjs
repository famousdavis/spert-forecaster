#!/usr/bin/env node
// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SPERT® Suite ship gate — the release-tier gate, run as `npm run shipgate`.
 *
 * WHY THIS EXISTS
 *
 * This gate began as a convention executed by whoever was at the keyboard, and
 * the defects it missed shipped to production for months. It is now also run by
 * CI: every repo carries `.github/workflows/shipgate.yml`, so a green
 * `gh pr checks` means this gate ran — not merely that Vercel built a preview.
 *
 * CI and a local run are COMPLEMENTARY, not ranked. CI's advantage is an empty
 * tree: it catches anything that silently depends on a gitignored or generated
 * file being present locally. It also has LESS of the tree — `CLAUDE.md` is
 * gitignored, so where a repo configures a CLAUDE.md currency check that check
 * self-skips under CI, and only a local run can catch that drift. Neither is a
 * terminal condition alone.
 *
 * TWO TIERS
 *
 * `npm test` holds the always-true guards — the public changelog is in sync, the
 * LICENSE matches canonical, every changelog entry renders with content in it.
 * Those must be green at every moment of development.
 *
 * This script is the release tier. It runs the full suite plus the checks that
 * are only meaningfully true at a release boundary: every version surface agrees,
 * and CLAUDE.md is not making a stale claim. Keeping them here rather than in
 * vitest is deliberate — asserting "the newest changelog entry matches
 * APP_VERSION" inside the test suite would fail from the moment the version is
 * bumped until the entry is written, which taxes ordinary development for no
 * gain. At a release boundary it is exactly the right assertion.
 *
 * THE `expectProblems` TRADE
 *
 * Where a command sets `expectProblems`, this script gates on the NUMBER and not
 * on the exit code — that branch ends in `continue`, so `exitCode === 0` is never
 * reached for that step. Deliberate, and for OPPOSITE reasons across the suite:
 * where lint carries errors it exits non-zero at an accepted baseline, so exit-code
 * gating is too STRICT; where a baseline is all warnings it exits zero, so exit-code
 * gating is too LAX and would let new warnings in silently. One mechanism, two
 * rationales.
 *
 * The trade runs both ways. Such a step FAILS when a problem appears and when one is
 * resolved unaccounted for; it PASSES on a new error that leaves the total unchanged.
 * The number matched is ESLint's ALL-RULE total, not any single rule's count, so a
 * baseline set for one rule moves when an unrelated warning appears.
 *
 * At a true zero, ESLint prints no problem-count line at all and the step fails with
 * "could not read a problem count". Delete the key; never set it to 0.
 *
 * SHAPE
 *
 * Every repo-specific detail lives in `shipgate.config.json`, so this file is
 * intended to be byte-identical across all nine repositories. Do not fork it per
 * repo — add a config key instead.
 *
 * Usage:
 *   npm run shipgate            full gate
 *   npm run shipgate -- --checks-only    skip the lint/test/build commands
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()
const CONFIG_PATH = join(ROOT, 'shipgate.config.json')

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

const failures = []

function pass(label, detail) {
  const suffix = detail ? ` ${DIM}${detail}${RESET}` : ''
  console.log(`  ${GREEN}✓${RESET} ${label}${suffix}`)
}

function fail(label, detail) {
  console.log(`  ${RED}✗${RESET} ${label}`)
  if (detail) console.log(`      ${detail.split('\n').join('\n      ')}`)
  failures.push(label)
}

function readIfPresent(relPath) {
  const full = join(ROOT, relPath)
  return existsSync(full) ? readFileSync(full, 'utf-8') : null
}

/**
 * Read a gitignored file from the MAIN worktree when this is a linked one.
 *
 * `git worktree add` copies tracked files only, so `CLAUDE.md` — gitignored in
 * every SPERT repo — is absent from every worktree. G7 below used to read that
 * absence and skip, which silently disabled the version check in exactly the
 * workflow the release process mandates. Measured 2026-09-04: a gate run from a
 * worktree printed the skip line and passed green, in all nine repos.
 *
 * `--git-dir` and `--git-common-dir` are equal in a normal clone and differ in a
 * linked worktree, where the common dir is the main repo's `.git`. Its parent is
 * the main worktree root. Returns null when this is not a linked worktree, when
 * the file is not there either, or when git cannot answer.
 */
function readFromMainWorktree(relPath) {
  try {
    const git = (args) =>
      execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim()
    const commonDir = git(['rev-parse', '--git-common-dir'])
    if (git(['rev-parse', '--git-dir']) === commonDir) return null
    const full = join(resolve(ROOT, commonDir, '..'), relPath)
    return existsSync(full) ? readFileSync(full, 'utf-8') : null
  } catch {
    return null
  }
}

if (!existsSync(CONFIG_PATH)) {
  console.error(`shipgate: missing ${CONFIG_PATH}`)
  process.exit(2)
}
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))

console.log(`\n${BOLD}Ship gate — ${config.repo ?? 'unknown repo'}${RESET}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// G1 — version-surface coherence
//
// The lockfile carries the version in TWO places, root `.version` and
// `packages[""].version`, and both must be hand-edited. Never run `npm install`
// just to bump a version: it re-resolves carets and silently bypasses the
// 60-day dependency soak window. This has drifted in at least three repos —
// ssv (lockfile 0.2.7 vs package 0.2.9), forecaster (0.35.14 vs 0.38.1), and
// ahp (0.18.11 vs 0.18.12).
// ─────────────────────────────────────────────────────────────────────────────
console.log(`${BOLD}Version surfaces${RESET}`)

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version
console.log(`  ${DIM}package.json declares ${version}${RESET}`)

const lockRaw = readIfPresent('package-lock.json')
if (!lockRaw) {
  fail('package-lock.json is present')
} else {
  const lock = JSON.parse(lockRaw)
  const rootVersion = lock.version
  const pkgsVersion = lock.packages?.['']?.version

  if (rootVersion === version) {
    pass('package-lock.json  .version')
  } else {
    fail('package-lock.json  .version', `expected ${version}, found ${rootVersion}`)
  }

  if (pkgsVersion === version) {
    pass('package-lock.json  packages[""].version')
  } else {
    fail(
      'package-lock.json  packages[""].version',
      `expected ${version}, found ${pkgsVersion}\n` +
        'Hand-edit both fields. Do NOT run `npm install` to fix this.',
    )
  }
}

// The version constant. `spert-ahp` has no displayed constant — it renders
// CHANGELOG[0].version — so this block is skipped when the key is absent.
if (config.versionConstant) {
  const { file, export: exportName } = config.versionConstant
  const source = readIfPresent(file)
  if (source === null) {
    fail(`${exportName} constant`, `${file} does not exist`)
  } else {
    const match = source.match(
      new RegExp(`${exportName}\\s*[:=]\\s*['"\`]([^'"\`]+)['"\`]`),
    )
    if (!match) {
      fail(`${exportName} constant`, `no ${exportName} assignment found in ${file}`)
    } else if (match[1] !== version) {
      fail(
        `${exportName} constant`,
        `${file} declares ${match[1]}, package.json declares ${version}`,
      )
    } else {
      pass(`${exportName} constant`, file)
    }
  }
}

// Additional version surfaces that are neither the displayed constant nor the
// changelog — e.g. a constant stamped into exported files as provenance.
for (const extra of config.extraVersionSurfaces ?? []) {
  const source = readIfPresent(extra.file)
  if (source === null) {
    fail(`${extra.export} (${extra.file})`, 'file does not exist')
    continue
  }
  const match = source.match(
    new RegExp(`${extra.export}\\s*[:=]\\s*['"\`]([^'"\`]+)['"\`]`),
  )
  if (!match) fail(`${extra.export}`, `no assignment found in ${extra.file}`)
  else if (match[1] !== version)
    fail(
      `${extra.export} (${extra.file})`,
      `declares ${match[1]}, package.json declares ${version}` +
        (extra.note ? `\n${extra.note}` : ''),
    )
  else pass(`${extra.export}`, extra.file)
}

// Newest changelog entry. Heading formats vary across the suite — the pattern
// is supplied by config rather than assumed.
if (config.changelog) {
  const { file, headingPattern } = config.changelog
  const md = readIfPresent(file)
  if (md === null) {
    fail('changelog', `${file} does not exist`)
  } else {
    const re = new RegExp(headingPattern, 'm')
    const match = md.match(re)
    if (!match) {
      fail('newest changelog entry', `no heading in ${file} matched ${headingPattern}`)
    } else if (match[1] !== version) {
      fail(
        'newest changelog entry',
        `${file} newest entry is ${match[1]}, package.json declares ${version}\n` +
          'Write the changelog entry for this version before shipping.',
      )
    } else {
      pass('newest changelog entry', `${file} → ${match[1]}`)
    }
  }
}

// Changelog surfaces the declared file does not cover.
//
// `changelog.file` names exactly ONE path, so every other copy of the changelog
// in a repo was invisible to this gate: a release could pass green with the
// in-app changelog or the served copy left stale. That is precisely the drift
// this script exists to prevent, sitting just outside what it had been told to
// look at. Six of the nine repos had at least one such surface.
//
//   match: 'identical'    — a byte-for-byte copy of `changelog.file`.
//                           public/CHANGELOG.md is NOT a backup: spert-story-map's
//                           ChangelogView.tsx does fetch('/CHANGELOG.md') at runtime,
//                           so the served copy is the surface users actually read and
//                           the root copy is the one nothing renders.
//
//   match: 'firstVersion' — an in-app data file whose FIRST `version: 'X.Y.Z'` must
//                           equal package.json, i.e. the newest entry. Supply
//                           `pattern` to override the shape for an unusual file.
//
// Repo-specific detail belongs in shipgate.config.json, never here — this file
// stays byte-identical across all nine repositories.
if (config.changelog?.extraSurfaces?.length) {
  const canonicalPath = config.changelog.file
  const canonical = readIfPresent(canonicalPath)

  for (const surface of config.changelog.extraSurfaces) {
    const label = `changelog surface ${surface.file}`
    const source = readIfPresent(surface.file)

    if (source === null) {
      fail(label, 'file does not exist')
      continue
    }

    if (surface.match === 'identical') {
      if (canonical === null) {
        fail(label, `cannot compare — ${canonicalPath} is missing`)
      } else if (source !== canonical) {
        fail(
          label,
          `differs from ${canonicalPath}\n` +
            `  fix: cp ${canonicalPath} ${surface.file}` +
            (surface.note ? `\n  ${surface.note}` : ''),
        )
      } else {
        pass('changelog surface', `${surface.file} identical to ${canonicalPath}`)
      }
      continue
    }

    if (surface.match === 'firstVersion') {
      const pattern = surface.pattern ?? `version\\s*:\\s*['"](\\d+\\.\\d+\\.\\d+)['"]`
      const match = source.match(new RegExp(pattern))
      if (!match) {
        fail(label, `no version assignment matched ${pattern}`)
      } else if (match[1] !== version) {
        fail(
          label,
          `newest entry is ${match[1]}, package.json declares ${version}\n` +
            '  Add the in-app changelog entry for this version before shipping.' +
            (surface.note ? `\n  ${surface.note}` : ''),
        )
      } else {
        pass('changelog surface', `${surface.file} → ${match[1]}`)
      }
      continue
    }

    fail(label, `unknown match mode ${JSON.stringify(surface.match)} — expected 'identical' or 'firstVersion'`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G7 — CLAUDE.md currency
//
// CLAUDE.md is gitignored in every SPERT repo, and `grep` in the Claude Code
// shell is a function that filters out gitignored files — so the ship gate's
// consistency grep has never been able to see version drift inside it. GanttApp's
// sat 13 releases stale for months as a result. This reads the file directly.
//
// Only declared version-claim patterns are checked. Historical prose such as
// "v2.5.6 cleared nine GHSAs" is correct as written and must not be flagged.
//
// ABSENCE HAS TWO CAUSES AND ONLY ONE IS BENIGN. In CI the file is genuinely
// never checked out, and skipping is right. In a linked worktree it is absent
// only because `git worktree add` does not copy gitignored files — there the
// check must still run, against the main worktree's copy. Treating those two
// alike is what let a mandated workflow disable this check without saying so,
// so an absence that is neither is now a FAILURE rather than a skip.
// ─────────────────────────────────────────────────────────────────────────────
const claudeMd = readIfPresent('CLAUDE.md') ?? readFromMainWorktree('CLAUDE.md')
if (config.claudeMdVersionPatterns?.length) {
  console.log(`\n${BOLD}CLAUDE.md currency${RESET}`)
  if (claudeMd === null && process.env.CI) {
    // Genuinely absent: gitignored, and never checked out by actions/checkout.
    console.log(`  ${DIM}– CI: CLAUDE.md is never checked out, skipping${RESET}`)
  } else if (claudeMd === null) {
    fail(
      'CLAUDE.md currency',
      'declared in shipgate.config.json, but the file was not found and this is not CI.\n' +
        'It is gitignored, so `git worktree add` does not copy it, and the main-worktree\n' +
        'lookup did not find it either. Restore CLAUDE.md, or run the gate from the main\n' +
        'clone. Skipping here would silently disable the version check.',
    )
  } else {
    for (const pattern of config.claudeMdVersionPatterns) {
      const re = new RegExp(pattern, 'gm')
      const found = [...claudeMd.matchAll(re)]
      if (found.length === 0) {
        fail(`CLAUDE.md pattern ${pattern}`, 'declared in config but matched nothing')
        continue
      }
      const stale = found.filter((m) => m[1] !== version)
      if (stale.length === 0) {
        pass(`CLAUDE.md ${pattern}`, `${found.length} claim(s) at ${version}`)
      } else {
        fail(
          `CLAUDE.md ${pattern}`,
          stale.map((m) => `stale claim "${m[0].trim()}" — repo is at ${version}`).join('\n'),
        )
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G8 — release base freshness
//
// ONE assertion, and deliberately only one: that this clone is not BEHIND
// origin/<gitBaseBranch>. A release cut on a stale base silently omits whatever
// landed on main in the meantime, and no other check in this file can see it —
// every check above reads the working tree, which looks entirely correct.
//
// WHAT THIS STEP IS NOT. It is not a clean-tree check, and must never become
// one. This gate runs at Releasing step 5, AFTER the version and changelog edits
// and BEFORE the branch is cut, so the tree is uncommitted by design at exactly
// this moment; asserting cleanliness here would fail every release. It is also
// not the post-merge sync check — that condition does not exist yet when this
// runs. That one lives in `scripts/verify-sync.mjs` (`npm run verify:sync`),
// and the two share this config key so they cannot disagree about the branch.
//
// Being AHEAD is normal and is not reported: the release commits are ahead.
//
// A fetch failure FAILS the step rather than skipping it. The comparison reads a
// remote-tracking ref, so a swallowed fetch error would leave a stale ref being
// compared against itself — which agrees, and reads as a pass.
// ─────────────────────────────────────────────────────────────────────────────
if (config.gitBaseBranch) {
  console.log(`\n${BOLD}Release base${RESET}`)
  const baseBranch = config.gitBaseBranch

  if (process.env.CI) {
    // actions/checkout is shallow and detached: origin/<branch> is not a
    // meaningful local ref here, and a runner has no view of a developer's
    // clone in any case. Skipping loudly rather than passing silently.
    console.log(`  ${DIM}– CI checkout is shallow and detached, skipping${RESET}`)
  } else {
    const git = (args) => {
      // An argument array, not a shell string: the branch name reaches git as
      // one argv entry and can never be re-parsed as a second command.
      try {
        return { ok: true, out: execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim() }
      } catch (err) {
        return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || String(err.message) }
      }
    }

    const fetched = git(['fetch', 'origin', baseBranch, '--quiet'])
    if (!fetched.ok) {
      fail(
        `fetch origin/${baseBranch}`,
        `${fetched.out}\nThe base-freshness check reads a remote-tracking ref, so it cannot run. ` +
          'Fix the fetch or drop gitBaseBranch from shipgate.config.json — do not ship unverified.',
      )
    } else {
      const behind = git(['rev-list', '--count', `HEAD..origin/${baseBranch}`])
      if (!behind.ok) {
        fail(`compare HEAD to origin/${baseBranch}`, behind.out)
      } else if (behind.out !== '0') {
        fail(
          `not behind origin/${baseBranch}`,
          `HEAD is ${behind.out} commit(s) behind origin/${baseBranch}.\n` +
            `This release would be cut on a stale base and would omit them. Run:\n` +
            `  git pull --ff-only origin ${baseBranch}\n` +
            'A non-fast-forward means local commits the remote lacks — report it, do not force.',
        )
      } else {
        pass(`not behind origin/${baseBranch}`, 'release base is current')
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands — lint, typecheck, test, build.
//
// Lint outcome varies deliberately across the suite. spert-scheduler exits
// non-zero at an accepted baseline of 23 problems on core scheduling and
// simulation functions; that baseline is correct and must not be refactored
// away. Where `expectProblems` is set, the gate holds the NUMBER steady rather
// than gating on the exit code.
// ─────────────────────────────────────────────────────────────────────────────
if (!process.argv.includes('--checks-only')) {
  console.log(`\n${BOLD}Commands${RESET}`)

  for (const step of config.commands ?? []) {
    process.stdout.write(`  ${DIM}running ${step.run} …${RESET}\n`)
    let output = ''
    let exitCode = 0
    try {
      // `step.run` comes from this repo's own committed shipgate.config.json — not
      // from user input, argv or the network. Anyone able to edit that file can
      // already run arbitrary npm scripts. Linters that flag this (sonarjs/os-command)
      // are silenced in the consuming repo's own eslint config, NOT with a directive
      // here: a plugin-specific disable comment is a hard error in any repo that does
      // not install that plugin, and this file must stay byte-identical across all of them.
      output = execSync(step.run, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
    } catch (err) {
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`
      exitCode = err.status ?? 1
    }

    if (typeof step.expectProblems === 'number') {
      const m = output.match(/✖\s*(\d+)\s*problems?/)
      const count = m ? Number(m[1]) : null
      if (count === null) {
        fail(step.name, `could not read a problem count from ${step.run} output`)
      } else if (count !== step.expectProblems) {
        fail(
          step.name,
          `${count} problems, accepted baseline is ${step.expectProblems}.\n` +
            (count > step.expectProblems
              ? 'New problems were introduced — fix those, do not raise the baseline.'
              : 'Problems were resolved. Lower the baseline in shipgate.config.json.'),
        )
      } else {
        pass(step.name, `${count} problems, at accepted baseline`)
      }
      continue
    }

    if (exitCode === 0) {
      pass(step.name)
    } else {
      fail(step.name, output.trim().split('\n').slice(-20).join('\n'))
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('')
if (failures.length > 0) {
  console.log(`${RED}${BOLD}Ship gate FAILED${RESET} — ${failures.length} check(s):`)
  for (const f of failures) console.log(`  ${RED}✗${RESET} ${f}`)
  console.log('')
  process.exit(1)
}
console.log(`${GREEN}${BOLD}Ship gate passed${RESET} — ${config.repo ?? ''} ${version}\n`)
