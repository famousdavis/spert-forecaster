#!/usr/bin/env node
// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SPERT® Suite ship gate — the release-tier gate, run as `npm run shipgate`.
 *
 * WHY THIS EXISTS
 *
 * There is no CI in any SPERT® Suite repository. A green `gh pr checks` means
 * Vercel built a preview — nothing more. Tests are not run by any automation on
 * push, on PR, or on merge, so a branch whose entire suite fails shows all-green
 * and merges cleanly. The gate has been a convention executed by whoever is at
 * the keyboard, and the defects it missed shipped to production for months.
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

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
// ─────────────────────────────────────────────────────────────────────────────
const claudeMd = readIfPresent('CLAUDE.md')
if (config.claudeMdVersionPatterns?.length) {
  console.log(`\n${BOLD}CLAUDE.md currency${RESET}`)
  if (claudeMd === null) {
    // Absent in CI — it is gitignored and never checked out there.
    console.log(`  ${DIM}– CLAUDE.md not present, skipping${RESET}`)
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
