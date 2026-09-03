#!/usr/bin/env node
// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SPERT® Suite post-merge sync verification — `npm run verify:sync`.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A SHIP-GATE STEP
 *
 * The ship gate cannot host this check. `npm run shipgate` runs at Releasing
 * step 5 — after the version and changelog edits, BEFORE the branch is cut and
 * long before the squash-merge. The condition this script asserts only comes
 * into existence AFTER the merge, so a gate step asserting it would be asserting
 * something not yet true. Two checks, two moments; this is the second one.
 *
 * CI cannot host it either. What this verifies is a property of THIS CLONE — that
 * the local `main` actually advanced to the merge commit. A CI runner checks out
 * a fresh tree and has no view of a developer's working copy, so no workflow can
 * see the drift. That is precisely why the step sat unenforced: it is invisible to
 * every mechanism the suite already had.
 *
 * THE FAILURE IT EXISTS TO CATCH
 *
 * `gh pr merge` advances `origin/main` on the server. It does not touch this
 * clone's local `main`. A worktree session, or any session that merged without
 * pulling, then holds a local `main` pointing at the PREVIOUS release while every
 * report reads as though the release landed everywhere. The next release branches
 * from that stale base.
 *
 * WHY IT COMPARES SHAs RATHER THAN READING A COMMAND'S OUTPUT
 *
 * Recorded 2026-09-03: this step was reported as done from the tail of a
 * `git pull` whose fast-forward line had been cut by `| tail -3`. "Already up to
 * date." is ambiguous between "fetched, nothing new" and "did not fetch", so the
 * transcript could not distinguish a real sync from a no-op. It was in sync; the
 * report was unevidenced. RUNNING THE COMMAND IS NOT THE CHECK. Every assertion
 * below reads state after the fact, and the three-way comparison includes the
 * GitHub API so that a stale remote-tracking ref cannot make local agreement look
 * like global agreement.
 *
 * Usage:
 *   npm run verify:sync              verify the configured base branch
 *   npm run verify:sync -- --branch <name>
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

const failures = []

function pass(label, detail) {
  // Suffix computed first rather than nested inside the outer template: a nested
  // template literal is a lint error under sonarjs/no-nested-template-literals,
  // which spert-scheduler applies to scripts/. Matches shipgate.mjs's own pass().
  const suffix = detail ? ` ${DIM}${detail}${RESET}` : ''
  console.log(`  ${GREEN}✓${RESET} ${label}${suffix}`)
}

function fail(label, detail) {
  console.log(`  ${RED}✗${RESET} ${label}`)
  if (detail) console.log(`      ${detail.split('\n').join('\n      ')}`)
  failures.push(label)
}

/**
 * Run a command and return { ok, out }. `execFileSync` with an argument array is
 * used rather than a shell string on purpose: nothing here is interpolated
 * through a shell, so a branch name cannot become a second command. It also
 * sidesteps the zsh hazard recorded on 2026-09-03, where a literal path written
 * after `$VAR:` had a segment eaten by parameter modifiers.
 */
function run(file, args) {
  try {
    // `stdio: 'pipe'` is load-bearing, not tidiness: without it a failing git or
    // gh command writes its own stderr straight to the terminal, so the same error
    // appears twice — once raw and once inside a formatted ✗ line — and a reader
    // cannot tell which check it belongs to. Caught falsifying this script.
    return { ok: true, out: execFileSync(file, args, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim() }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || String(err.message) }
  }
}

// The base branch is read from the same config the ship gate uses, so the two
// checks can never disagree about which branch a release targets.
const CONFIG_PATH = join(ROOT, 'shipgate.config.json')
const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) : {}
const flagIndex = process.argv.indexOf('--branch')
const BRANCH = flagIndex !== -1 ? process.argv[flagIndex + 1] : (config.gitBaseBranch ?? 'main')

