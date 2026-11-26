// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SD-6 — a Story Map `replace` keeps the project fields Story Map never
 * authors: productivity adjustments, project start/finish dates, unit of
 * measure. Before v0.52.2 a Story Map Replace substituted the incoming project
 * wholesale, and since Story Map has no adjustments, every Replace erased them.
 *
 * Fixtures are hand-written literals, and every kept field carries a value on
 * BOTH sides that differs, so "kept" and "taken" cannot coincide.
 */

import { describe, it, expect } from 'vitest'
import {
  applyImportDecisions,
  replacementProject,
  STORY_MAP_REPLACE_KEEPS,
  PROJECT_UPDATE_FIELD_CLASSES,
  type ConflictAction,
  type ImportConflict,
  type ParsedImportData,
} from './import-utils'
import type { Project, Sprint } from '@/shared/types'

const T0 = '2026-01-01T00:00:00.000Z'

const HOLIDAY = {
  id: 'adj-local', name: 'Holiday', startDate: '2026-12-21', endDate: '2027-01-01',
  factor: 0.4, enabled: true, createdAt: T0, updatedAt: T0,
}
const CRAFTED_ADJ = {
  id: 'adj-crafted', name: 'From the file', startDate: '2026-07-01', endDate: '2026-07-10',
  factor: 0.9, enabled: true, createdAt: T0, updatedAt: T0,
}

/** The project as Forecaster holds it: the user's own setup on it. */
const EXISTING: Project = {
  id: 'prod-1',
  name: 'Growth Product',
  unitOfMeasure: 'Hours',
  projectStartDate: '2026-01-05',
  projectFinishDate: '2026-12-18',
  productivityAdjustments: [HOLIDAY],
  sprintCadenceWeeks: 2,
  firstSprintStartDate: '2026-01-05',
  milestones: [],
  createdAt: T0,
  updatedAt: T0,
}

/** A real Story Map send: no adjustments, no project dates, 'Story Points'. */
function smProject(id: string): Project {
  return {
    id,
    name: 'Growth Product',
    unitOfMeasure: 'Story Points',
    sprintCadenceWeeks: 3,
    firstSprintStartDate: '2026-02-02',
    milestones: [{ id: 'rel-1', name: 'Release 1', backlogSize: 40, color: '#2563eb', showOnChart: true, createdAt: T0, updatedAt: T0 }],
    createdAt: T0,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }
}

/** A hand-crafted payload claiming to be Story Map, carrying all four fields. */
function craftedProject(id: string): Project {
  return {
    ...smProject(id),
    unitOfMeasure: 'Widgets',
    projectStartDate: '2025-06-01',
    projectFinishDate: '2025-09-30',
    productivityAdjustments: [CRAFTED_ADJ],
  }
}

function sprint(id: string, projectId: string, n: number): Sprint {
  return {
    id, projectId, sprintNumber: n, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
    doneValue: 10, includedInForecast: true, createdAt: T0, updatedAt: T0,
  }
}

function replaceWith(
  incomingProject: Project,
  exportType: ParsedImportData['exportType'],
  conflictType: 'id' | 'name',
) {
  const incomingSprints = [sprint('s-new', incomingProject.id, 1)]
  const incoming = (exportType === 'spert-story-map'
    ? { exportType, projects: [incomingProject], sprints: incomingSprints, milestoneBacklog: 'remaining' }
    : exportType === 'legacy'
      ? { exportType, projects: [incomingProject], sprints: incomingSprints, _originalExportData: { version: '0.30.0', exportedAt: T0, projects: [incomingProject], sprints: incomingSprints } }
      : { exportType, projects: [incomingProject], sprints: incomingSprints }) as ParsedImportData
  const conflicts: ImportConflict[] = [{ type: conflictType, incomingProject, existingProject: EXISTING }]
  const decisions = new Map<string, ConflictAction>([[incomingProject.id, 'replace']])
  const out = applyImportDecisions([EXISTING], [sprint('s-old', EXISTING.id, 1)], incoming, decisions, conflicts)
  expect(out.mergedProjects).toHaveLength(1)
  expect(out.result.replaced).toBe(1)
  return out
}

