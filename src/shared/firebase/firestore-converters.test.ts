// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { projectToFirestoreDoc, firestoreDocToProject, firestoreDocToSprints, settingsToFirestoreDoc, firestoreDocToSettings } from './firestore-converters'
import type { Project, Sprint } from '@/shared/types'
import type { FirestoreProjectDoc } from './types'

const mockProject: Project = {
  id: 'p1',
  name: 'Test Project',
  unitOfMeasure: 'story points',
  sprintCadenceWeeks: 2,
  projectStartDate: '2024-01-01',
  firstSprintStartDate: '2024-01-15',
  productivityAdjustments: [],
  milestones: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const mockSprints: Sprint[] = [
  {
    id: 's1',
    projectId: 'p1',
    sprintNumber: 1,
    sprintStartDate: '2024-01-15',
    sprintFinishDate: '2024-01-26',
    doneValue: 21,
    includedInForecast: true,
    createdAt: '2024-01-26T00:00:00Z',
    updatedAt: '2024-01-26T00:00:00Z',
  },
  {
    id: 's2',
    projectId: 'p2', // Different project
    sprintNumber: 1,
    sprintStartDate: '2024-01-15',
    sprintFinishDate: '2024-01-26',
    doneValue: 15,
    includedInForecast: true,
    createdAt: '2024-01-26T00:00:00Z',
    updatedAt: '2024-01-26T00:00:00Z',
  },
]

describe('projectToFirestoreDoc', () => {
  it('creates a Firestore document with denormalized sprints', () => {
    const doc = projectToFirestoreDoc(mockProject, mockSprints, 'uid123')
    expect(doc.name).toBe('Test Project')
    expect(doc.owner).toBe('uid123')
    expect(doc.members).toEqual({})
    expect(doc.sprints).toHaveLength(1) // Only p1's sprint
    expect(doc.sprints[0].id).toBe('s1')
    expect(doc.schemaVersion).toBe(1)
  })

  it('preserves existing owner/members when provided', () => {
    const existing = { owner: 'original-owner', members: { uid456: 'editor' as const } }
    const doc = projectToFirestoreDoc(mockProject, mockSprints, 'uid123', existing)
    expect(doc.owner).toBe('original-owner')
    expect(doc.members).toEqual({ uid456: 'editor' })
  })

  it('includes originRef and changeLog', () => {
    const doc = projectToFirestoreDoc(mockProject, mockSprints, 'uid123', undefined, 'origin-123', [
      { t: 1000, op: 'add', entity: 'project', id: 'p1' },
    ])
    expect(doc._originRef).toBe('origin-123')
    expect(doc._changeLog).toHaveLength(1)
  })
})

describe('firestoreDocToProject', () => {
  it('converts Firestore document to Project type', () => {
    const doc: FirestoreProjectDoc = {
      name: 'Cloud Project',
      unitOfMeasure: 'hours',
      sprintCadenceWeeks: 1,
      sprints: [],
      productivityAdjustments: [],
      milestones: [],
      createdAt: '2024-06-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
      owner: 'uid123',
      members: {},
      schemaVersion: 1,
    }

    const project = firestoreDocToProject('doc-id', doc)
    expect(project.id).toBe('doc-id')
    expect(project.name).toBe('Cloud Project')
    expect(project.unitOfMeasure).toBe('hours')
    expect((project as Record<string, unknown>).owner).toBeUndefined()
    expect((project as Record<string, unknown>).members).toBeUndefined()
  })
})

describe('firestoreDocToSprints', () => {
  it('extracts sprints from Firestore doc', () => {
    const doc: FirestoreProjectDoc = {
      name: 'Test',
      unitOfMeasure: 'sp',
      sprints: mockSprints.slice(0, 1),
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      owner: 'uid',
      members: {},
      schemaVersion: 1,
    }
    expect(firestoreDocToSprints(doc)).toHaveLength(1)
  })

  it('returns empty array when no sprints', () => {
    const doc = { sprints: undefined } as unknown as FirestoreProjectDoc
    expect(firestoreDocToSprints(doc)).toEqual([])
  })
})

describe('settingsToFirestoreDoc / firestoreDocToSettings', () => {
  it('round-trips settings', () => {
    const settings = {
      autoRecalculate: true,
      trialCount: 10000,
      defaultChartFontSize: 'medium',
      defaultCustomPercentile: 85,
      defaultCustomPercentile2: 50,
      defaultResultsPercentiles: [50, 70, 80, 90],
    }
    const doc = settingsToFirestoreDoc(settings)
    const restored = firestoreDocToSettings(doc)
    expect(restored.autoRecalculate).toBe(true)
    expect(restored.trialCount).toBe(10000)
    expect(restored.defaultChartFontSize).toBe('medium')
    expect(restored.defaultCustomPercentile).toBe(85)
    expect(restored.defaultResultsPercentiles).toEqual([50, 70, 80, 90])
  })
})
