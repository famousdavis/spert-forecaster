// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Which files get which milestone limit (`milestoneLimitFor`). Every row: the
 * limit is accepted, one past it is refused with the exact message.
 *
 * ⚠️ THE ROWS ARE CHOSEN SO EACH KNOWN-BAD LIMIT FUNCTION TURNS SOME ROW RED:
 *   - a cap on ANY truthy `source`  → the non-Story-Map `source` rows, which carry
 *     workspace reconciliation tokens. Without the tokens their right limit is the
 *     Story Map limit anyway, and that known-bad would pass them.
 *   - no ceiling                    → every ceiling row, on limit + 1.
 *   - a ceiling for every file without `source` → the v0.52.9 envelope and the
 *     other token-less rows (old Story Map files must stay at the send limit).
 *   - the tokens ignored            → the workspace-export rows.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateImportData } from './import-validation'
import { isStoryMapExport, classifyImportData } from './import-utils'
import {
  STORY_MAP_MILESTONE_LIMIT,
  MILESTONE_CEILING,
  declaresStoryMapSource,
} from './import-limits'

type Obj = Record<string, unknown>

/** The vendored canonical Story Map v0.53.8 payload — a fresh parse every call. */
const storyMapFile = (): Obj => JSON.parse(readFileSync(
  join(import.meta.dirname, 'storymap-contract', 'fixtures', 'canonical-export.json'), 'utf8')) as Obj

const strip = (o: Obj, ...keys: string[]): Obj => {
  const c = { ...o }
  for (const k of keys) delete c[k]
  return c
}

/**
 * Story Map's envelope before v0.52.10 declared itself: version, exportedAt, projects,
 * sprints (`3561508`, v0.52.9). The vendored fixture omits `exportedAt` for
 * determinism, so it is put back here.
 */
const v0529Envelope = (): Obj => ({
  ...strip(storyMapFile(), 'source', 'milestoneBacklog'),
  exportedAt: '2026-08-27T00:00:00.000Z',
})

const TOKENS = { _originRef: 'origin-token', _storageRef: 'storage-token' }
const SUBSET = { _exportType: 'spert-forecaster-project-export' }

function withCount(base: Obj, n: number): Obj {
  const p = structuredClone(base)
  const project = (p.projects as Obj[])[0]
  const template = (project.milestones as Obj[])[0]
  project.milestones = Array.from({ length: n }, (_, i) => ({ ...template, id: `m-${i}`, name: `M ${i + 1}` }))
  return p
}

const verdict = (p: Obj): string => {
  try {
    validateImportData(p)
    return 'accepted'
  } catch (e) {
    return (e as Error).message
  }
}

const ROWS: ReadonlyArray<readonly [string, () => Obj, number]> = [
  ['Story Map v0.53.8 file', () => storyMapFile(), STORY_MAP_MILESTONE_LIMIT],
  ['Story Map v0.52.9 envelope (no source, no tokens)', v0529Envelope, STORY_MAP_MILESTONE_LIMIT],
  ['source Story Map + _exportType', () => ({ ...storyMapFile(), ...SUBSET }), STORY_MAP_MILESTONE_LIMIT],
  ['source Story Map + tokens', () => ({ ...storyMapFile(), ...TOKENS }), STORY_MAP_MILESTONE_LIMIT],
  ['own per-project export (_exportType + tokens)', () => ({ ...v0529Envelope(), ...SUBSET, ...TOKENS }), MILESTONE_CEILING],
  ['own per-project export (_exportType only)', () => ({ ...v0529Envelope(), ...SUBSET }), MILESTONE_CEILING],
  ['own workspace export (both tokens)', () => ({ ...v0529Envelope(), ...TOKENS }), MILESTONE_CEILING],
  ["source 'other' + tokens", () => ({ ...v0529Envelope(), source: 'other', ...TOKENS }), MILESTONE_CEILING],
  ["source ['spert-story-map'] (non-string) + tokens", () => ({ ...v0529Envelope(), source: ['spert-story-map'], ...TOKENS }), MILESTONE_CEILING],
  ['source 42 (non-string) + tokens', () => ({ ...v0529Envelope(), source: 42, ...TOKENS }), MILESTONE_CEILING],
  ["source 'other', nothing else", () => ({ ...v0529Envelope(), source: 'other' }), STORY_MAP_MILESTONE_LIMIT],
  ['only _originRef', () => ({ ...v0529Envelope(), _originRef: 'origin-token' }), STORY_MAP_MILESTONE_LIMIT],
  ["both tokens ''", () => ({ ...v0529Envelope(), _originRef: '', _storageRef: '' }), STORY_MAP_MILESTONE_LIMIT],
  ['both tokens non-string', () => ({ ...v0529Envelope(), _originRef: 1, _storageRef: 2 }), STORY_MAP_MILESTONE_LIMIT],
  ["_exportType 'other'", () => ({ ...v0529Envelope(), _exportType: 'other' }), STORY_MAP_MILESTONE_LIMIT],
]

describe('milestoneLimitFor — each file shape gets its limit', () => {
  it('the v0.52.9 envelope is the shape Story Map wrote before it declared `source`', () => {
    expect(Object.keys(v0529Envelope()).sort()).toEqual(['exportedAt', 'projects', 'sprints', 'version'])
  })

  it.each(ROWS)('%s — the limit accepted, one past it refused', (_name, base, limit) => {
    expect(verdict(withCount(base(), limit))).toBe('accepted')
    expect(verdict(withCount(base(), limit + 1))).toBe(`Project at index 0 has more than ${limit} milestones.`)
  })

  it.each(ROWS)('%s — the validator and the classifier test `source` the same way', (_name, base) => {
    const file = base()
    expect(declaresStoryMapSource(file)).toBe(isStoryMapExport(file as never))
  })

  it('a file declaring both keys is LIMITED as Story Map but ROUTED as a project export', () => {
    // Coherent: the stricter limit applies, and neither app writes both keys.
    // `classifyImportData` tests `_exportType` before `source` — do not "fix" that order here.
    const both = { ...storyMapFile(), ...SUBSET }
    expect(verdict(withCount(both, STORY_MAP_MILESTONE_LIMIT + 1)))
      .toBe(`Project at index 0 has more than ${STORY_MAP_MILESTONE_LIMIT} milestones.`)
    expect(classifyImportData(withCount(both, 1) as never).exportType).toBe('spert-forecaster-project-export')
  })
})
