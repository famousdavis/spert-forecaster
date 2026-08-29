// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Story Map's reachability register and import limits, vendored into the repo
 * they describe.
 *
 * ── WHAT THIS CLOSES, AND WHAT IT DOES NOT ──────────────────────────────────
 * Two directions of drift exist between `spert-story-map`'s Forecaster export
 * and this repo's `import-validation.ts`:
 *
 *   1. Story Map newly REACHES a rejection here.   → closed over there, v0.52.11.
 *   2. THIS repo tightens a rule and Story Map's   → closed HERE. That is the
 *      vendored limits silently no longer match.      whole point of this file.
 *
 * ⚠️ A third residual survives both and is NOT closed: if Story Map edits a row
 * and this repo does not, `storymap-contract.test.ts` stays green. Its checks
 * bind this table to THIS repo's validator, never to Story Map's copy — no test
 * here can read the other repository. Re-vendor on a Story Map contract release.
 *
 * ── WHY THIS IS A TRANSCRIPTION AND NOT A BYTE COPY ─────────────────────────
 * `canonical-export.json` next door IS byte-identical and SHA-pinned, because
 * nothing else could detect a silent local edit to it. This file is different:
 *
 *   - Story Map's `forecasterReachability.ts` imports `./forecasterLimits`, so
 *     byte-vendoring it would take THAT file's propagation set from two repos
 *     to three — the cost the shared-artifact discipline exists to avoid.
 *   - Its `BASES` are executable assertions about Story Map's EXPORTER. Nothing
 *     in this repo can exercise them, and a reader finding them here would
 *     reasonably assume otherwise.
 *   - `RegisterRow.note` is dropped: every note names a Story Map test title,
 *     which this repo cannot verify and which would rot with nothing red.
 *
 * What IS kept needs no byte pin, because it is pinned by behaviour instead:
 * every `message` below must be produced by this repo's validator (C4), and the
 * row count must equal its throw-site count (C5). Delete a row and C5 fails;
 * edit a message and C4 fails.
 *
 * ── MAINTENANCE ─────────────────────────────────────────────────────────────
 * Match rows on `message`, never on `line`. `line` is recorded because Story
 * Map records it; it is a pointer that decays on the next edit to
 * `import-validation.ts`, and NO check reads it.
 */

/** The Story Map commit this table and the vendored fixture set came from. */
export const PINNED_STORY_MAP = {
  commit: 'f172be0',
  version: '0.52.14',
  registerFile: 'src/lib/forecasterReachability.ts',
  limitsFile: 'src/lib/forecasterLimits.ts',
  fixtureDir: 'src/__tests__/fixtures/',
} as const

/**
 * SHA-256 of `fixtures/canonical-export.json` as committed in BOTH repos.
 *
 * Pinned rather than recomputed on purpose: a hash derived from the file it is
 * checking proves nothing. Byte-unchanged across Story Map v0.52.12 → v0.52.13,
 * verified on both sides — the twelve boundary payloads added in v0.52.13 did
 * not disturb it.
 */
export const CANONICAL_EXPORT_SHA256 =
  'e9c903c0db7c27a2b4a559de2501ae4d0b8177bbb928e7116216cb9c36ae12a3'

/**
 * SHA-256 of `fixtures/vendored-manifest.json`.
 *
 * ⚠️ ONE pin covers the whole set, by design. The manifest carries a `sha256`
 * for every payload, so pinning the manifest's own bytes makes those thirteen
 * hashes trustworthy in turn, and the payloads are then checked against them.
 * Thirteen separately-pinned constants here would be thirteen things to
 * re-transcribe by hand at each re-vendor, and a hand-transcribed hash is the
 * failure this pin exists to prevent.
 *
 * Story Map holds the same value in `forecasterFixtures.ts` as
 * `VENDORED_MANIFEST_SHA256`, so regenerating the set over there fails a named
 * test telling that side to re-vendor to this one. That is the only automated
 * link between the repos, and it runs in the OTHER direction from everything
 * else in this folder.
 */
export const VENDORED_MANIFEST_SHA256 =
  '5d27d8dd1ed8e0aeead7f36bc72a9f0cbfa8f393e94a742e8659eed2a5ac7cd5'

