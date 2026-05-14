// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useProjectStore,
  selectActiveProject,
  selectViewingProject,
  selectProjectSprints,
  selectIncludedSprints,
  selectProjectAdjustments,
  validateImportData,
  type ExportData,
} from './project-store'
import { DEFAULT_BURN_UP_CONFIG } from '@/shared/types/burn-up'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { ChangeLogEntry } from './storage'
import type { Project, Sprint } from '@/shared/types'

// Helper: reset store state before each test
function resetStore() {
  useProjectStore.setState({
    projects: [],
    sprints: [],
    viewingProjectId: null,
    forecastInputs: {},
    burnUpConfigs: {},
    _originRef: '',
    _changeLog: [],
  })
}

// Helper: create a minimal project for testing
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'proj-1',
    name: overrides.name ?? 'Test Project',
    unitOfMeasure: overrides.unitOfMeasure ?? 'Story Points',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// Helper: create a minimal sprint for testing
function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: overrides.id ?? 'sprint-1',
    projectId: overrides.projectId ?? 'proj-1',
    sprintNumber: overrides.sprintNumber ?? 1,
    sprintStartDate: '2026-01-06',
    sprintFinishDate: '2026-01-17',
    doneValue: overrides.doneValue ?? 10,
    includedInForecast: overrides.includedInForecast ?? true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  resetStore()
})

// --- Selectors ---

describe('selectActiveProject', () => {
  it('returns undefined for empty projects', () => {
    const result = selectActiveProject(useProjectStore.getState())
    expect(result).toBeUndefined()
  })

  it('returns first project', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'a' }), makeProject({ id: 'b' })] })
    const result = selectActiveProject(useProjectStore.getState())
    expect(result?.id).toBe('a')
  })
})

describe('selectViewingProject', () => {
  it('returns first project when viewingProjectId is null', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'a' })] })
    const result = selectViewingProject(useProjectStore.getState())
    expect(result?.id).toBe('a')
  })

  it('returns the specific project when viewingProjectId is valid', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
      viewingProjectId: 'b',
    })
    const result = selectViewingProject(useProjectStore.getState())
    expect(result?.id).toBe('b')
  })

  it('falls back to first project when viewingProjectId is stale', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' })],
      viewingProjectId: 'deleted-id',
    })
    const result = selectViewingProject(useProjectStore.getState())
    expect(result?.id).toBe('a')
  })

  it('returns undefined when no projects and viewingProjectId is null', () => {
    const result = selectViewingProject(useProjectStore.getState())
    expect(result).toBeUndefined()
  })
})

describe('selectProjectSprints', () => {
  it('filters sprints by projectId', () => {
    useProjectStore.setState({
      sprints: [
        makeSprint({ id: 's1', projectId: 'proj-1' }),
        makeSprint({ id: 's2', projectId: 'proj-2' }),
        makeSprint({ id: 's3', projectId: 'proj-1' }),
      ],
    })
    const result = selectProjectSprints('proj-1')(useProjectStore.getState())
    expect(result).toHaveLength(2)
    expect(result.map((s) => s.id)).toEqual(['s1', 's3'])
  })

  it('returns empty array for unknown projectId', () => {
    useProjectStore.setState({ sprints: [makeSprint()] })
    const result = selectProjectSprints('unknown')(useProjectStore.getState())
    expect(result).toHaveLength(0)
  })
})

describe('selectIncludedSprints', () => {
  it('filters by projectId and includedInForecast', () => {
    useProjectStore.setState({
      sprints: [
        makeSprint({ id: 's1', projectId: 'proj-1', includedInForecast: true }),
        makeSprint({ id: 's2', projectId: 'proj-1', includedInForecast: false }),
        makeSprint({ id: 's3', projectId: 'proj-2', includedInForecast: true }),
      ],
    })
    const result = selectIncludedSprints('proj-1')(useProjectStore.getState())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s1')
  })
})

describe('selectProjectAdjustments', () => {
  it('returns adjustments for the given project', () => {
    useProjectStore.setState({
      projects: [
        makeProject({
          id: 'proj-1',
          productivityAdjustments: [
            { id: 'adj-1', name: 'Holiday', startDate: '2026-12-20', endDate: '2026-12-31', factor: 0.5, enabled: true, createdAt: '', updatedAt: '' },
          ],
        }),
      ],
    })
    const result = selectProjectAdjustments('proj-1')(useProjectStore.getState())
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Holiday')
  })

  it('returns empty array when project has no adjustments', () => {
    useProjectStore.setState({ projects: [makeProject()] })
    const result = selectProjectAdjustments('proj-1')(useProjectStore.getState())
    expect(result).toHaveLength(0)
  })
})

// --- Mutations ---

describe('addProject', () => {
  it('adds a project with generated id and timestamps', () => {
    const { addProject } = useProjectStore.getState()
    addProject({ name: 'New Project', unitOfMeasure: 'Points' })

    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0].name).toBe('New Project')
    expect(state.projects[0].id).toBeTruthy()
    expect(state.projects[0].createdAt).toBeTruthy()
    expect(state.projects[0].updatedAt).toBeTruthy()
  })
})

describe('updateProject', () => {
  it('updates fields and updatedAt', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'proj-1', name: 'Old Name' })] })

    const { updateProject } = useProjectStore.getState()
    updateProject('proj-1', { name: 'New Name' })

    const state = useProjectStore.getState()
    expect(state.projects[0].name).toBe('New Name')
    expect(state.projects[0].updatedAt).not.toBe('2026-01-01T00:00:00Z')
  })
})

describe('deleteProject', () => {
  it('removes project and its sprints', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'proj-1' }), makeProject({ id: 'proj-2' })],
      sprints: [
        makeSprint({ id: 's1', projectId: 'proj-1' }),
        makeSprint({ id: 's2', projectId: 'proj-2' }),
      ],
    })

    const { deleteProject } = useProjectStore.getState()
    deleteProject('proj-1')

    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0].id).toBe('proj-2')
    expect(state.sprints).toHaveLength(1)
    expect(state.sprints[0].projectId).toBe('proj-2')
  })

  it('resets viewingProjectId when deleting the viewed project', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'proj-1' }), makeProject({ id: 'proj-2' })],
      viewingProjectId: 'proj-1',
    })

    const { deleteProject } = useProjectStore.getState()
    deleteProject('proj-1')

    const state = useProjectStore.getState()
    expect(state.viewingProjectId).toBe('proj-2')
  })

  it('sets viewingProjectId to null when deleting the last project', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'proj-1' })],
      viewingProjectId: 'proj-1',
    })

    const { deleteProject } = useProjectStore.getState()
    deleteProject('proj-1')

    const state = useProjectStore.getState()
    expect(state.viewingProjectId).toBeNull()
  })

  it('preserves viewingProjectId when deleting a different project', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'proj-1' }), makeProject({ id: 'proj-2' })],
      viewingProjectId: 'proj-2',
    })

    const { deleteProject } = useProjectStore.getState()
    deleteProject('proj-1')

    const state = useProjectStore.getState()
    expect(state.viewingProjectId).toBe('proj-2')
  })

  it('cleans up forecastInputs and burnUpConfigs', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'proj-1' })],
      forecastInputs: { 'proj-1': { remainingBacklog: '100', velocityMean: '10', velocityStdDev: '3' } },
      burnUpConfigs: { 'proj-1': DEFAULT_BURN_UP_CONFIG },
    })

    const { deleteProject } = useProjectStore.getState()
    deleteProject('proj-1')

    const state = useProjectStore.getState()
    expect(state.forecastInputs).toEqual({})
    expect(state.burnUpConfigs).toEqual({})
  })
})