const keptFields = (p: Project) => ({
  productivityAdjustments: p.productivityAdjustments,
  projectStartDate: p.projectStartDate,
  projectFinishDate: p.projectFinishDate,
  unitOfMeasure: p.unitOfMeasure,
})

const EXISTING_KEPT = keptFields(EXISTING)

describe('SD-6: a Story Map Replace keeps what only Forecaster can hold', () => {
  it('ID conflict: keeps adjustments, project dates and unit; takes Story Map\'s sprints, milestones and cadence', () => {
    const { mergedProjects, mergedSprints } = replaceWith(smProject('prod-1'), 'spert-story-map', 'id')
    const p = mergedProjects[0]
    expect(keptFields(p)).toEqual(EXISTING_KEPT)
    expect(p.id).toBe('prod-1')
    expect(p.sprintCadenceWeeks).toBe(3)
    expect(p.firstSprintStartDate).toBe('2026-02-02')
    expect(p.milestones?.map((m) => m.id)).toEqual(['rel-1'])
    expect(mergedSprints.map((s) => s.id)).toEqual(['s-new'])
  })

  it('name conflict: the winner takes the incoming id and still keeps the four fields', () => {
    const { mergedProjects, result } = replaceWith(smProject('prod-renamed'), 'spert-story-map', 'name')
    expect(mergedProjects[0].id).toBe('prod-renamed')
    expect(result.replacedIdMap.get('prod-1')).toBe('prod-renamed')
    expect(keptFields(mergedProjects[0])).toEqual(EXISTING_KEPT)
  })

  it('a crafted Story Map payload carrying the four fields is ignored, as Update ignores it', () => {
    const { mergedProjects } = replaceWith(craftedProject('prod-1'), 'spert-story-map', 'id')
    expect(keptFields(mergedProjects[0])).toEqual(EXISTING_KEPT)
  })

  it('an existing project with no adjustments stays without them', () => {
    const bare = { ...EXISTING, productivityAdjustments: undefined }
    const p = replacementProject(bare, craftedProject('prod-1'), 'spert-story-map')
    expect(p.productivityAdjustments).toBeUndefined()
  })
})

describe('SD-6 controls: a Forecaster file\'s Replace still takes the file whole', () => {
  it.each(['spert-forecaster-project-export', 'legacy'] as const)('%s: takes the file\'s adjustments, dates and unit', (exportType) => {
    const { mergedProjects } = replaceWith(craftedProject('prod-1'), exportType, 'id')
    expect(keptFields(mergedProjects[0])).toEqual(keptFields(craftedProject('prod-1')))
  })
})

describe('STORY_MAP_REPLACE_KEEPS agrees with the Update field classes', () => {
  // The fields Update keeps because Story Map never authors them. A new
  // Forecaster-only field classed for Update must be decided for Replace too.
  it('is exactly the local-restore-defensive and local-producer-artifact project rows', () => {
    const fromTable = Object.entries(PROJECT_UPDATE_FIELD_CLASSES)
      .filter(([, c]) => c === 'local-restore-defensive' || c === 'local-producer-artifact')
      .map(([k]) => k)
      .sort()
    expect([...STORY_MAP_REPLACE_KEEPS].sort()).toEqual(fromTable)
  })

  it('replacementProject keeps every listed key and takes every other key from the payload', () => {
    const incoming = craftedProject('prod-1')
    const p = replacementProject(EXISTING, incoming, 'spert-story-map') as unknown as Record<string, unknown>
    const keeps = new Set<string>(STORY_MAP_REPLACE_KEEPS)
    const ex = EXISTING as unknown as Record<string, unknown>
    const inc = incoming as unknown as Record<string, unknown>
    for (const key of Object.keys(PROJECT_UPDATE_FIELD_CLASSES)) {
      expect(p[key], key).toEqual(keeps.has(key) ? ex[key] : inc[key])
    }
  })
})
