import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FirestoreProfileDoc } from './types'

// --- Mock dependencies ---

const mockSaveProjectImmediate = vi.fn()
const mockSaveSettingsImmediate = vi.fn()
const mockUpsertProfile = vi.fn()
const mockProjectExists = vi.fn()

vi.mock('./firestore-driver', () => ({
  saveProjectImmediate: (...args: unknown[]) => mockSaveProjectImmediate(...args),
  saveSettingsImmediate: (...args: unknown[]) => mockSaveSettingsImmediate(...args),
  upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
  projectExists: (...args: unknown[]) => mockProjectExists(...args),
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
  sprints: [],
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
})