describe('cloneProject', () => {
  it('returns null when source not found', () => {
    const { cloneProject } = useProjectStore.getState()
    const result = cloneProject('nope')
    expect(result).toBeNull()
    expect(useProjectStore.getState().projects).toHaveLength(0)
  })

  it('clones with "X - Copy (1)" name and a fresh id', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'proj-1', name: 'Alpha' })] })

    const newId = useProjectStore.getState().cloneProject('proj-1')

    expect(newId).toBeTruthy()
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(2)
    expect(state.projects[1].id).toBe(newId)
    expect(state.projects[1].id).not.toBe('proj-1')
    expect(state.projects[1].name).toBe('Alpha - Copy (1)')
  })

  it('inserts the clone immediately after the source', () => {
    useProjectStore.setState({
      projects: [
        makeProject({ id: 'a', name: 'A' }),
        makeProject({ id: 'b', name: 'B' }),
        makeProject({ id: 'c', name: 'C' }),
      ],
    })

    useProjectStore.getState().cloneProject('b')

    const names = useProjectStore.getState().projects.map((p) => p.name)
    expect(names).toEqual(['A', 'B', 'B - Copy (1)', 'C'])
  })

  it('increments the suffix when "X - Copy (N)" already exists', () => {
    useProjectStore.setState({
      projects: [
        makeProject({ id: 'p1', name: 'Source' }),
        makeProject({ id: 'p2', name: 'Source - Copy (1)' }),
        makeProject({ id: 'p3', name: 'Source - Copy (2)' }),
      ],
    })

    useProjectStore.getState().cloneProject('p1')

    const names = useProjectStore.getState().projects.map((p) => p.name)
    expect(names).toContain('Source - Copy (3)')
  })

  it('deep-clones milestones with new ids', () => {
    useProjectStore.setState({
      projects: [
        makeProject({
          id: 'proj-1',
          milestones: [
            { id: 'm1', name: 'MVP', backlogSize: 50, color: '#10b981', createdAt: 'x', updatedAt: 'x' },
            { id: 'm2', name: 'GA', backlogSize: 120, color: '#0070f3', createdAt: 'x', updatedAt: 'x' },
          ],
        }),
      ],
    })

    const newId = useProjectStore.getState().cloneProject('proj-1')!
    const clone = useProjectStore.getState().projects.find((p) => p.id === newId)!

    expect(clone.milestones).toHaveLength(2)
    expect(clone.milestones![0].id).not.toBe('m1')
    expect(clone.milestones![1].id).not.toBe('m2')
    expect(clone.milestones![0].name).toBe('MVP')
    expect(clone.milestones![0].backlogSize).toBe(50)
    expect(clone.milestones![0].color).toBe('#10b981')
    expect(clone.milestones![1].name).toBe('GA')
  })

  it('deep-clones productivity adjustments with new ids', () => {
    useProjectStore.setState({
      projects: [
        makeProject({
          id: 'proj-1',
          productivityAdjustments: [
            {
              id: 'a1',
              name: 'Holidays',
              startDate: '2026-12-22',
              endDate: '2027-01-02',
              factor: 0.5,
              enabled: true,
              createdAt: 'x',
              updatedAt: 'x',
            },
          ],
        }),
      ],
    })

    const newId = useProjectStore.getState().cloneProject('proj-1')!
    const clone = useProjectStore.getState().projects.find((p) => p.id === newId)!

    expect(clone.productivityAdjustments).toHaveLength(1)
    expect(clone.productivityAdjustments![0].id).not.toBe('a1')
    expect(clone.productivityAdjustments![0].name).toBe('Holidays')
    expect(clone.productivityAdjustments![0].factor).toBe(0.5)
    expect(clone.productivityAdjustments![0].enabled).toBe(true)
  })

  it('clones sprints with new ids rebound to the new project', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'proj-1' }), makeProject({ id: 'proj-2' })],
      sprints: [
        makeSprint({ id: 's1', projectId: 'proj-1', sprintNumber: 1, doneValue: 8 }),
        makeSprint({ id: 's2', projectId: 'proj-1', sprintNumber: 2, doneValue: 11, includedInForecast: false }),
        makeSprint({ id: 's3', projectId: 'proj-2', sprintNumber: 1, doneValue: 7 }),
      ],
    })

    const newId = useProjectStore.getState().cloneProject('proj-1')!
    const state = useProjectStore.getState()

    // Source sprints untouched
    const sourceSprints = state.sprints.filter((s) => s.projectId === 'proj-1')
    expect(sourceSprints.map((s) => s.id).sort()).toEqual(['s1', 's2'])

    // Clone sprints exist with new ids
    const cloneSprints = state.sprints.filter((s) => s.projectId === newId)
    expect(cloneSprints).toHaveLength(2)
    expect(cloneSprints.every((s) => s.id !== 's1' && s.id !== 's2')).toBe(true)
    expect(cloneSprints.map((s) => s.sprintNumber).sort()).toEqual([1, 2])
    expect(cloneSprints.find((s) => s.sprintNumber === 2)!.includedInForecast).toBe(false)

    // Other project's sprints untouched
    const otherSprints = state.sprints.filter((s) => s.projectId === 'proj-2')
    expect(otherSprints.map((s) => s.id)).toEqual(['s3'])
  })

  it('appends an "add project" entry to the change log', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'proj-1' })], _changeLog: [] })

    const newId = useProjectStore.getState().cloneProject('proj-1')!

    const log = useProjectStore.getState()._changeLog
    expect(log).toHaveLength(1)
    expect(log[0].op).toBe('add')
    expect(log[0].entity).toBe('project')
    expect(log[0].id).toBe(newId)
  })

  it('emits a project:save sync event for the new project', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'proj-1' })] })
    const spy = vi.spyOn(syncBus, 'emit')

    const newId = useProjectStore.getState().cloneProject('proj-1')!

    expect(spy).toHaveBeenCalledWith({ type: 'project:save', projectId: newId })
    spy.mockRestore()
  })
})

describe('reorderProjects', () => {
  it('reorders projects by id list', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a', name: 'A' }), makeProject({ id: 'b', name: 'B' }), makeProject({ id: 'c', name: 'C' })],
    })

    const { reorderProjects } = useProjectStore.getState()
    reorderProjects(['c', 'a', 'b'])

    const names = useProjectStore.getState().projects.map((p) => p.name)
    expect(names).toEqual(['C', 'A', 'B'])
  })
})

