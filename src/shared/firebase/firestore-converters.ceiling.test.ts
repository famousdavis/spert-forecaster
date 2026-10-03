// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The cloud carries a project at the ceiling. The converters pass milestones
 * through untouched, and the suite's Firestore rules check field NAMES only
 * (spertForecasterProjectFields), so a 100-milestone project saves and reloads
 * as it was. The rules half is proven against the emulator in
 * spert-landing-page, not here.
 */
import { describe, it, expect } from 'vitest'
import { projectToFirestoreDoc, firestoreDocToProject, firestoreDocToSprints } from './firestore-converters'
import { MILESTONE_CEILING } from '@/shared/state/import-limits'
import type { Project, Sprint } from '@/shared/types'

const T = '2026-10-02T12:00:00.000Z'

describe('converters at the milestone ceiling', () => {
  it('round-trip a project holding MILESTONE_CEILING milestones identically', () => {
    const project: Project = {
      id: 'p100', name: 'Hundred', unitOfMeasure: 'Story Points', sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-05',
      productivityAdjustments: [], createdAt: T, updatedAt: T,
      milestones: Array.from({ length: MILESTONE_CEILING }, (_, i) => ({
        id: `rel-${i}`, name: `Release ${i + 1}`, backlogSize: (i % 7) * 5, color: '#3b82f6', showOnChart: i % 3 !== 0, createdAt: T, updatedAt: T,
      })),
    }
    const sprints: Sprint[] = [{ id: 's1', projectId: 'p100', sprintNumber: 1, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', doneValue: 12, includedInForecast: true, createdAt: T, updatedAt: T }]
    const doc = projectToFirestoreDoc(project, sprints, 'uid', undefined, 'origin-token', [])
    expect(doc.milestones).toHaveLength(MILESTONE_CEILING)
    expect(firestoreDocToProject('p100', doc).milestones).toEqual(project.milestones)
    expect(firestoreDocToSprints(doc)).toEqual(sprints)
  })
})
