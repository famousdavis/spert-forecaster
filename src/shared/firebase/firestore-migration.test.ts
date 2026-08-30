// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FirestoreProfileDoc } from './types'
import type { Sprint } from '@/shared/types'

// --- Mock dependencies ---

const mockSaveProjectImmediate = vi.fn()
const mockSaveSettingsImmediate = vi.fn()
const mockUpsertProfile = vi.fn()
const mockProjectExists = vi.fn()

vi.mock('./firestore-driver', () => ({
  saveProjectImmediate: (...args: unknown[]) => mockSaveProjectImmediate(...args),
  saveSettingsImmediate: (...args: unknown[]) => mockSaveSettingsImmediate(...args),
  projectExists: (...args: unknown[]) => mockProjectExists(...args),
}))

vi.mock('./profileWrites', () => ({
  upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
}))

const mockProjectToFirestoreDoc = vi.fn().mockReturnValue({ name: 'mock-doc' })
const mockSettingsToFirestoreDoc = vi.fn().mockReturnValue({ trialCount: 10000 })

vi.mock('./firestore-converters', () => ({
  projectToFirestoreDoc: (...args: unknown[]) => mockProjectToFirestoreDoc(...args),
  settingsToFirestoreDoc: (...args: unknown[]) => mockSettingsToFirestoreDoc(...args),
}))

vi.mock('@/shared/state/storage', () => ({
  getWorkspaceId: () => 'ws-123',
  appendChangeLogEntry: (_log: unknown[], entry: unknown) => [
    ...(_log as unknown[] || []),
    { ...entry as Record<string, unknown>, ts: 1234567890 },
  ],
}))

// Mock Zustand stores
const mockProjectState = {
  projects: [
    {
      id: 'p1',
      name: 'Project Alpha',
      unitOfMeasure: 'story points',
      sprintCadenceWeeks: 2,
      projectStartDate: '2024-01-01',
      firstSprintStartDate: '2024-01-15',
      productivityAdjustments: [],
      milestones: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'p2',
      name: 'Project Beta',
      unitOfMeasure: 'items',
      sprintCadenceWeeks: 1,
      projectStartDate: '2024-02-01',
      firstSprintStartDate: '2024-02-05',
      productivityAdjustments: [],
      milestones: [],
      createdAt: '2024-02-01T00:00:00Z',
      updatedAt: '2024-02-01T00:00:00Z',
    },
  ],
  sprints: [] as Sprint[],
  _originRef: 'origin-abc',
  _changeLog: [],
}

const mockSettingsState = {
  trialCount: 10000,
  autoRecalculate: true,
}

vi.mock('@/shared/state/project-store', () => ({
  useProjectStore: {
    getState: () => mockProjectState,
  },
}))

vi.mock('@/shared/state/settings-store', () => ({
  useSettingsStore: {
    getState: () => mockSettingsState,
  },
}))

// Import AFTER mocks are set up
import { migrateLocalToCloud } from './firestore-migration'

const testProfile: FirestoreProfileDoc = {
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: null,
  lastSignIn: '2024-06-01T00:00:00Z',
}