describe('addSprint', () => {
  it('adds a sprint with generated id and timestamps', () => {
    const { addSprint } = useProjectStore.getState()
    addSprint({
      projectId: 'proj-1',
      sprintNumber: 1,
      sprintStartDate: '2026-01-06',
      sprintFinishDate: '2026-01-17',
      doneValue: 10,
      includedInForecast: true,
    })

    const state = useProjectStore.getState()
    expect(state.sprints).toHaveLength(1)
    expect(state.sprints[0].doneValue).toBe(10)
    expect(state.sprints[0].id).toBeTruthy()
  })
})

describe('updateSprint', () => {
  it('updates fields and updatedAt', () => {
    useProjectStore.setState({ sprints: [makeSprint({ id: 's1', doneValue: 10 })] })

    const { updateSprint } = useProjectStore.getState()
    updateSprint('s1', { doneValue: 20 })

    const state = useProjectStore.getState()
    expect(state.sprints[0].doneValue).toBe(20)
  })
})

describe('deleteSprint', () => {
  it('removes only the target sprint', () => {
    useProjectStore.setState({
      sprints: [makeSprint({ id: 's1' }), makeSprint({ id: 's2' })],
    })

    const { deleteSprint } = useProjectStore.getState()
    deleteSprint('s1')

    const state = useProjectStore.getState()
    expect(state.sprints).toHaveLength(1)
    expect(state.sprints[0].id).toBe('s2')
  })
})

describe('toggleSprintIncluded', () => {
  it('flips includedInForecast', () => {
    useProjectStore.setState({
      sprints: [makeSprint({ id: 's1', includedInForecast: true })],
    })

    const { toggleSprintIncluded } = useProjectStore.getState()
    toggleSprintIncluded('s1')

    expect(useProjectStore.getState().sprints[0].includedInForecast).toBe(false)

    toggleSprintIncluded('s1')
    expect(useProjectStore.getState().sprints[0].includedInForecast).toBe(true)
  })
})

// --- Productivity adjustments ---

describe('addProductivityAdjustment', () => {
  it('adds adjustment to the correct project', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'proj-1' })] })

    const { addProductivityAdjustment } = useProjectStore.getState()
    addProductivityAdjustment('proj-1', {
      name: 'Holiday',
      startDate: '2026-12-20',
      endDate: '2026-12-31',
      factor: 0.5,
      enabled: true,
    })

    const state = useProjectStore.getState()
    const adjs = state.projects[0].productivityAdjustments
    expect(adjs).toHaveLength(1)
    expect(adjs![0].name).toBe('Holiday')
    expect(adjs![0].id).toBeTruthy()
  })
})

describe('deleteProductivityAdjustment', () => {
  it('removes only the target adjustment', () => {
    useProjectStore.setState({
      projects: [
        makeProject({
          id: 'proj-1',
          productivityAdjustments: [
            { id: 'adj-1', name: 'A', startDate: '', endDate: '', factor: 0.5, enabled: true, createdAt: '', updatedAt: '' },
            { id: 'adj-2', name: 'B', startDate: '', endDate: '', factor: 0.8, enabled: true, createdAt: '', updatedAt: '' },
          ],
        }),
      ],
    })

    const { deleteProductivityAdjustment } = useProjectStore.getState()
    deleteProductivityAdjustment('proj-1', 'adj-1')

    const adjs = useProjectStore.getState().projects[0].productivityAdjustments
    expect(adjs).toHaveLength(1)
    expect(adjs![0].id).toBe('adj-2')
  })
})

// --- Session state ---

describe('forecastInputs', () => {
  it('stores and retrieves per-project inputs', () => {
    const { setForecastInput, getForecastInputs } = useProjectStore.getState()
    setForecastInput('proj-1', 'remainingBacklog', '100')
    setForecastInput('proj-1', 'velocityMean', '20')

    const inputs = getForecastInputs('proj-1')
    expect(inputs.remainingBacklog).toBe('100')
    expect(inputs.velocityMean).toBe('20')
    expect(inputs.velocityStdDev).toBe('')
  })

  it('returns defaults for unknown project', () => {
    const { getForecastInputs } = useProjectStore.getState()
    const inputs = getForecastInputs('unknown')
    expect(inputs).toEqual({ remainingBacklog: '', velocityMean: '', velocityStdDev: '' })
  })

  it('stores and retrieves forecastMode', () => {
    const { setForecastInput, getForecastInputs } = useProjectStore.getState()
    setForecastInput('proj-1', 'forecastMode', 'subjective')

    const inputs = getForecastInputs('proj-1')
    expect(inputs.forecastMode).toBe('subjective')
  })

  it('stores and retrieves velocityEstimate', () => {
    const { setForecastInput, getForecastInputs } = useProjectStore.getState()
    setForecastInput('proj-1', 'velocityEstimate', '45')

    const inputs = getForecastInputs('proj-1')
    expect(inputs.velocityEstimate).toBe('45')
  })

  it('stores and retrieves selectedCV', () => {
    const { setForecastInput, getForecastInputs } = useProjectStore.getState()
    setForecastInput('proj-1', 'selectedCV', 0.45)

    const inputs = getForecastInputs('proj-1')
    expect(inputs.selectedCV).toBe(0.45)
  })

  it('stores and retrieves volatilityMultiplier', () => {
    const { setForecastInput, getForecastInputs } = useProjectStore.getState()
    setForecastInput('proj-1', 'volatilityMultiplier', 1.5)

    const inputs = getForecastInputs('proj-1')
    expect(inputs.volatilityMultiplier).toBe(1.5)
  })

  it('keeps inputs independent across projects', () => {
    const { setForecastInput, getForecastInputs } = useProjectStore.getState()
    setForecastInput('proj-1', 'forecastMode', 'subjective')
    setForecastInput('proj-2', 'forecastMode', 'history')

    expect(getForecastInputs('proj-1').forecastMode).toBe('subjective')
    expect(getForecastInputs('proj-2').forecastMode).toBe('history')
  })
})

describe('burnUpConfig', () => {
  it('stores and retrieves per-project config', () => {
    const { setBurnUpConfig, getBurnUpConfig } = useProjectStore.getState()
    const customConfig = { ...DEFAULT_BURN_UP_CONFIG, distribution: 'gamma' as const }
    setBurnUpConfig('proj-1', customConfig)

    const config = getBurnUpConfig('proj-1')
    expect(config.distribution).toBe('gamma')
  })

  it('returns default config for unknown project', () => {
    const { getBurnUpConfig } = useProjectStore.getState()
    const config = getBurnUpConfig('unknown')
    expect(config).toEqual(DEFAULT_BURN_UP_CONFIG)
  })
})

// --- Import/Export ---

describe('exportData', () => {
  it('includes version, timestamp, projects, and sprints', () => {
    useProjectStore.setState({
      projects: [makeProject()],
      sprints: [makeSprint()],
    })

    const { exportData } = useProjectStore.getState()
    const data = exportData()

    expect(data.version).toBeTruthy()
    expect(data.exportedAt).toBeTruthy()
    expect(data.projects).toHaveLength(1)
    expect(data.sprints).toHaveLength(1)
  })
})