/** One row of `vendored-manifest.json`. */
export interface ManifestEntry {
  /** Register row id, or 'canonical'. */
  readonly row: string
  readonly label: string
  readonly file: string
  /** Story Map's CLAIM about this repo's verdict. Never trusted — see the test. */
  readonly forecasterShould: 'accept' | 'reject'
  readonly sha256: string
}

export interface VendoredManifest {
  readonly note: string
  readonly generatedFrom: string
  readonly entries: readonly ManifestEntry[]
}

/**
 * The limits Story Map vendors FROM this repo (`forecasterLimits.ts`).
 *
 * ⚠️ These are the numbers whose drift this release exists to catch. Each is
 * asserted by a BOUNDARY PAIR against the real validator — at the limit it must
 * accept, one past it must reject. A one-sided check passes just as happily
 * with the limit set wrong.
 *
 * The validator holds all three as PRIVATE constants (`MAX_STRING_LENGTH` and
 * `MAX_NUMERIC_VALUE`) or as a bare literal (the milestone cap, written `10`
 * twice at import-validation.ts:211-212). None can be imported, which is why
 * every pair below probes behaviour rather than reading a value.
 */
export const FORECASTER_LIMITS = {
  /** Max milestones per project. */
  MAX_MILESTONES: 10,
  /** Max length of any name field. */
  MAX_STRING_LENGTH: 200,
  /** Upper bound on every numeric field; the lower bound is 0. */
  MAX_NUMERIC_VALUE: 999999,
} as const

/** Status of a rejection with respect to what Story Map's export can emit. */
export type ReachabilityStatus = 'SHIPPED' | 'REACHABLE' | 'UNREACHABLE' | 'PRECLUDED'

export interface RegisterRow {
  readonly id: string
  /** Line at the pinned Forecaster commit. A decaying pointer — NO check reads it. */
  readonly line: number
  /** Transcribed verbatim, with `${...}` interpolations left in place. */
  readonly message: string
  readonly status: ReachabilityStatus
  /** Key into Story Map's `BASES`, which are not vendored. Null for SHIPPED. */
  readonly basis: string | null
}

/**
 * One row per `throw new Error` in `src/shared/state/import-validation.ts`, in
 * source order. The order is load-bearing: the test compares this list to the
 * throws extracted from that file positionally.
 */