describe('migrateLocalToCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectExists.mockResolvedValue(false)
    mockSaveProjectImmediate.mockResolvedValue(undefined)
    mockSaveSettingsImmediate.mockResolvedValue(undefined)
    mockUpsertProfile.mockResolvedValue(undefined)
  })

  it('uploads all projects and settings successfully', async () => {
    const result = await migrateLocalToCloud('uid-1', testProfile)

    expect(result.projectsUploaded).toBe(2)
    expect(result.projectsSkipped).toBe(0)
    expect(result.settingsUploaded).toBe(true)
    expect(result.errors).toHaveLength(0)

    expect(mockUpsertProfile).toHaveBeenCalledWith('uid-1', testProfile)
    expect(mockSaveProjectImmediate).toHaveBeenCalledTimes(2)
    expect(mockSaveSettingsImmediate).toHaveBeenCalledTimes(1)
  })

  it('passes correct args to projectToFirestoreDoc', async () => {
    await migrateLocalToCloud('uid-1', testProfile)

    // First project
    const firstCall = mockProjectToFirestoreDoc.mock.calls[0]
    expect(firstCall[0].id).toBe('p1')
    expect(firstCall[2]).toBe('uid-1') // uid
    expect(firstCall[3]).toBeUndefined() // no existing doc
    expect(firstCall[4]).toBe('origin-abc') // originRef
    // migrationLog should have the append entry
    expect(firstCall[5]).toEqual(
      expect.arrayContaining([expect.objectContaining({ op: 'import', source: 'cloud-migration' })])
    )
  })

  it('detects ID collision and generates new ID', async () => {
    mockProjectExists.mockImplementation((id: string) =>
      Promise.resolve(id === 'p1') // p1 collides, p2 does not
    )

    const result = await migrateLocalToCloud('uid-1', testProfile)

    expect(result.projectsUploaded).toBe(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Project "Project Alpha" had ID collision')

    // p1 should have been saved with a new UUID, p2 with original ID
    const firstSaveId = mockSaveProjectImmediate.mock.calls[0][0]
    const secondSaveId = mockSaveProjectImmediate.mock.calls[1][0]
    expect(firstSaveId).not.toBe('p1') // collision → new UUID
    expect(secondSaveId).toBe('p2') // no collision → keep ID
  })

  it('handles permission-denied on collision check by generating new ID', async () => {
    mockProjectExists.mockRejectedValue(new Error('permission-denied'))

    const result = await migrateLocalToCloud('uid-1', testProfile)

    expect(result.projectsUploaded).toBe(2)
    // IDs should both be new UUIDs
    const firstSaveId = mockSaveProjectImmediate.mock.calls[0][0]
    const secondSaveId = mockSaveProjectImmediate.mock.calls[1][0]
    expect(firstSaveId).not.toBe('p1')
    expect(secondSaveId).not.toBe('p2')
  })

  it('accumulates errors without stopping migration', async () => {
    mockUpsertProfile.mockRejectedValue(new Error('network error'))
    mockSaveProjectImmediate
      .mockResolvedValueOnce(undefined) // p1 succeeds
      .mockRejectedValueOnce(new Error('write failed')) // p2 fails
    mockSaveSettingsImmediate.mockRejectedValue(new Error('settings write failed'))

    const result = await migrateLocalToCloud('uid-1', testProfile)

    expect(result.projectsUploaded).toBe(1) // p1 succeeded
    expect(result.settingsUploaded).toBe(false)
    expect(result.errors).toHaveLength(3)
    expect(result.errors[0]).toContain('Profile upload failed')
    expect(result.errors[1]).toContain('Failed to upload project "Project Beta"')
    expect(result.errors[2]).toContain('Settings upload failed')
  })

  it('falls back to workspaceId when _originRef is missing', async () => {
    const originalOriginRef = mockProjectState._originRef
    mockProjectState._originRef = ''

    await migrateLocalToCloud('uid-1', testProfile)

    // Should use getWorkspaceId() fallback
    const firstCall = mockProjectToFirestoreDoc.mock.calls[0]
    expect(firstCall[4]).toBe('ws-123')

    mockProjectState._originRef = originalOriginRef
  })

  it('handles empty project list gracefully', async () => {
    const originalProjects = mockProjectState.projects
    mockProjectState.projects = []

    const result = await migrateLocalToCloud('uid-1', testProfile)

    expect(result.projectsUploaded).toBe(0)
    expect(result.projectsSkipped).toBe(0)
    expect(result.settingsUploaded).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(mockSaveProjectImmediate).not.toHaveBeenCalled()

    mockProjectState.projects = originalProjects
  })

  // --- Sprint remapping on ID reassignment (regression) ---
  //
  // ⚠️ THESE CASES MUST RUN THE REAL CONVERTER. The suite-level
  // vi.mock('./firestore-converters') above means `projectToFirestoreDoc`'s
  // `sprints.filter((s) => s.projectId === project.id)` NEVER EXECUTES here, so a
  // test written against the mock passes vacuously no matter what migration
  // hands it. Adding sprints to the `mockProjectState` fixture at the top of this
  // file would not have caught the defect either — the filter is the thing under
  // test, and it lives on the other side of the mock.
  //
  // The defect: migration passed the reassigned project alongside the untouched
  // store array, so the filter matched nothing and the document uploaded with
  // `sprints: []` while `projectsUploaded++` still reported success.
  describe('sprint remapping when the project ID is reassigned', () => {
    const originalSprints = mockProjectState.sprints

    const sprintsFor = (projectId: string, prefix: string) => [
      {
        id: `${prefix}-s1`,
        projectId,
        sprintNumber: 1,
        sprintStartDate: '2024-01-15',
        sprintFinishDate: '2024-01-26',
        doneValue: 20,
        includedInForecast: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: `${prefix}-s2`,
        projectId,
        sprintNumber: 2,
        sprintStartDate: '2024-01-29',
        sprintFinishDate: '2024-02-09',
        doneValue: 25,
        includedInForecast: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    beforeEach(async () => {
      const actual = await vi.importActual<
        typeof import('./firestore-converters')
      >('./firestore-converters')
      mockProjectToFirestoreDoc.mockImplementation(actual.projectToFirestoreDoc)
      mockProjectState.sprints = [
        ...sprintsFor('p1', 'alpha'),
        ...sprintsFor('p2', 'beta'),
      ]
    })

    afterEach(() => {
      mockProjectState.sprints = originalSprints
      mockProjectToFirestoreDoc.mockReset()
      mockProjectToFirestoreDoc.mockReturnValue({ name: 'mock-doc' })
    })

    // CONTROL. Separates "reassignment causes the loss" from "the converter
    // never returns sprints here at all" — without it, the assertions below
    // pass just as happily against a converter that is broken for every input,
    // or against a harness where the real implementation never got installed.
    it('CONTROL — with no reassignment, sprints reach the uploaded document', async () => {
      mockProjectExists.mockResolvedValue(false)

      await migrateLocalToCloud('uid-1', testProfile)

      const [savedId, doc] = mockSaveProjectImmediate.mock.calls[0]
      expect(savedId).toBe('p1')
      expect(doc.sprints).toHaveLength(2)
      expect(doc.sprints.map((s: { id: string }) => s.id)).toEqual([
        'alpha-s1',
        'alpha-s2',
      ])
    })

    it('carries the sprints across an ID collision, remapped to the new ID', async () => {
      mockProjectExists.mockImplementation((id: string) =>
        Promise.resolve(id === 'p1')
      )

      await migrateLocalToCloud('uid-1', testProfile)

      const [newId, doc] = mockSaveProjectImmediate.mock.calls[0]
      expect(newId).not.toBe('p1')
      expect(doc.sprints).toHaveLength(2)
      // Every sprint must point at the id the document is actually saved under;
      // otherwise it is orphaned inside its own project document.
      for (const s of doc.sprints) expect(s.projectId).toBe(newId)
    })

    it('carries the sprints when permission-denied forces a new ID', async () => {
      mockProjectExists.mockRejectedValue(new Error('permission-denied'))

      await migrateLocalToCloud('uid-1', testProfile)

      const [newId, doc] = mockSaveProjectImmediate.mock.calls[0]
      expect(newId).not.toBe('p1')
      expect(doc.sprints).toHaveLength(2)
      for (const s of doc.sprints) expect(s.projectId).toBe(newId)
    })

    it('does NOT mint new sprint IDs — migration moves a project, it does not copy one', async () => {
      mockProjectExists.mockImplementation((id: string) =>
        Promise.resolve(id === 'p1')
      )

      await migrateLocalToCloud('uid-1', testProfile)

      const [, doc] = mockSaveProjectImmediate.mock.calls[0]
      // ⚠️ import-utils.ts's copy path DOES mint new sprint ids, because the
      // original survives alongside the copy. Migration has no such twin, so
      // regenerating here would churn ids for nothing. Same-looking code,
      // different situation — do not "fix" this toward the copy path.
      expect(doc.sprints.map((s: { id: string }) => s.id)).toEqual([
        'alpha-s1',
        'alpha-s2',
      ])
    })

    it('keeps each project to its own sprints when every ID is reassigned', async () => {
      mockProjectExists.mockRejectedValue(new Error('permission-denied'))

      await migrateLocalToCloud('uid-1', testProfile)

      const [alphaId, alphaDoc] = mockSaveProjectImmediate.mock.calls[0]
      const [betaId, betaDoc] = mockSaveProjectImmediate.mock.calls[1]
      expect(alphaId).not.toBe(betaId)
      expect(alphaDoc.sprints.map((s: { id: string }) => s.id)).toEqual([
        'alpha-s1',
        'alpha-s2',
      ])
      expect(betaDoc.sprints.map((s: { id: string }) => s.id)).toEqual([
        'beta-s1',
        'beta-s2',
      ])
    })
  })

  it('reports the permission-denied reassignment instead of passing it off as a clean upload', async () => {
    mockProjectExists.mockRejectedValue(new Error('permission-denied'))

    const result = await migrateLocalToCloud('uid-1', testProfile)

    // Both projects were reassigned. The collision branch already said so; this
    // branch used to say nothing at all, so a reassignment caused by someone
    // else owning the id reached the user as an unqualified success.
    expect(result.errors).toHaveLength(2)
    for (const name of ['Project Alpha', 'Project Beta']) {
      expect(result.errors.some((e) => e.includes(name))).toBe(true)
    }
  })
})
