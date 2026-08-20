// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Compute the release version and body for the current commit.
 *
 * DESIGN: NO NEW CONFIGURATION.
 * ----------------------------
 * Everything this needs is already declared:
 *   - the version comes from package.json, and `npm run shipgate` already
 *     asserts it agrees with APP_VERSION and with the newest changelog entry,
 *     so a single read of it is a guaranteed-consistent source;
 *   - the changelog file and its heading format come from
 *     shipgate.config.json, whose `headingPattern` already exists to find
 *     exactly this section.
 *
 * That is what lets the workflow beside this file stay byte-identical across
 * every SPERT repo while six different changelog heading styles keep working.
 * Add a repo, add nothing here.
 *
 * ⚠️ FAILS rather than publishing an empty release. A release whose body is
 * blank because a regex missed looks, in the releases list, exactly like a
 * release that had nothing to say. Same reasoning as the rules-drift check:
 * an unusable result must be loud, not silent.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const outPath = process.argv[2] ?? resolve(root, 'release-body.md');

function die(msg) {
  console.error(`\nrelease-notes: ${msg}\n`);
  process.exit(1);
}

function readJson(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) die(`${rel} not found`);
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    die(`${rel} is not valid JSON: ${e.message}`);
  }
}

const pkg = readJson('package.json');
const version = pkg.version;
if (!version) die('package.json has no version');

const cfg = readJson('shipgate.config.json');
const changelog = cfg.changelog ?? {};
const file = changelog.file;
const pattern = changelog.headingPattern;

/** Body from the changelog section for `version`, or null if unavailable. */
function bodyFromChangelog() {
  // Repos without a markdown changelog (spert-landing-page) declare no
  // `changelog` key. That is a supported shape, not an error — the caller
  // falls back to a commit-range body.
  if (!file || !pattern) return null;

  const p = resolve(root, file);
  if (!existsSync(p)) die(`shipgate.config.json points at ${file}, which does not exist`);

  const lines = readFileSync(p, 'utf8').split('\n');
  const re = new RegExp(pattern);

  // Collect every heading and the version it declares, so we can slice this
  // version's section and also name the previous one for a compare link.
  const headings = [];
  lines.forEach((line, i) => {
    const m = re.exec(line);
    if (m) headings.push({ index: i, version: m[1] });
  });
  if (!headings.length) {
    die(`no headings in ${file} matched /${pattern}/ — the format may have changed`);
  }

  const at = headings.findIndex((h) => h.version === version);
  if (at === -1) {
    die(
      `${file} has no entry for ${version}. ` +
        `Newest entry is ${headings[0].version}. The ship gate should have caught this.`,
    );
  }

  const start = headings[at].index + 1;
  const end = at + 1 < headings.length ? headings[at + 1].index : lines.length;
  const section = lines.slice(start, end).join('\n').trim();

  if (!section) die(`the ${version} section of ${file} is empty`);

  return { section, previous: headings[at + 1]?.version ?? null };
}

const fromChangelog = bodyFromChangelog();
const repo = process.env.GITHUB_REPOSITORY;

const parts = [];
if (fromChangelog) {
  parts.push(fromChangelog.section);
  if (repo && fromChangelog.previous) {
    parts.push(
      `\n---\n\n**Full changelog:** https://github.com/${repo}/compare/v${fromChangelog.previous}...v${version}`,
    );
  }
} else {
  // No markdown changelog in this repo. Say so plainly rather than shipping a
  // blank body — a reader should know why it is sparse.
  parts.push(
    `Release ${version}.\n\nThis repository keeps its changelog outside \`CHANGELOG.md\`; see the in-app changelog for detail.`,
  );
  if (repo) parts.push(`\n**Commits:** https://github.com/${repo}/commits/v${version}`);
}

const body = parts.join('\n');
writeFileSync(outPath, `${body}\n`, 'utf8');

const out = process.env.GITHUB_OUTPUT;
const kv = `version=${version}\ntag=v${version}\n`;
if (out) writeFileSync(out, kv, { flag: 'a' });

console.log(`version : ${version}`);
console.log(`tag     : v${version}`);
console.log(`source  : ${fromChangelog ? file : 'no markdown changelog — fallback body'}`);
console.log(`body    : ${body.length} bytes -> ${outPath}`);