// --- validateImportData ---

describe('validateImportData', () => {
  it('accepts valid data', () => {
    expect(
      validateImportData({
        version: '0.10.0',
        exportedAt: '2026-01-01T00:00:00Z',
        projects: [{ id: 'p1', name: 'Test', unitOfMeasure: 'SP', createdAt: '', updatedAt: '' }],
        sprints: [{ id: 's1', projectId: 'p1', sprintNumber: 1, doneValue: 10, sprintStartDate: '2026-01-06', sprintFinishDate: '2026-01-17', includedInForecast: true, createdAt: '', updatedAt: '' }],
      })
    ).toBe(true)
  })

  it('accepts valid data with empty arrays', () => {
    expect(
      validateImportData({
        version: '0.10.0',
        exportedAt: '2026-01-01T00:00:00Z',
        projects: [],
        sprints: [],
      })
    ).toBe(true)
  })

  it('rejects null', () => {
    expect(() => validateImportData(null)).toThrow('Import data must be a JSON object.')
  })

  it('rejects non-object', () => {
    expect(() => validateImportData('string')).toThrow('Import data must be a JSON object.')
  })

  it('rejects missing projects array', () => {
    expect(() => validateImportData({ sprints: [] })).toThrow('missing a valid "projects" array')
  })

  it('rejects missing sprints array', () => {
    expect(() => validateImportData({ projects: [] })).toThrow('missing a valid "sprints" array')
  })

  it('rejects project without id', () => {
    expect(() =>
      validateImportData({
        projects: [{ name: 'Test', unitOfMeasure: 'SP' }],
        sprints: [],
      })
    ).toThrow('Project at index 0 is missing a valid "id"')
  })

  it('rejects project without name', () => {
    expect(() =>
      validateImportData({
        projects: [{ id: 'p1', unitOfMeasure: 'SP' }],
        sprints: [],
      })
    ).toThrow('Project at index 0 is missing a valid "name"')
  })

  it('rejects sprint without projectId', () => {
    expect(() =>
      validateImportData({
        projects: [],
        sprints: [{ id: 's1', sprintNumber: 1, doneValue: 10 }],
      })
    ).toThrow('Sprint at index 0 is missing a valid "projectId"')
  })

  it('rejects sprint without doneValue', () => {
    expect(() =>
      validateImportData({
        projects: [],
        sprints: [{ id: 's1', projectId: 'p1', sprintNumber: 1 }],
      })
    ).toThrow('Sprint at index 0 has invalid doneValue')
  })

  it('rejects sprint with invalid sprintNumber', () => {
    expect(() =>
      validateImportData({
        projects: [],
        sprints: [{ id: 's1', projectId: 'p1', sprintNumber: 0, doneValue: 10 }],
      })
    ).toThrow('Sprint at index 0 has invalid sprintNumber')
  })

  it('rejects sprint with negative doneValue', () => {
    expect(() =>
      validateImportData({
        projects: [],
        sprints: [{ id: 's1', projectId: 'p1', sprintNumber: 1, doneValue: -5 }],
      })
    ).toThrow('Sprint at index 0 has invalid doneValue')
  })

  it('rejects sprint with invalid date', () => {
    expect(() =>
      validateImportData({
        projects: [],
        sprints: [{ id: 's1', projectId: 'p1', sprintNumber: 1, doneValue: 10, sprintStartDate: '2026-02-30' }],
      })
    ).toThrow('Sprint at index 0 has invalid sprintStartDate')
  })

  it('rejects project with name exceeding max length', () => {
    expect(() =>
      validateImportData({
        projects: [{ id: 'p1', name: 'A'.repeat(201), unitOfMeasure: 'SP' }],
        sprints: [],
      })
    ).toThrow('Project at index 0 has a name exceeding 200 characters')
  })

  it('rejects duplicate project IDs', () => {
    expect(() =>
      validateImportData({
        projects: [
          { id: 'p1', name: 'Test 1', unitOfMeasure: 'SP' },
          { id: 'p1', name: 'Test 2', unitOfMeasure: 'SP' },
        ],
        sprints: [],
      })
    ).toThrow('Duplicate project ID "p1" found at index 1')
  })
})

// --- Workspace Reconciliation (_originRef) ---

describe('_originRef', () => {
  it('sets _originRef on first addProject', () => {
    const { addProject } = useProjectStore.getState()
    addProject({ name: 'P1', unitOfMeasure: 'SP' })
    const state = useProjectStore.getState()
    expect(state._originRef).toBeTruthy()
    expect(typeof state._originRef).toBe('string')
  })

  it('does not change _originRef on subsequent addProject', () => {
    const { addProject } = useProjectStore.getState()
    addProject({ name: 'P1', unitOfMeasure: 'SP' })
    const originAfterFirst = useProjectStore.getState()._originRef
    addProject({ name: 'P2', unitOfMeasure: 'SP' })
    const originAfterSecond = useProjectStore.getState()._originRef
    expect(originAfterFirst).toBe(originAfterSecond)
  })
})

// --- Change Log ---

