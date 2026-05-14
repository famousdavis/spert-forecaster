// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  normalizeProjectName,
  classifyImportData,
  isProjectSubsetExport,
  isStoryMapExport,
  detectImportConflicts,
  conflictsEqual,
  applyImportDecisions,
  type ParsedImportData,
  type ImportConflict,
  type ConflictAction,
} from './import-utils'
import type { ExportData } from './import-validation'
import type { Project, Sprint } from '@/shared/types'

// --- Helpers ---

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: 'Test Project',
    unitOfMeasure: 'Story Points',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    projectId: 'project-1',
    sprintNumber: 1,
    sprintStartDate: '2026-01-06',
    sprintFinishDate: '2026-01-17',
    doneValue: 20,
    includedInForecast: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeExportData(overrides: Partial<ExportData> = {}): ExportData {
  return {
    version: '0.30.0',
    exportedAt: '2026-05-14T00:00:00.000Z',
    projects: [],
    sprints: [],
    ...overrides,
  }
}

function makeProjectExport(projects: Project[], sprints: Sprint[]): ExportData {
  return {
    ...makeExportData({ projects, sprints }),
    _exportType: 'spert-forecaster-project-export',
  } as ExportData & { _exportType: string }
}

function makeStoryMapExport(projects: Project[], sprints: Sprint[]): ExportData {
  return makeExportData({ projects, sprints, source: 'spert-story-map' })
}

function makeProjectExportImport(projects: Project[], sprints: Sprint[]): ParsedImportData {
  return { exportType: 'spert-forecaster-project-export', projects, sprints }
}

// ---------------------------------------------------------------------------
// normalizeProjectName
// ---------------------------------------------------------------------------

describe('normalizeProjectName', () => {
  it('lowercases the name', () => {
    expect(normalizeProjectName('FooBar')).toBe('foobar')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeProjectName('  foo  ')).toBe('foo')
  })
})

// ---------------------------------------------------------------------------
// classifyImportData
// ---------------------------------------------------------------------------

describe('classifyImportData', () => {
  it('returns project-export type for data with _exportType', () => {
    const data = makeProjectExport([makeProject()], [])
    const result = classifyImportData(data)
    expect(result.exportType).toBe('spert-forecaster-project-export')
  })

  it('returns story-map type for data with source: spert-story-map', () => {
    const data = makeStoryMapExport([makeProject()], [])
    const result = classifyImportData(data)
    expect(result.exportType).toBe('spert-story-map')
  })

  it('returns legacy type for plain export data with no markers', () => {
    const data = makeExportData({ projects: [makeProject()], sprints: [] })
    const result = classifyImportData(data)
    expect(result.exportType).toBe('legacy')
  })

  it('project-export branch preserves projects array reference (no clone needed)', () => {
    const project = makeProject()
    const data = makeProjectExport([project], [])
    const result = classifyImportData(data)
    expect(result.projects).toBe(data.projects)
  })

  it('story-map branch preserves projects array reference (no clone needed)', () => {
    const project = makeProject()
    const data = makeStoryMapExport([project], [])
    const result = classifyImportData(data)
    expect(result.projects).toBe(data.projects)
  })

  it('legacy branch attaches _originalExportData equal to the input', () => {
    const data = makeExportData({ projects: [makeProject()], sprints: [] })
    const result = classifyImportData(data)
    if (result.exportType !== 'legacy') throw new Error('expected legacy')
    expect(result._originalExportData).toBe(data)
  })

  it('legacy branch deep-clones projects so mutation does not affect _originalExportData', () => {
    const project = makeProject({ name: 'Original' })
    const data = makeExportData({ projects: [project], sprints: [] })
    const result = classifyImportData(data)
    if (result.exportType !== 'legacy') throw new Error('expected legacy')
    result.projects[0].name = 'Mutated'
    expect(data.projects[0].name).toBe('Original')
  })

  it('legacy branch deep-clones sprints so mutation does not affect _originalExportData', () => {
    const sprint = makeSprint({ doneValue: 10 })
    const data = makeExportData({ projects: [], sprints: [sprint] })
    const result = classifyImportData(data)
    if (result.exportType !== 'legacy') throw new Error('expected legacy')
    result.sprints[0].doneValue = 999
    expect(data.sprints[0].doneValue).toBe(10)
  })

  it('legacy branch produces an independent projects array (different reference)', () => {
    const data = makeExportData({ projects: [makeProject()], sprints: [] })
    const result = classifyImportData(data)
    if (result.exportType !== 'legacy') throw new Error('expected legacy')
    expect(result.projects).not.toBe(data.projects)
  })

  it('classifies project-export when both _exportType and source are present', () => {
    // _exportType is the dominant discriminator (the if-guard order in code).
    const data = {
      ...makeProjectExport([makeProject()], []),
      source: 'spert-story-map',
    } as ExportData
    const result = classifyImportData(data)
    expect(result.exportType).toBe('spert-forecaster-project-export')
  })
})