console.log(`\n${BOLD}Post-merge sync — ${config.repo ?? 'unknown repo'} (${BRANCH})${RESET}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// S1 — fetch. A failure here is reported, never swallowed: every assertion
// below reads remote-tracking refs, and a silent fetch failure would make them
// all compare a stale ref against itself and agree.
// ─────────────────────────────────────────────────────────────────────────────
const fetched = run('git', ['fetch', 'origin', '--prune', '--quiet'])
if (fetched.ok) {
  pass('git fetch origin --prune')
} else {
  fail('git fetch origin --prune', `${fetched.out}\nEvery check below reads a remote-tracking ref, so none of them can be trusted.`)
}

// ─────────────────────────────────────────────────────────────────────────────
// S2 — the three-way SHA comparison. Local, remote-tracking, and the server's
// own answer. Local-vs-tracking alone would pass while both were stale.
// ─────────────────────────────────────────────────────────────────────────────
const local = run('git', ['rev-parse', BRANCH])
const tracking = run('git', ['rev-parse', `origin/${BRANCH}`])

let apiSha = null
const remoteUrl = run('git', ['remote', 'get-url', 'origin'])
const slug = remoteUrl.ok ? (/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remoteUrl.out)?.[1] ?? null) : null
if (!slug) {
  fail('resolve owner/repo from origin', remoteUrl.out || 'no origin remote')
} else {
  const api = run('gh', ['api', `repos/${slug}/git/ref/heads/${BRANCH}`, '--jq', '.object.sha'])
  if (api.ok) apiSha = api.out
  else fail(`GitHub API ref heads/${BRANCH}`, api.out)
}

if (!local.ok || !tracking.ok) {
  fail(`resolve ${BRANCH} and origin/${BRANCH}`, `${local.out}\n${tracking.out}`)
} else if (local.out !== tracking.out) {
  fail(
    `${BRANCH} matches origin/${BRANCH}`,
    `local  ${local.out}\nremote ${tracking.out}\n` +
      `The merge advanced the server but not this clone. Run:\n` +
      `  git checkout ${BRANCH} && git pull --ff-only origin ${BRANCH}\n` +
      `A non-fast-forward here means local commits exist that the remote does not have — report it, do not force.`,
  )
} else if (apiSha !== null && local.out !== apiSha) {
  fail(
    `${BRANCH} matches the GitHub API`,
    `local and origin/${BRANCH} agree at ${local.out} but the server reports ${apiSha}.\n` +
      `Both local refs are stale together — the fetch did not bring down the newest commit.`,
  )
} else {
  pass(
    `${BRANCH} in sync`,
    apiSha === null ? `${local.out.slice(0, 7)} (local + tracking; API unverified)` : `${local.out.slice(0, 7)} — local, origin, and API all agree`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 — divergence count. Redundant with S2 when both pass, and kept as a
// control: it fails differently, reporting WHICH side is ahead rather than only
// that two hashes differ.
// ─────────────────────────────────────────────────────────────────────────────
const div = run('git', ['rev-list', '--left-right', '--count', `origin/${BRANCH}...${BRANCH}`])
if (!div.ok) {
  fail(`divergence count for ${BRANCH}`, div.out)
} else {
  const [behind, ahead] = div.out.split(/\s+/).map(Number)
  if (behind === 0 && ahead === 0) {
    pass('no divergence', '0 behind, 0 ahead')
  } else {
    fail('no divergence', `${behind} commit(s) behind origin/${BRANCH}, ${ahead} ahead`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// S4 — clean tree. Valid HERE and deliberately absent from the ship gate: the
// gate runs at Releasing step 5 with the version and changelog edits
// uncommitted, so a clean-tree assertion there would fail every release.
// ─────────────────────────────────────────────────────────────────────────────
const status = run('git', ['status', '--porcelain'])
if (!status.ok) {
  fail('git status', status.out)
} else if (status.out === '') {
  pass('working tree clean')
} else {
  fail('working tree clean', `${status.out}\nUncommitted or untracked files remain after the merge.`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('')
if (failures.length > 0) {
  console.log(`${RED}${BOLD}Sync verification FAILED${RESET} — ${failures.length} check(s):`)
  for (const f of failures) console.log(`  ${RED}✗${RESET} ${f}`)
  console.log('')
  process.exit(1)
}
console.log(`${GREEN}${BOLD}In sync${RESET} — ${config.repo ?? ''} ${BRANCH} at ${local.out.slice(0, 7)}\n`)