describe('_changeLog', () => {
  it('addProject appends add-project entry', () => {
    const { addProject } = useProjectStore.getState()
    addProject({ name: 'P1', unitOfMeasure: 'SP' })
    const { _changeLog, projects } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('add')
    expect(_changeLog[0].entity).toBe('project')
    expect(_changeLog[0].id).toBe(projects[0].id)
    expect(_changeLog[0].t).toBeGreaterThan(0)
  })

  it('deleteProject appends delete-project entry', () => {
    useProjectStore.setState({ projects: [makeProject()], sprints: [] })
    const { deleteProject } = useProjectStore.getState()
    deleteProject('proj-1')
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('delete')
    expect(_changeLog[0].entity).toBe('project')
    expect(_changeLog[0].id).toBe('proj-1')
  })

  it('addSprint appends add-sprint entry', () => {
    useProjectStore.setState({ projects: [makeProject()], sprints: [] })
    const { addSprint } = useProjectStore.getState()
    addSprint({
      projectId: 'proj-1',
      sprintNumber: 1,
      sprintStartDate: '2026-01-06',
      sprintFinishDate: '2026-01-17',
      doneValue: 10,
      includedInForecast: true,
    })
    const { _changeLog, sprints } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('add')
    expect(_changeLog[0].entity).toBe('sprint')
    expect(_changeLog[0].id).toBe(sprints[0].id)
  })

  it('deleteSprint appends delete-sprint entry', () => {
    useProjectStore.setState({ projects: [makeProject()], sprints: [makeSprint()] })
    const { deleteSprint } = useProjectStore.getState()
    deleteSprint('sprint-1')
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('delete')
    expect(_changeLog[0].entity).toBe('sprint')
    expect(_changeLog[0].id).toBe('sprint-1')
  })

  it('addProductivityAdjustment appends add-adjustment entry', () => {
    useProjectStore.setState({ projects: [makeProject()], sprints: [] })
    const { addProductivityAdjustment } = useProjectStore.getState()
    addProductivityAdjustment('proj-1', {
      name: 'Holiday',
      startDate: '2026-12-20',
      endDate: '2026-12-31',
      factor: 0.5,
      enabled: true,
    })
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('add')
    expect(_changeLog[0].entity).toBe('adjustment')
    expect(_changeLog[0].id).toBeTruthy()
  })

  it('deleteProductivityAdjustment appends delete-adjustment entry', () => {
    useProjectStore.setState({
      projects: [makeProject({
        productivityAdjustments: [{
          id: 'adj-1', name: 'Holiday', startDate: '2026-12-20', endDate: '2026-12-31',
          factor: 0.5, enabled: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        }],
      })],
      sprints: [],
    })
    const { deleteProductivityAdjustment } = useProjectStore.getState()
    deleteProductivityAdjustment('proj-1', 'adj-1')
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('delete')
    expect(_changeLog[0].entity).toBe('adjustment')
    expect(_changeLog[0].id).toBe('adj-1')
  })

  it('addMilestone appends add-milestone entry', () => {
    useProjectStore.setState({ projects: [makeProject()], sprints: [] })
    const { addMilestone } = useProjectStore.getState()
    addMilestone('proj-1', { name: 'MVP', backlogSize: 100, color: '#ff0000' })
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('add')
    expect(_changeLog[0].entity).toBe('milestone')
    expect(_changeLog[0].id).toBeTruthy()
  })

  it('deleteMilestone appends delete-milestone entry', () => {
    useProjectStore.setState({
      projects: [makeProject({
        milestones: [{
          id: 'ms-1', name: 'MVP', backlogSize: 100, color: '#ff0000',
          createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        }],
      })],
      sprints: [],
    })
    const { deleteMilestone } = useProjectStore.getState()
    deleteMilestone('proj-1', 'ms-1')
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('delete')
    expect(_changeLog[0].entity).toBe('milestone')
    expect(_changeLog[0].id).toBe('ms-1')
  })

  it('non-structural mutations do NOT append changelog entries', () => {
    useProjectStore.setState({ projects: [makeProject()], sprints: [makeSprint()] })
    const state = useProjectStore.getState()

    // updateProject
    state.updateProject('proj-1', { name: 'Updated' })
    expect(useProjectStore.getState()._changeLog).toHaveLength(0)

    // updateSprint
    state.updateSprint('sprint-1', { doneValue: 20 })
    expect(useProjectStore.getState()._changeLog).toHaveLength(0)

    // toggleSprintIncluded
    state.toggleSprintIncluded('sprint-1')
    expect(useProjectStore.getState()._changeLog).toHaveLength(0)

    // reorderProjects
    state.reorderProjects(['proj-1'])
    expect(useProjectStore.getState()._changeLog).toHaveLength(0)
  })
})

// --- Export with fingerprinting ---

describe('exportData with fingerprinting', () => {
  it('includes _originRef and _storageRef and _changeLog', () => {
    const { addProject } = useProjectStore.getState()
    addProject({ name: 'P1', unitOfMeasure: 'SP' })
    const data = useProjectStore.getState().exportData()
    expect(data._originRef).toBeTruthy()
    expect(data._storageRef).toBeTruthy()
    expect(Array.isArray(data._changeLog)).toBe(true)
    expect(data._changeLog!.length).toBeGreaterThan(0)
  })

  it('omits _exportedBy and _exportedById when settings are empty', () => {
    const { addProject } = useProjectStore.getState()
    addProject({ name: 'P1', unitOfMeasure: 'SP' })
    const data = useProjectStore.getState().exportData()
    expect(data._exportedBy).toBeUndefined()
    expect(data._exportedById).toBeUndefined()
  })
})