export const REGISTER: readonly RegisterRow[] = [
  { id: 'F01', line: 155, message: 'Import data must be a JSON object.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F02', line: 161, message: 'Import data is missing a valid "projects" array.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F03', line: 164, message: 'Import data is missing a valid "sprints" array.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F04', line: 173, message: 'Project at index ${i} is not a valid object.', status: 'UNREACHABLE', basis: 'envelope' },
  { id: 'F05', line: 176, message: 'Project at index ${i} is missing a valid "id".', status: 'UNREACHABLE', basis: 'projectIdFromProduct' },
  { id: 'F06', line: 179, message: 'Duplicate project ID "${p.id}" found at index ${i}.', status: 'UNREACHABLE', basis: 'singleProject' },
  { id: 'F07', line: 184, message: 'Project at index ${i} is missing a valid "name".', status: 'SHIPPED', basis: null },
  { id: 'F08', line: 187, message: 'Project at index ${i} has a name exceeding ${MAX_STRING_LENGTH} characters.', status: 'SHIPPED', basis: null },
  { id: 'F09', line: 190, message: 'Project at index ${i} is missing a valid "unitOfMeasure".', status: 'UNREACHABLE', basis: 'constantUnitOfMeasure' },
  { id: 'F10', line: 193, message: 'Project at index ${i} has a unitOfMeasure exceeding ${MAX_STRING_LENGTH} characters.', status: 'UNREACHABLE', basis: 'constantUnitOfMeasure' },
  { id: 'F11', line: 198, message: 'Project at index ${i} has invalid sprintCadenceWeeks (must be 1-52).', status: 'UNREACHABLE', basis: 'cadenceBounded' },
  { id: 'F12', line: 203, message: 'Project at index ${i} has invalid firstSprintStartDate (must be YYYY-MM-DD format).', status: 'PRECLUDED', basis: 'derivedDatesAreReal' },
  { id: 'F13', line: 209, message: 'Project at index ${i} has invalid "milestones" (must be an array).', status: 'UNREACHABLE', basis: 'milestonesArray' },
  { id: 'F14', line: 212, message: 'Project at index ${i} has more than 10 milestones.', status: 'SHIPPED', basis: null },
  { id: 'F15', line: 218, message: 'Project ${i}, milestone at index ${j} is not a valid object.', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F16', line: 221, message: 'Project ${i}, milestone at index ${j} is missing a valid "id".', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F17', line: 224, message: 'Project ${i}, duplicate milestone ID "${m.id}" at index ${j}.', status: 'UNREACHABLE', basis: 'milestoneIdsUnique' },
  { id: 'F18', line: 228, message: 'Project ${i}, milestone at index ${j} is missing a valid "name".', status: 'SHIPPED', basis: null },
  { id: 'F19', line: 231, message: 'Project ${i}, milestone at index ${j} has a name exceeding ${MAX_STRING_LENGTH} characters.', status: 'SHIPPED', basis: null },
  { id: 'F20', line: 238, message: 'Project ${i}, milestone at index ${j} has invalid backlogSize (must be >= 0 and <= ${MAX_NUMERIC_VALUE}).', status: 'SHIPPED', basis: null },
  { id: 'F21', line: 241, message: 'Project ${i}, milestone at index ${j} is missing a valid "color".', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F22', line: 244, message: 'Project ${i}, milestone at index ${j} has invalid "showOnChart" (must be a boolean).', status: 'UNREACHABLE', basis: 'milestoneShape' },
  { id: 'F23', line: 256, message: 'Sprint at index ${i} is not a valid object.', status: 'UNREACHABLE', basis: 'sprintShape' },
  { id: 'F24', line: 259, message: 'Sprint at index ${i} is missing a valid "id".', status: 'UNREACHABLE', basis: 'sprintShape' },
  { id: 'F25', line: 262, message: 'Duplicate sprint ID "${s.id}" found at index ${i}.', status: 'UNREACHABLE', basis: 'sprintIdsUnique' },
  { id: 'F26', line: 267, message: 'Sprint at index ${i} is missing a valid "projectId".', status: 'UNREACHABLE', basis: 'sprintShape' },
  { id: 'F27', line: 272, message: 'Sprint at index ${i} has invalid sprintNumber (must be ${MIN_SPRINT_NUMBER}-${MAX_SPRINT_NUMBER}).', status: 'UNREACHABLE', basis: 'sprintNumberIsIndex' },
  { id: 'F28', line: 275, message: 'Sprint at index ${i} has non-integer sprintNumber.', status: 'UNREACHABLE', basis: 'sprintNumberIsIndex' },
  { id: 'F29', line: 280, message: 'Sprint at index ${i} has invalid doneValue (must be 0-${MAX_NUMERIC_VALUE}).', status: 'SHIPPED', basis: null },
  { id: 'F30', line: 285, message: 'Sprint at index ${i} has invalid backlogAtSprintEnd (must be 0-${MAX_NUMERIC_VALUE}).', status: 'SHIPPED', basis: null },
  { id: 'F31', line: 290, message: 'Sprint at index ${i} has invalid sprintStartDate (must be YYYY-MM-DD format).', status: 'PRECLUDED', basis: 'derivedDatesAreReal' },
  { id: 'F32', line: 293, message: 'Sprint at index ${i} has invalid sprintFinishDate (must be YYYY-MM-DD format).', status: 'SHIPPED', basis: null },
  { id: 'F33', line: 296, message: 'Sprint at index ${i} has invalid customFinishDate (must be YYYY-MM-DD format).', status: 'UNREACHABLE', basis: 'noCustomFinishDate' },
]

/**
 * Gates in `useImportState.handleFileChange` that refuse a file BEFORE
 * `validateImportData` runs. Not throws, so outside the 33 — but they are
 * rejections, and the register's promise is about rejections.
 */
export const PRE_VALIDATOR_REGISTER: readonly RegisterRow[] = [
  { id: 'P01', line: 215, message: 'Import failed: Please select a JSON file (.json)', status: 'UNREACHABLE', basis: 'jsonExtension' },
  { id: 'P02', line: 220, message: 'Import failed: File exceeds the 10 MB limit', status: 'UNREACHABLE', basis: 'underSizeCap' },
  { id: 'P03', line: 247, message: 'The file contains no projects to import.', status: 'UNREACHABLE', basis: 'singleProject' },
]
