// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The import limits and the envelope markers, in ONE leaf module.
//
// ⚠️ THIS FILE IMPORTS NOTHING, AND THAT IS ITS JOB. Both `import-validation.ts`
// and `import-utils.ts` read from it, so neither has to import a value from the
// other — the cycle import-validation → import-utils → import-validation never
// forms.
//
// ⚠️ KEEP EVERY FUNCTION THAT USES A NUMBER BELOW OUT OF THIS FILE. A test that
// `vi.mock`s this module with changed values reaches every site that IMPORTS a
// constant, and no site that closes over one in here. `milestoneLimitFor` lives
// in `import-validation.ts` for exactly that reason. The two predicates below
// compare strings only.

/** Story Map's SEND limit: the most milestones one of its files may carry. */
export const STORY_MAP_MILESTONE_LIMIT = 10

/** The most milestones a project may carry in a file this app wrote. */
export const MILESTONE_CEILING = 100

/** The import ceiling, in bytes of the file as saved. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * The longest a project name, a unit of measure or a milestone name may be, in
 * characters. The project form, the clone and the import copy hold to it, so
 * nothing they store is refused when its file comes back.
 */
export const MAX_STRING_LENGTH = 200

/**
 * The largest a milestone's remaining work, a sprint's done value or its
 * backlog at end may be. The smallest is 0.
 */
export const MAX_NUMERIC_VALUE = 999999

/** The `source` a Story Map export declares. */
export const STORY_MAP_SOURCE = 'spert-story-map'

/** The `_exportType` this app's per-project (subset) export declares. */
export const PROJECT_SUBSET_EXPORT_TYPE = 'spert-forecaster-project-export'

// DECLARED, NOT PROVEN: either key can be typed into a file by hand. Strict
// equality on purpose — `["spert-story-map"] == 'spert-story-map'` is true.

/** The file says it came from SPERT Story Map. */
export function declaresStoryMapSource(d: Record<string, unknown>): boolean {
  return d.source === STORY_MAP_SOURCE
}

/** The file says it is this app's per-project export. */
export function declaresProjectSubsetExport(d: Record<string, unknown>): boolean {
  return d._exportType === PROJECT_SUBSET_EXPORT_TYPE
}