describe('clearProjectsOnSignOut', () => {
  it('zeros user-scoped data fields', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
      sprints: [
        makeSprint({ id: 's1', projectId: 'a' }),
        makeSprint({ id: 's2', projectId: 'a' }),
        makeSprint({ id: 's3', projectId: 'b' }),
      ],
      viewingProjectId: 'b',
      forecastInputs: {
        a: { remainingBacklog: '50', velocityMean: '10', velocityStdDev: '2' },
      },
      burnUpConfigs: {
        a: DEFAULT_BURN_UP_CONFIG,
      },
    })

    useProjectStore.getState().clearProjectsOnSignOut()

    const state = useProjectStore.getState()
    expect(state.projects).toEqual([])
    expect(state.sprints).toEqual([])
    expect(state.viewingProjectId).toBeNull()
    expect(state.forecastInputs).toEqual({})
    expect(state.burnUpConfigs).toEqual({})
  })

  it('preserves _originRef (browser-scoped workspace identity)', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' })],
      sprints: [makeSprint({ id: 's1', projectId: 'a' })],
      _originRef: 'abc-123-browser-origin',
    })

    useProjectStore.getState().clearProjectsOnSignOut()

    expect(useProjectStore.getState()._originRef).toBe('abc-123-browser-origin')
  })

  it('clears _changeLog so the prior user\'s activity timeline does not leak across sign-out (v0.28.3 L2)', () => {
    const originalLog = [
      { t: 1000, op: 'add', entity: 'project', id: 'a' },
      { t: 2000, op: 'add', entity: 'sprint', id: 's1' },
    ]
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' })],
      sprints: [makeSprint({ id: 's1', projectId: 'a' })],
      _changeLog: originalLog,
    })

    useProjectStore.getState().clearProjectsOnSignOut()

    expect(useProjectStore.getState()._changeLog).toEqual([])
  })

  it('does not emit to syncBus (prevents cloud-side delete storm on sign-out)', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
      sprints: [makeSprint({ id: 's1', projectId: 'a' })],
    })
    const spy = vi.fn()
    const unsubscribe = syncBus.subscribe(spy)

    useProjectStore.getState().clearProjectsOnSignOut()

    unsubscribe()
    expect(spy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// importDataAndSelectFirst (v0.30.0)
// ---------------------------------------------------------------------------

describe('importDataAndSelectFirst', () => {
  function makeExportData(overrides: Partial<ExportData> = {}): ExportData {
    return {
      version: '0.30.0',
      exportedAt: '2026-05-14T00:00:00.000Z',
      projects: [makeProject({ id: 'p1' })],
      sprints: [],
      ...overrides,
    }
  }

  it('sets projects, sprints, _originRef, _changeLog in one set() call', () => {
    const data = makeExportData()
    useProjectStore.getState().importDataAndSelectFirst(data)
    const state = useProjectStore.getState()
    expect(state.projects).toEqual(data.projects)
    expect(state.sprints).toEqual(data.sprints)
    expect(state._originRef).toBeTruthy()
    expect(state._changeLog.length).toBeGreaterThan(0)
  })

  it('sets viewingProjectId to firstProjectId when provided', () => {
    const data = makeExportData()
    useProjectStore.getState().importDataAndSelectFirst(data, 'p1')
    expect(useProjectStore.getState().viewingProjectId).toBe('p1')
  })

  it('sets viewingProjectId to null when firstProjectId is undefined', () => {
    const data = makeExportData()
    useProjectStore.setState({ viewingProjectId: 'stale' })
    useProjectStore.getState().importDataAndSelectFirst(data)
    expect(useProjectStore.getState().viewingProjectId).toBeNull()
  })

  it('zeros forecastInputs', () => {
    useProjectStore.setState({
      forecastInputs: { x: { remainingBacklog: '5', velocityMean: '1', velocityStdDev: '0' } },
    })
    useProjectStore.getState().importDataAndSelectFirst(makeExportData())
    expect(useProjectStore.getState().forecastInputs).toEqual({})
  })

  it('zeros burnUpConfigs', () => {
    useProjectStore.setState({ burnUpConfigs: { x: DEFAULT_BURN_UP_CONFIG } })
    useProjectStore.getState().importDataAndSelectFirst(makeExportData())
    expect(useProjectStore.getState().burnUpConfigs).toEqual({})
  })

  it('appends to _changeLog with op:"import", source:"file"', () => {
    useProjectStore.setState({ _changeLog: [] })
    useProjectStore.getState().importDataAndSelectFirst(makeExportData())
    const log = useProjectStore.getState()._changeLog
    expect(log.at(-1)?.op).toBe('import')
    expect(log.at(-1)?.source).toBe('file')
  })

  it('emits project:import on syncBus', () => {
    const spy = vi.fn()
    const unsubscribe = syncBus.subscribe(spy)
    useProjectStore.getState().importDataAndSelectFirst(makeExportData())
    unsubscribe()
    const calls = spy.mock.calls.filter(([evt]) => evt?.type === 'project:import')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('preserves _originRef from imported data when present', () => {
    const data = { ...makeExportData(), _originRef: 'imported-origin' }
    useProjectStore.getState().importDataAndSelectFirst(data)
    expect(useProjectStore.getState()._originRef).toBe('imported-origin')
  })

  it('preserves and extends imported _changeLog', () => {
    const importedLog: ChangeLogEntry[] = [{ t: 1, op: 'add', entity: 'project', id: 'p1' }]
    const data = { ...makeExportData(), _changeLog: importedLog }
    useProjectStore.getState().importDataAndSelectFirst(data)
    const log = useProjectStore.getState()._changeLog
    expect(log.length).toBeGreaterThan(1)
    expect(log[0].t).toBe(1)
  })

  // Migrated from removed `describe('importData with fingerprinting')`:
  it('backfills _originRef when missing from imported data', () => {
    useProjectStore.getState().importDataAndSelectFirst(makeExportData())
    const state = useProjectStore.getState()
    expect(state._originRef).toBeTruthy()
    expect(typeof state._originRef).toBe('string')
  })

  it('creates _changeLog with import event if none existed in the file', () => {
    useProjectStore.getState().importDataAndSelectFirst(makeExportData())
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('import')
  })

  it('does not carry _storageRef or attribution fields into store state', () => {
    const data: ExportData = {
      ...makeExportData(),
      _originRef: 'orig',
      _storageRef: 'storage-ref',
      _exportedBy: 'Alice',
      _exportedById: '12345',
    }
    useProjectStore.getState().importDataAndSelectFirst(data)
    const state = useProjectStore.getState()
    expect((state as unknown as Record<string, unknown>)._storageRef).toBeUndefined()
    expect((state as unknown as Record<string, unknown>)._exportedBy).toBeUndefined()
    expect((state as unknown as Record<string, unknown>)._exportedById).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// applySmartImport (v0.30.0)
// ---------------------------------------------------------------------------

describe('applySmartImport', () => {
  type ParsedImportData =
    | { exportType: 'spert-forecaster-project-export'; projects: Project[]; sprints: Sprint[] }
    | { exportType: 'spert-story-map'; projects: Project[]; sprints: Sprint[] }
    | { exportType: 'legacy'; projects: Project[]; sprints: Sprint[]; _originalExportData: { version: string; exportedAt: string; projects: Project[]; sprints: Sprint[] } }

  function projectExportIn(projects: Project[], sprints: Sprint[] = []): ParsedImportData {
    return { exportType: 'spert-forecaster-project-export', projects, sprints }
  }
  function storyMapIn(projects: Project[], sprints: Sprint[] = []): ParsedImportData {
    return { exportType: 'spert-story-map', projects, sprints }
  }
  function legacyIn(projects: Project[], sprints: Sprint[] = []): ParsedImportData {
    return {
      exportType: 'legacy',
      projects,
      sprints,
      _originalExportData: { version: '0.30.0', exportedAt: '2026-05-14', projects, sprints },
    }
  }

  it('returns { ok: true, result } on successful merge', () => {
    const incoming = projectExportIn([makeProject({ id: 'new-1', name: 'New' })])
    const outcome = useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map(),
      freshConflicts: [],
      source: 'spert-forecaster-project-export',
    })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.result.added).toBe(1)
    }
  })

  it('appends spert-story-map to _changeLog for story-map source', () => {
    const incoming = storyMapIn([makeProject({ id: 'a' })])
    useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map(),
      freshConflicts: [],
      source: 'spert-story-map',
    })
    const log = useProjectStore.getState()._changeLog
    expect(log.at(-1)?.source).toBe('spert-story-map')
  })

  // Migrated from removed `describe('mergeImportData with fingerprinting')`:
  it('preserves existing _originRef on a merge-import', () => {
    useProjectStore.setState({ _originRef: 'existing-origin' })
    useProjectStore.getState().applySmartImport({
      incoming: storyMapIn([makeProject({ id: 'a' })]),
      decisions: new Map(),
      freshConflicts: [],
      source: 'spert-story-map',
    })
    expect(useProjectStore.getState()._originRef).toBe('existing-origin')
  })

  it('appends spert-forecaster-project-export to _changeLog for project-export source', () => {
    const incoming = projectExportIn([makeProject({ id: 'a' })])
    useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map(),
      freshConflicts: [],
      source: 'spert-forecaster-project-export',
    })
    expect(useProjectStore.getState()._changeLog.at(-1)?.source).toBe('spert-forecaster-project-export')
  })

  it('appends spert-legacy-export to _changeLog for legacy source (C12)', () => {
    const incoming = legacyIn([makeProject({ id: 'a' })])
    useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map(),
      freshConflicts: [],
      source: 'legacy',
    })
    expect(useProjectStore.getState()._changeLog.at(-1)?.source).toBe('spert-legacy-export')
  })

  it('emits project:import on syncBus ONLY on ok:true (C28)', () => {
    const spy = vi.fn()
    const unsubscribe = syncBus.subscribe(spy)
    useProjectStore.getState().applySmartImport({
      incoming: projectExportIn([makeProject({ id: 'a' })]),
      decisions: new Map(),
      freshConflicts: [],
      source: 'spert-forecaster-project-export',
    })
    unsubscribe()
    const calls = spy.mock.calls.filter(([evt]) => evt?.type === 'project:import')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('does NOT emit project:import on syncBus when drift detected (C28)', () => {
    // Setup: existing project with id 'old'. freshConflicts asserts there's a conflict.
    useProjectStore.setState({ projects: [makeProject({ id: 'old' })] })
    const inc = makeProject({ id: 'in' })
    const incoming = projectExportIn([inc])
    // freshConflicts claims an id-conflict that doesn't actually exist in current state.
    const fakeConflict = {
      type: 'id' as const,
      incomingProject: inc,
      existingProject: makeProject({ id: 'in' }),
    }
    const spy = vi.fn()
    const unsubscribe = syncBus.subscribe(spy)
    const outcome = useProjectStore.getState().applySmartImport({
      incoming,
      decisions: new Map([['in', 'replace']]),
      freshConflicts: [fakeConflict],
      source: 'spert-forecaster-project-export',
    })
    unsubscribe()
    expect(outcome.ok).toBe(false)
    expect(spy.mock.calls.filter(([evt]) => evt?.type === 'project:import')).toHaveLength(0)
  })

  describe('C28: concurrent-delete drift protection (H1)', () => {
    it('returns { ok: false } when conflicts change between hook check and set() write', () => {
      useProjectStore.setState({ projects: [makeProject({ id: 'A' })] })
      // freshConflicts asserts id-conflict on A, but if A is deleted before set(),
      // re-detection will find no conflict → drift.
      // Simulate by passing freshConflicts that does NOT match current state (A missing).
      const inc = makeProject({ id: 'A', name: 'New' })
      useProjectStore.setState({ projects: [] }) // simulate concurrent delete
      const outcome = useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['A', 'replace']]),
        freshConflicts: [
          {
            type: 'id',
            incomingProject: inc,
            existingProject: makeProject({ id: 'A' }),
          },
        ],
        source: 'spert-forecaster-project-export',
      })
      expect(outcome.ok).toBe(false)
      // State should be unchanged.
      expect(useProjectStore.getState().projects).toEqual([])
    })

    it('returns { ok: true } and preserves a concurrently-added project in merged output', () => {
      // Start with [A]. Hook reads, sees [A], freshConflicts=[]. Then D is added concurrently.
      useProjectStore.setState({ projects: [makeProject({ id: 'A' })] })
      // Simulate concurrent add of D BEFORE the set() updater fires.
      useProjectStore.setState({ projects: [makeProject({ id: 'A' }), makeProject({ id: 'D' })] })

      const C = makeProject({ id: 'C', name: 'C' })
      const outcome = useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([C]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-forecaster-project-export',
      })
      expect(outcome.ok).toBe(true)
      const ids = useProjectStore.getState().projects.map((p) => p.id).sort()
      expect(ids).toEqual(['A', 'C', 'D'])
    })

    it('does not drop incoming replace-target on concurrent delete', () => {
      // Two-pass: first set up [A]; record freshConflicts as id-conflict on A.
      // Then delete A. The set() updater should no-op rather than write a phantom replace.
      useProjectStore.setState({ projects: [makeProject({ id: 'A' })] })
      const inc = makeProject({ id: 'A', name: 'New-A' })
      const freshConflicts = [
        {
          type: 'id' as const,
          incomingProject: inc,
          existingProject: makeProject({ id: 'A' }),
        },
      ]
      // Concurrent delete:
      useProjectStore.setState({ projects: [] })
      const outcome = useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['A', 'replace']]),
        freshConflicts,
        source: 'spert-forecaster-project-export',
      })
      expect(outcome.ok).toBe(false)
      // The phantom "replaced" project must NOT silently appear.
      expect(useProjectStore.getState().projects).toEqual([])
    })
  })

  describe('C28: banner accuracy (H2)', () => {
    it('outcome.result counts match the actual state written to the store', () => {
      useProjectStore.setState({ projects: [makeProject({ id: 'existing-1' })] })
      const inc = makeProject({ id: 'new-1', name: 'New' })
      const outcome = useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-forecaster-project-export',
      })
      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        const finalIds = useProjectStore.getState().projects.map((p) => p.id)
        expect(outcome.result.added).toBe(1)
        expect(finalIds).toContain('new-1')
        expect(finalIds).toContain('existing-1')
      }
    })
  })

  describe('viewingProjectId reconciliation (C7 / C30)', () => {
    it('remaps viewingProjectId for name-conflict replace atomically', () => {
      // Subscribe to every Zustand state transition to verify the atomicity
      // invariant: no transition has state.projects ≠ prevState.projects while
      // state.viewingProjectId points to an ID absent from state.projects.
      useProjectStore.setState({
        projects: [makeProject({ id: 'old-id', name: 'Shared' })],
        viewingProjectId: 'old-id',
      })
      const inc = makeProject({ id: 'new-id', name: 'shared' })
      const conflicts = [{ type: 'name' as const, incomingProject: inc, existingProject: makeProject({ id: 'old-id', name: 'Shared' }) }]

      const violations: string[] = []
      const unsubscribe = useProjectStore.subscribe((state, prevState) => {
        if (state.projects !== prevState.projects) {
          const ids = new Set(state.projects.map((p) => p.id))
          if (state.viewingProjectId !== null && !ids.has(state.viewingProjectId)) {
            violations.push(`viewing ${state.viewingProjectId} absent from projects`)
          }
        }
      })

      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['new-id', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      unsubscribe()

      expect(violations).toEqual([])
      expect(useProjectStore.getState().viewingProjectId).toBe('new-id')
    })

    it('leaves viewingProjectId unchanged for ID-conflict replace', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'shared', name: 'Old' })],
        viewingProjectId: 'shared',
      })
      const inc = makeProject({ id: 'shared', name: 'New' })
      const conflicts = [{ type: 'id' as const, incomingProject: inc, existingProject: makeProject({ id: 'shared', name: 'Old' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['shared', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      expect(useProjectStore.getState().viewingProjectId).toBe('shared')
    })

    it('leaves viewingProjectId unchanged when not in replacedIdMap', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'a' }), makeProject({ id: 'b', name: 'Shared' })],
        viewingProjectId: 'a',
      })
      const inc = makeProject({ id: 'c', name: 'shared' })
      const conflicts = [{ type: 'name' as const, incomingProject: inc, existingProject: makeProject({ id: 'b', name: 'Shared' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['c', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      expect(useProjectStore.getState().viewingProjectId).toBe('a')
    })
  })

  describe('forecastInputs handling', () => {
    it('renames forecastInputs[existingId] to forecastInputs[winner.id] for name-conflict replace', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'old', name: 'Shared' })],
        forecastInputs: { old: { remainingBacklog: '99', velocityMean: '5', velocityStdDev: '1' } },
      })
      const inc = makeProject({ id: 'new', name: 'shared' })
      const conflicts = [{ type: 'name' as const, incomingProject: inc, existingProject: makeProject({ id: 'old', name: 'Shared' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['new', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      const fi = useProjectStore.getState().forecastInputs
      expect(fi.old).toBeUndefined()
      expect(fi.new?.remainingBacklog).toBe('99')
    })

    it('rename target is clean before rename (N-C-1 ordering regression guard)', () => {
      // A zombie at winner.id ('new') would corrupt the rename target.
      useProjectStore.setState({
        projects: [makeProject({ id: 'old', name: 'Shared' })],
        forecastInputs: {
          old: { remainingBacklog: 'correct', velocityMean: '5', velocityStdDev: '1' },
          new: { remainingBacklog: 'ZOMBIE', velocityMean: '0', velocityStdDev: '0' },
        },
      })
      const inc = makeProject({ id: 'new', name: 'shared' })
      const conflicts = [{ type: 'name' as const, incomingProject: inc, existingProject: makeProject({ id: 'old', name: 'Shared' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['new', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      const fi = useProjectStore.getState().forecastInputs
      // Wait — 'new' was a genuinely-new winner ID in mergedProjects (not in
      // pre-import existingIds set). N-C-1 clears it. Then rename moves 'old'
      // into 'new'. So fi.new === 'correct', not 'ZOMBIE'.
      expect(fi.new?.remainingBacklog).toBe('correct')
    })

    it('preserves forecastInputs for ID-conflict replace (same key)', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'shared' })],
        forecastInputs: { shared: { remainingBacklog: '42', velocityMean: '3', velocityStdDev: '1' } },
      })
      const inc = makeProject({ id: 'shared', name: 'New' })
      const conflicts = [{ type: 'id' as const, incomingProject: inc, existingProject: makeProject({ id: 'shared' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['shared', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      expect(useProjectStore.getState().forecastInputs.shared?.remainingBacklog).toBe('42')
    })

    it('leaves forecastInputs untouched when replacedIdMap is empty', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'untouched' })],
        forecastInputs: { untouched: { remainingBacklog: '7', velocityMean: '1', velocityStdDev: '0' } },
      })
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([makeProject({ id: 'new', name: 'New' })]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-forecaster-project-export',
      })
      expect(useProjectStore.getState().forecastInputs.untouched?.remainingBacklog).toBe('7')
    })

    it('copies start with blank forecastInputs (N-C-1, deliberate — C11)', () => {
      // A copy gets a fresh UUID. forecastInputs at that UUID could only exist
      // as a zombie; N-C-1 clears it. Verify by hand-seeding a fake "zombie"
      // at an unused id is not practical here (we don't know the UUID up front).
      // Just verify the post-import forecastInputs for the copy's UUID is missing.
      useProjectStore.setState({
        projects: [makeProject({ id: 'existing', name: 'Shared' })],
        forecastInputs: { existing: { remainingBacklog: '7', velocityMean: '1', velocityStdDev: '0' } },
      })
      const inc = makeProject({ id: 'incoming', name: 'shared' })
      const conflicts = [{ type: 'name' as const, incomingProject: inc, existingProject: makeProject({ id: 'existing', name: 'Shared' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['incoming', 'copy']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      const state = useProjectStore.getState()
      // The copy is the project whose id is neither 'existing' nor 'incoming'.
      const copy = state.projects.find((p) => p.id !== 'existing' && p.id !== 'incoming')!
      expect(copy).toBeDefined()
      expect(state.forecastInputs[copy.id]).toBeUndefined()
    })
  })

  describe('burnUpConfigs handling', () => {
    it('selectively clears only replaced project IDs — untouched retain configs', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
        burnUpConfigs: { a: DEFAULT_BURN_UP_CONFIG, b: DEFAULT_BURN_UP_CONFIG },
      })
      const inc = makeProject({ id: 'a', name: 'New A' })
      const conflicts = [{ type: 'id' as const, incomingProject: inc, existingProject: makeProject({ id: 'a' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['a', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      const cfg = useProjectStore.getState().burnUpConfigs
      expect(cfg.a).toBeUndefined()
      expect(cfg.b).toEqual(DEFAULT_BURN_UP_CONFIG)
    })

    it('leaves burnUpConfigs untouched when replacedExistingIds is empty', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'a' })],
        burnUpConfigs: { a: DEFAULT_BURN_UP_CONFIG },
      })
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([makeProject({ id: 'b', name: 'B' })]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-forecaster-project-export',
      })
      expect(useProjectStore.getState().burnUpConfigs.a).toEqual(DEFAULT_BURN_UP_CONFIG)
    })

    it('clears burnUpConfigs for name-conflict replaced existing ID (not winner.id)', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'old', name: 'X' })],
        burnUpConfigs: { old: DEFAULT_BURN_UP_CONFIG },
      })
      const inc = makeProject({ id: 'new', name: 'x' })
      const conflicts = [{ type: 'name' as const, incomingProject: inc, existingProject: makeProject({ id: 'old', name: 'X' }) }]
      useProjectStore.getState().applySmartImport({
        incoming: projectExportIn([inc]),
        decisions: new Map([['new', 'replace']]),
        freshConflicts: conflicts,
        source: 'spert-forecaster-project-export',
      })
      expect(useProjectStore.getState().burnUpConfigs.old).toBeUndefined()
    })
  })

  describe('Story Map source path (C14)', () => {
    it('source:spert-story-map emits correct _changeLog entry', () => {
      useProjectStore.getState().applySmartImport({
        incoming: storyMapIn([makeProject({ id: 'a' })]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-story-map',
      })
      expect(useProjectStore.getState()._changeLog.at(-1)?.source).toBe('spert-story-map')
    })

    it('viewingProjectId preserved when no replacedIdMap entries', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'keep' })],
        viewingProjectId: 'keep',
      })
      useProjectStore.getState().applySmartImport({
        incoming: storyMapIn([makeProject({ id: 'add', name: 'New' })]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-story-map',
      })
      expect(useProjectStore.getState().viewingProjectId).toBe('keep')
    })

    it('forecastInputs preserved for untouched projects on Story Map path', () => {
      useProjectStore.setState({
        projects: [makeProject({ id: 'keep' })],
        forecastInputs: { keep: { remainingBacklog: '11', velocityMean: '1', velocityStdDev: '0' } },
      })
      useProjectStore.getState().applySmartImport({
        incoming: storyMapIn([makeProject({ id: 'new', name: 'New' })]),
        decisions: new Map(),
        freshConflicts: [],
        source: 'spert-story-map',
      })
      expect(useProjectStore.getState().forecastInputs.keep?.remainingBacklog).toBe('11')
    })
  })
})

// ---------------------------------------------------------------------------
// deleteProject — regression lock for the import invariant
// ---------------------------------------------------------------------------

describe('deleteProject — import-invariant regression lock', () => {
  it('clears forecastInputs entry for the deleted project', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' })],
      forecastInputs: { a: { remainingBacklog: '1', velocityMean: '1', velocityStdDev: '0' } },
    })
    useProjectStore.getState().deleteProject('a')
    expect(useProjectStore.getState().forecastInputs.a).toBeUndefined()
  })

  it('clears burnUpConfigs entry for the deleted project', () => {
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' })],
      burnUpConfigs: { a: DEFAULT_BURN_UP_CONFIG },
    })
    useProjectStore.getState().deleteProject('a')
    expect(useProjectStore.getState().burnUpConfigs.a).toBeUndefined()
  })
})