// ---------------------------------------------------------------------------
// isProjectSubsetExport
// ---------------------------------------------------------------------------

describe('isProjectSubsetExport', () => {
  it('returns true when _exportType matches', () => {
    expect(isProjectSubsetExport(makeProjectExport([], []))).toBe(true)
  })

  it('returns false for plain export data', () => {
    expect(isProjectSubsetExport(makeExportData())).toBe(false)
  })

  it('returns false for Story Map export data', () => {
    expect(isProjectSubsetExport(makeStoryMapExport([], []))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isStoryMapExport
// ---------------------------------------------------------------------------

describe('isStoryMapExport', () => {
  it('returns true when source is "spert-story-map"', () => {
    expect(isStoryMapExport(makeStoryMapExport([], []))).toBe(true)
  })

  it('returns false for plain export data', () => {
    expect(isStoryMapExport(makeExportData())).toBe(false)
  })

  it('returns false for project-export data without source field', () => {
    expect(isStoryMapExport(makeProjectExport([], []))).toBe(false)
  })

  it('returns false for a different source value', () => {
    expect(isStoryMapExport(makeExportData({ source: 'spert-other' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// detectImportConflicts
// ---------------------------------------------------------------------------

describe('detectImportConflicts', () => {
  it('returns empty array when nothing matches', () => {
    const incoming = makeProjectExportImport([makeProject({ id: 'i-1', name: 'A' })], [])
    const existing = [makeProject({ id: 'e-1', name: 'B' })]
    expect(detectImportConflicts(incoming, existing)).toEqual([])
  })

  it('returns id conflict when incoming id matches existing id', () => {
    const incoming = makeProjectExportImport([makeProject({ id: 'shared', name: 'X' })], [])
    const existing = [makeProject({ id: 'shared', name: 'Y' })]
    const conflicts = detectImportConflicts(incoming, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('id')
  })

  it('returns name conflict when only normalized names match', () => {
    const incoming = makeProjectExportImport([makeProject({ id: 'i-1', name: 'Same' })], [])
    const existing = [makeProject({ id: 'e-1', name: 'same' })]
    const conflicts = detectImportConflicts(incoming, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('name')
  })

  it('ID conflict wins when both id and name would match (different existing projects)', () => {
    const incoming = makeProjectExportImport([makeProject({ id: 'shared', name: 'NameMatch' })], [])
    const existing = [
      makeProject({ id: 'shared', name: 'DifferentName' }),
      makeProject({ id: 'other', name: 'NameMatch' }),
    ]
    const conflicts = detectImportConflicts(incoming, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('id')
    expect(conflicts[0].existingProject.id).toBe('shared')
  })

  it('name comparison is case-insensitive and trims whitespace', () => {
    const incoming = makeProjectExportImport([makeProject({ id: 'i-1', name: '  HELLO  ' })], [])
    const existing = [makeProject({ id: 'e-1', name: 'hello' })]
    const conflicts = detectImportConflicts(incoming, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('name')
  })

  it('first-insert-wins for duplicate names in existing array', () => {
    const incoming = makeProjectExportImport([makeProject({ id: 'i-1', name: 'Dup' })], [])
    const existing = [
      makeProject({ id: 'first', name: 'Dup' }),
      makeProject({ id: 'second', name: 'Dup' }),
    ]
    const conflicts = detectImportConflicts(incoming, existing)
    expect(conflicts[0].existingProject.id).toBe('first')
  })

  it('returns empty array when existing workspace is empty', () => {
    const incoming = makeProjectExportImport([makeProject()], [])
    expect(detectImportConflicts(incoming, [])).toEqual([])
  })

  it('returns empty array when incoming has no projects', () => {
    const incoming = makeProjectExportImport([], [])
    expect(detectImportConflicts(incoming, [makeProject()])).toEqual([])
  })

  it('reports multiple conflicts for multiple matching projects', () => {
    const incoming = makeProjectExportImport(
      [
        makeProject({ id: 'shared-1', name: 'A' }),
        makeProject({ id: 'i-2', name: 'B' }),
      ],
      [],
    )
    const existing = [
      makeProject({ id: 'shared-1', name: 'OldA' }),
      makeProject({ id: 'e-2', name: 'b' }),
    ]
    const conflicts = detectImportConflicts(incoming, existing)
    expect(conflicts).toHaveLength(2)
    expect(conflicts[0].type).toBe('id')
    expect(conflicts[1].type).toBe('name')
  })
})

// ---------------------------------------------------------------------------
// conflictsEqual
// ---------------------------------------------------------------------------

describe('conflictsEqual', () => {
  const conflict = (incomingId: string, type: 'id' | 'name', existingId: string): ImportConflict => ({
    type,
    incomingProject: makeProject({ id: incomingId }),
    existingProject: makeProject({ id: existingId }),
  })

  it('returns true for two empty arrays', () => {
    expect(conflictsEqual([], [])).toBe(true)
  })

  it('returns true for identical single-tuple arrays', () => {
    expect(conflictsEqual([conflict('i-1', 'id', 'e-1')], [conflict('i-1', 'id', 'e-1')])).toBe(true)
  })

  it('returns false when lengths differ', () => {
    expect(conflictsEqual([conflict('i-1', 'id', 'e-1')], [])).toBe(false)
  })

  it('returns false when incomingId differs', () => {
    expect(conflictsEqual([conflict('i-1', 'id', 'e-1')], [conflict('i-2', 'id', 'e-1')])).toBe(false)
  })

  it('returns false when type differs (id vs name) — detects type drift', () => {
    expect(conflictsEqual([conflict('i-1', 'id', 'e-1')], [conflict('i-1', 'name', 'e-1')])).toBe(false)
  })

  it('returns false when existingId differs', () => {
    expect(conflictsEqual([conflict('i-1', 'id', 'e-1')], [conflict('i-1', 'id', 'e-2')])).toBe(false)
  })

  it('is order-independent', () => {
    const a = [conflict('i-1', 'id', 'e-1'), conflict('i-2', 'name', 'e-2')]
    const b = [conflict('i-2', 'name', 'e-2'), conflict('i-1', 'id', 'e-1')]
    expect(conflictsEqual(a, b)).toBe(true)
  })

  it('handles multiset (same tuple repeated) correctly', () => {
    const a = [conflict('i-1', 'id', 'e-1'), conflict('i-1', 'id', 'e-1')]
    const b = [conflict('i-1', 'id', 'e-1'), conflict('i-1', 'id', 'e-1')]
    const c = [conflict('i-1', 'id', 'e-1')]
    expect(conflictsEqual(a, b)).toBe(true)
    expect(conflictsEqual(a, c)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyImportDecisions
// ---------------------------------------------------------------------------

describe('applyImportDecisions', () => {
  // ----- resolvedOutcome contract -----
  describe('resolvedOutcome contract', () => {
    it('no conflict → added (stray decision keys ignored)', () => {
      const incoming = makeProjectExportImport([makeProject({ id: 'i-1', name: 'New' })], [])
      const decisions = new Map<string, ConflictAction>([['unrelated-key', 'replace']])
      const { result } = applyImportDecisions([], [], incoming, decisions, [])
      expect(result.added).toBe(1)
    })

    it('conflict + no decision key → skip (safe-by-default)', () => {
      const inc = makeProject({ id: 'shared', name: 'X' })
      const incoming = makeProjectExportImport([inc], [])
      const existing = [makeProject({ id: 'shared', name: 'Y' })]
      const conflicts: ImportConflict[] = [{ type: 'id', incomingProject: inc, existingProject: existing[0] }]
      const { result } = applyImportDecisions(existing, [], incoming, new Map(), conflicts)
      expect(result.skipped).toBe(1)
      expect(result.replaced).toBe(0)
    })

    it('conflict + skip key → skip', () => {
      const inc = makeProject({ id: 'shared' })
      const incoming = makeProjectExportImport([inc], [])
      const existing = [makeProject({ id: 'shared' })]
      const conflicts: ImportConflict[] = [{ type: 'id', incomingProject: inc, existingProject: existing[0] }]
      const decisions = new Map<string, ConflictAction>([['shared', 'skip']])
      const { result } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      expect(result.skipped).toBe(1)
    })

    it('conflict + replace key → replace', () => {
      const inc = makeProject({ id: 'shared', name: 'New' })
      const incoming = makeProjectExportImport([inc], [])
      const existing = [makeProject({ id: 'shared', name: 'Old' })]
      const conflicts: ImportConflict[] = [{ type: 'id', incomingProject: inc, existingProject: existing[0] }]
      const decisions = new Map<string, ConflictAction>([['shared', 'replace']])
      const { result } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      expect(result.replaced).toBe(1)
    })

    it('conflict + copy key → copy', () => {
      const inc = makeProject({ id: 'i-1', name: 'Shared' })
      const incoming = makeProjectExportImport([inc], [])
      const existing = [makeProject({ id: 'e-1', name: 'shared' })]
      const conflicts: ImportConflict[] = [{ type: 'name', incomingProject: inc, existingProject: existing[0] }]
      const decisions = new Map<string, ConflictAction>([['i-1', 'copy']])
      const { result } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      expect(result.copied).toBe(1)
    })
  })

  // ----- skip path -----
  describe('skip path', () => {
    it('leaves existing project untouched and emits no sprints', () => {
      const inc = makeProject({ id: 'shared', name: 'New' })
      const incoming = makeProjectExportImport([inc], [makeSprint({ projectId: 'shared', sprintNumber: 5 })])
      const existing = [makeProject({ id: 'shared', name: 'Old' })]
      const existingSprints = [makeSprint({ projectId: 'shared', sprintNumber: 1 })]
      const conflicts: ImportConflict[] = [{ type: 'id', incomingProject: inc, existingProject: existing[0] }]
      const { mergedProjects, mergedSprints } = applyImportDecisions(
        existing,
        existingSprints,
        incoming,
        new Map([['shared', 'skip']]),
        conflicts,
      )
      expect(mergedProjects).toEqual(existing)
      expect(mergedSprints).toEqual(existingSprints)
    })

    it('multiple skipped projects accumulate skipped count', () => {
      const i1 = makeProject({ id: 'a' })
      const i2 = makeProject({ id: 'b' })
      const incoming = makeProjectExportImport([i1, i2], [])
      const existing = [makeProject({ id: 'a' }), makeProject({ id: 'b' })]
      const conflicts: ImportConflict[] = [
        { type: 'id', incomingProject: i1, existingProject: existing[0] },
        { type: 'id', incomingProject: i2, existingProject: existing[1] },
      ]
      const { result } = applyImportDecisions(existing, [], incoming, new Map(), conflicts)
      expect(result.skipped).toBe(2)
    })
  })

  // ----- copy path -----
  describe('copy path', () => {
    function setupCopy() {
      const inc = makeProject({
        id: 'i-1',
        name: 'Shared',
        milestones: [
          { id: 'm-1', name: 'M1', backlogSize: 10, color: '#000', createdAt: 't', updatedAt: 't' },
        ],
        productivityAdjustments: [
          { id: 'pa-1', name: 'P1', startDate: '2026-01-01', endDate: '2026-02-01', factor: 0.5, enabled: true, createdAt: 't', updatedAt: 't' },
        ],
      })
      const existing = [makeProject({ id: 'e-1', name: 'shared' })]
      const conflicts: ImportConflict[] = [{ type: 'name', incomingProject: inc, existingProject: existing[0] }]
      const sprints = [makeSprint({ id: 's-1', projectId: 'i-1', sprintNumber: 1 })]
      const incoming = makeProjectExportImport([inc], sprints)
      const decisions = new Map<string, ConflictAction>([['i-1', 'copy']])
      return { inc, existing, conflicts, incoming, decisions }
    }

    it('assigns a fresh id to the copied project', () => {
      const { inc, existing, conflicts, incoming, decisions } = setupCopy()
      const { mergedProjects } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      const copy = mergedProjects.find((p) => p.id !== existing[0].id)!
      expect(copy.id).not.toBe(inc.id)
    })

    it('appends " (2)" suffix to copied project name', () => {
      const { inc, existing, conflicts, incoming, decisions } = setupCopy()
      const { mergedProjects } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      const copy = mergedProjects.find((p) => p.id !== existing[0].id)!
      expect(copy.name).toBe(inc.name + ' (2)')
    })

    it('truncates long names to fit MAX_STRING_LENGTH including suffix', () => {
      const longName = 'a'.repeat(250)
      const inc = makeProject({ id: 'i-1', name: longName })
      const existing = [makeProject({ id: 'e-1', name: longName })]
      const conflicts: ImportConflict[] = [{ type: 'name', incomingProject: inc, existingProject: existing[0] }]
      const incoming = makeProjectExportImport([inc], [])
      const { mergedProjects } = applyImportDecisions(
        existing,
        [],
        incoming,
        new Map([['i-1', 'copy']]),
        conflicts,
      )
      const copy = mergedProjects.find((p) => p.id !== existing[0].id)!
      expect(copy.name.length).toBeLessThanOrEqual(200)
      expect(copy.name.endsWith(' (2)')).toBe(true)
    })

    it('regenerates milestone IDs on copy', () => {
      const { inc, existing, conflicts, incoming, decisions } = setupCopy()
      const { mergedProjects } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      const copy = mergedProjects.find((p) => p.id !== existing[0].id)!
      expect(copy.milestones?.[0].id).not.toBe(inc.milestones![0].id)
    })

    it('regenerates productivity adjustment IDs on copy', () => {
      const { inc, existing, conflicts, incoming, decisions } = setupCopy()
      const { mergedProjects } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      const copy = mergedProjects.find((p) => p.id !== existing[0].id)!
      expect(copy.productivityAdjustments?.[0].id).not.toBe(inc.productivityAdjustments![0].id)
    })

    it('rewrites sprint projectIds and regenerates sprint IDs', () => {
      const { existing, conflicts, incoming, decisions } = setupCopy()
      const { mergedProjects, mergedSprints } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      const copy = mergedProjects.find((p) => p.id !== existing[0].id)!
      const copiedSprints = mergedSprints.filter((s) => s.projectId === copy.id)
      expect(copiedSprints).toHaveLength(1)
      expect(copiedSprints[0].id).not.toBe('s-1')
    })
  })

  // ----- replace — ID conflict -----
  describe('replace — ID conflict', () => {
    function setupIdReplace() {
      const inc = makeProject({ id: 'shared', name: 'New', unitOfMeasure: 'NewUnit' })
      const existing = [makeProject({ id: 'shared', name: 'Old', unitOfMeasure: 'OldUnit' })]
      const conflicts: ImportConflict[] = [{ type: 'id', incomingProject: inc, existingProject: existing[0] }]
      const existingSprints = [makeSprint({ id: 's-old', projectId: 'shared', sprintNumber: 1 })]
      const incomingSprints = [makeSprint({ id: 's-new', projectId: 'shared', sprintNumber: 2 })]
      const incoming = makeProjectExportImport([inc], incomingSprints)
      const decisions = new Map<string, ConflictAction>([['shared', 'replace']])
      return { existing, existingSprints, conflicts, incoming, decisions }
    }

    it('substitutes incoming project in place of existing (same array slot)', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupIdReplace()
      const { mergedProjects } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(mergedProjects).toHaveLength(1)
      expect(mergedProjects[0].name).toBe('New')
    })

    it('replaces existing sprints with incoming sprints for that project', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupIdReplace()
      const { mergedSprints } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(mergedSprints).toHaveLength(1)
      expect(mergedSprints[0].id).toBe('s-new')
    })

    it('does NOT add an entry to replacedIdMap for ID-conflict replace (same id)', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupIdReplace()
      const { result } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(result.replacedIdMap.size).toBe(0)
    })

    it('adds the existing id to replacedExistingIds', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupIdReplace()
      const { result } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(result.replacedExistingIds.has('shared')).toBe(true)
    })
  })

  // ----- replace — name conflict -----
  describe('replace — name conflict', () => {
    function setupNameReplace() {
      const inc = makeProject({ id: 'new-id', name: 'Shared' })
      const existing = [makeProject({ id: 'old-id', name: 'shared' })]
      const conflicts: ImportConflict[] = [{ type: 'name', incomingProject: inc, existingProject: existing[0] }]
      const existingSprints = [makeSprint({ id: 's-old', projectId: 'old-id', sprintNumber: 1 })]
      const incomingSprints = [makeSprint({ id: 's-new', projectId: 'new-id', sprintNumber: 2 })]
      const incoming = makeProjectExportImport([inc], incomingSprints)
      const decisions = new Map<string, ConflictAction>([['new-id', 'replace']])
      return { existing, existingSprints, conflicts, incoming, decisions }
    }

    it('substitutes incoming project in same slot — winner has incoming id', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupNameReplace()
      const { mergedProjects } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(mergedProjects).toHaveLength(1)
      expect(mergedProjects[0].id).toBe('new-id')
    })

    it('adds an entry to replacedIdMap mapping existing.id → incoming.id', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupNameReplace()
      const { result } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(result.replacedIdMap.get('old-id')).toBe('new-id')
    })

    it('replaces existing sprints with incoming sprints (existing sprints dropped)', () => {
      const { existing, existingSprints, conflicts, incoming, decisions } = setupNameReplace()
      const { mergedSprints } = applyImportDecisions(existing, existingSprints, incoming, decisions, conflicts)
      expect(mergedSprints).toHaveLength(1)
      expect(mergedSprints[0].id).toBe('s-new')
    })
  })

  // ----- added path -----
  describe('added path', () => {
    it('appends a non-conflicting project after replaces/copies', () => {
      const incNew = makeProject({ id: 'new-1', name: 'New' })
      const incoming = makeProjectExportImport([incNew], [])
      const existing = [makeProject({ id: 'existing-1', name: 'Existing' })]
      const { mergedProjects, result } = applyImportDecisions(existing, [], incoming, new Map(), [])
      expect(mergedProjects).toHaveLength(2)
      expect(mergedProjects[1].id).toBe('new-1')
      expect(result.added).toBe(1)
    })

    it('appends sprints for added project verbatim', () => {
      const incNew = makeProject({ id: 'new-1' })
      const sprint = makeSprint({ id: 's-new', projectId: 'new-1', sprintNumber: 1 })
      const incoming = makeProjectExportImport([incNew], [sprint])
      const { mergedSprints } = applyImportDecisions([], [], incoming, new Map(), [])
      expect(mergedSprints).toHaveLength(1)
      expect(mergedSprints[0].id).toBe('s-new')
    })
  })

  // ----- multi-replace same slot -----
  describe('multi-replace same slot', () => {
    it('first incoming project (array order) wins; subsequent ones downgraded to skip', () => {
      const i1 = makeProject({ id: 'i-1', name: 'Same' })
      const i2 = makeProject({ id: 'i-2', name: 'Same' })
      const existing = [makeProject({ id: 'e-1', name: 'same' })]
      const conflicts: ImportConflict[] = [
        { type: 'name', incomingProject: i1, existingProject: existing[0] },
        { type: 'name', incomingProject: i2, existingProject: existing[0] },
      ]
      const incoming = makeProjectExportImport([i1, i2], [])
      const decisions = new Map<string, ConflictAction>([
        ['i-1', 'replace'],
        ['i-2', 'replace'],
      ])
      const { mergedProjects, result } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      expect(mergedProjects).toHaveLength(1)
      expect(mergedProjects[0].id).toBe('i-1')
      expect(result.replaced).toBe(1)
      expect(result.skipped).toBe(1)
    })

    it('array order wins regardless of decision Map insertion order', () => {
      const i1 = makeProject({ id: 'i-1', name: 'Same' })
      const i2 = makeProject({ id: 'i-2', name: 'Same' })
      const existing = [makeProject({ id: 'e-1', name: 'same' })]
      const conflicts: ImportConflict[] = [
        { type: 'name', incomingProject: i1, existingProject: existing[0] },
        { type: 'name', incomingProject: i2, existingProject: existing[0] },
      ]
      const incoming = makeProjectExportImport([i1, i2], [])
      // Insert i-2 first into decisions Map — array order still wins.
      const decisions = new Map<string, ConflictAction>()
      decisions.set('i-2', 'replace')
      decisions.set('i-1', 'replace')
      const { mergedProjects } = applyImportDecisions(existing, [], incoming, decisions, conflicts)
      expect(mergedProjects[0].id).toBe('i-1')
    })
  })

  // ----- replacedExistingIds -----
  describe('replacedExistingIds', () => {
    it('is empty when no replaces happen', () => {
      const { result } = applyImportDecisions([], [], makeProjectExportImport([], []), new Map(), [])
      expect(result.replacedExistingIds.size).toBe(0)
    })

    it('includes the existing id for ID-conflict replaces', () => {
      const inc = makeProject({ id: 'shared' })
      const existing = [makeProject({ id: 'shared' })]
      const conflicts: ImportConflict[] = [{ type: 'id', incomingProject: inc, existingProject: existing[0] }]
      const incoming = makeProjectExportImport([inc], [])
      const { result } = applyImportDecisions(
        existing,
        [],
        incoming,
        new Map([['shared', 'replace']]),
        conflicts,
      )
      expect(result.replacedExistingIds.has('shared')).toBe(true)
    })

    it('includes the existing id (not incoming) for name-conflict replaces', () => {
      const inc = makeProject({ id: 'new-id', name: 'X' })
      const existing = [makeProject({ id: 'old-id', name: 'x' })]
      const conflicts: ImportConflict[] = [{ type: 'name', incomingProject: inc, existingProject: existing[0] }]
      const incoming = makeProjectExportImport([inc], [])
      const { result } = applyImportDecisions(
        existing,
        [],
        incoming,
        new Map([['new-id', 'replace']]),
        conflicts,
      )
      expect(result.replacedExistingIds.has('old-id')).toBe(true)
      expect(result.replacedExistingIds.has('new-id')).toBe(false)
    })

    it('contains multiple ids when multiple projects are replaced', () => {
      const i1 = makeProject({ id: 'i-1' })
      const i2 = makeProject({ id: 'i-2' })
      const existing = [makeProject({ id: 'i-1' }), makeProject({ id: 'i-2' })]
      const conflicts: ImportConflict[] = [
        { type: 'id', incomingProject: i1, existingProject: existing[0] },
        { type: 'id', incomingProject: i2, existingProject: existing[1] },
      ]
      const incoming = makeProjectExportImport([i1, i2], [])
      const { result } = applyImportDecisions(
        existing,
        [],
        incoming,
        new Map([
          ['i-1', 'replace'],
          ['i-2', 'replace'],
        ]),
        conflicts,
      )
      expect(result.replacedExistingIds.size).toBe(2)
    })
  })

  // ----- sprint substitution regression guard -----
  describe('sprint substitution regression guard', () => {
    it('untouched projects retain their sprints; replaced project sprints fully substituted', () => {
      const incReplace = makeProject({ id: 'shared' })
      const existing = [
        makeProject({ id: 'shared' }),
        makeProject({ id: 'untouched' }),
      ]
      const conflicts: ImportConflict[] = [
        { type: 'id', incomingProject: incReplace, existingProject: existing[0] },
      ]
      const existingSprints = [
        makeSprint({ id: 's-old-shared', projectId: 'shared', sprintNumber: 1 }),
        makeSprint({ id: 's-untouched', projectId: 'untouched', sprintNumber: 1 }),
      ]
      const incomingSprints = [
        makeSprint({ id: 's-new-shared', projectId: 'shared', sprintNumber: 2 }),
      ]
      const incoming = makeProjectExportImport([incReplace], incomingSprints)
      const { mergedSprints } = applyImportDecisions(
        existing,
        existingSprints,
        incoming,
        new Map([['shared', 'replace']]),
        conflicts,
      )
      expect(mergedSprints.find((s) => s.id === 's-untouched')).toBeDefined()
      expect(mergedSprints.find((s) => s.id === 's-old-shared')).toBeUndefined()
      expect(mergedSprints.find((s) => s.id === 's-new-shared')).toBeDefined()
    })
  })

  // ----- golden scenario -----
  describe('golden scenario', () => {
    it('handles a mixed import: skip + copy + replace + added — all counts and slots correct', () => {
      // existing: A (will be skipped), B (will be replaced by name-conflict), C (untouched).
      const A_existing = makeProject({ id: 'a-existing', name: 'A' })
      const B_existing = makeProject({ id: 'b-existing', name: 'b' })
      const C_existing = makeProject({ id: 'c-existing', name: 'C' })
      const existing = [A_existing, B_existing, C_existing]
      const existingSprints = [
        makeSprint({ id: 'sA-old', projectId: 'a-existing', sprintNumber: 1 }),
        makeSprint({ id: 'sB-old', projectId: 'b-existing', sprintNumber: 1 }),
        makeSprint({ id: 'sC-old', projectId: 'c-existing', sprintNumber: 1 }),
      ]

      // incoming: A' (id-conflict skip), B' (name-conflict replace, new id), D' (copy from name-conflict with new), E' (added new).
      const A_inc = makeProject({ id: 'a-existing', name: 'A-prime' })
      const B_inc = makeProject({ id: 'b-new-id', name: 'B' })
      const D_inc = makeProject({ id: 'd-inc', name: 'C' })   // copy because name conflicts with C
      const E_inc = makeProject({ id: 'e-inc', name: 'E' })   // pure add

      const incoming = makeProjectExportImport(
        [A_inc, B_inc, D_inc, E_inc],
        [
          makeSprint({ id: 'sA-new', projectId: 'a-existing', sprintNumber: 9 }),
          makeSprint({ id: 'sB-new', projectId: 'b-new-id', sprintNumber: 9 }),
          makeSprint({ id: 'sD-new', projectId: 'd-inc', sprintNumber: 9 }),
          makeSprint({ id: 'sE-new', projectId: 'e-inc', sprintNumber: 9 }),
        ],
      )

      const conflicts: ImportConflict[] = [
        { type: 'id', incomingProject: A_inc, existingProject: A_existing },
        { type: 'name', incomingProject: B_inc, existingProject: B_existing },
        { type: 'name', incomingProject: D_inc, existingProject: C_existing },
      ]

      const decisions = new Map<string, ConflictAction>([
        ['a-existing', 'skip'],
        ['b-new-id', 'replace'],
        ['d-inc', 'copy'],
      ])

      const { mergedProjects, mergedSprints, result } = applyImportDecisions(
        existing,
        existingSprints,
        incoming,
        decisions,
        conflicts,
      )

      // Slots: [A(unchanged), B-replaced-with-incoming, C(unchanged), copy-of-D, E-added]
      expect(mergedProjects).toHaveLength(5)
      expect(mergedProjects[0].id).toBe('a-existing')
      expect(mergedProjects[1].id).toBe('b-new-id')
      expect(mergedProjects[2].id).toBe('c-existing')
      // copy is appended after pass-2 array
      const copyProject = mergedProjects.find((p) => p.name.endsWith(' (2)'))!
      expect(copyProject).toBeDefined()
      expect(mergedProjects.find((p) => p.id === 'e-inc')).toBeDefined()

      // Sprint substitution: A keeps old (skip), B gets new (replace), C keeps old (untouched), copy has rewritten sprint, E has its sprint
      expect(mergedSprints.find((s) => s.id === 'sA-old')).toBeDefined()
      expect(mergedSprints.find((s) => s.id === 'sB-old')).toBeUndefined()
      expect(mergedSprints.find((s) => s.id === 'sB-new')).toBeDefined()
      expect(mergedSprints.find((s) => s.id === 'sC-old')).toBeDefined()
      expect(mergedSprints.find((s) => s.id === 'sE-new')).toBeDefined()

      // Counts
      expect(result.added).toBe(1)      // E
      expect(result.copied).toBe(1)     // D
      expect(result.replaced).toBe(1)   // B
      expect(result.skipped).toBe(1)    // A
      expect(result.replacedIdMap.get('b-existing')).toBe('b-new-id')
      expect(result.replacedExistingIds.has('b-existing')).toBe(true)
    })
  })
})
