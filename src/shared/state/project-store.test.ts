// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useProjectStore,
  selectActiveProject,
  selectViewingProject,
  selectProjectSprints,
  selectIncludedSprints,
  selectProjectAdjustments,
  validateImportData,
} from './project-store'
import { DEFAULT_BURN_UP_CONFIG } from '@/shared/types/burn-up'
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

describe('importData', () => {
  it('replaces projects and sprints', () => {
    useProjectStore.setState({ projects: [makeProject({ id: 'old' })], sprints: [] })

    const { importData } = useProjectStore.getState()
    importData({
      version: '0.10.0',
      exportedAt: '2026-01-01T00:00:00Z',
      projects: [makeProject({ id: 'new', name: 'Imported' })],
      sprints: [makeSprint({ id: 'new-sprint', projectId: 'new' })],
    })

    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0].id).toBe('new')
    expect(state.sprints).toHaveLength(1)
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

// --- Import with fingerprinting ---

describe('importData with fingerprinting', () => {
  it('preserves _originRef from imported data', () => {
    const { importData } = useProjectStore.getState()
    importData({
      version: '0.20.0',
      exportedAt: '2026-01-01T00:00:00Z',
      projects: [makeProject()],
      sprints: [],
      _originRef: 'original-browser-uuid',
      _changeLog: [{ t: 1000, op: 'add', entity: 'project' }],
    })
    expect(useProjectStore.getState()._originRef).toBe('original-browser-uuid')
  })

  it('backfills _originRef if missing from imported data', () => {
    const { importData } = useProjectStore.getState()
    importData({
      version: '0.19.1',
      exportedAt: '2026-01-01T00:00:00Z',
      projects: [makeProject()],
      sprints: [],
    })
    const state = useProjectStore.getState()
    expect(state._originRef).toBeTruthy()
    expect(typeof state._originRef).toBe('string')
  })

  it('preserves and extends _changeLog with import event', () => {
    const { importData } = useProjectStore.getState()
    importData({
      version: '0.20.0',
      exportedAt: '2026-01-01T00:00:00Z',
      projects: [makeProject()],
      sprints: [],
      _originRef: 'orig',
      _changeLog: [{ t: 1000, op: 'add', entity: 'project' }],
    })
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(2)
    expect(_changeLog[0].op).toBe('add')
    expect(_changeLog[1].op).toBe('import')
    expect(_changeLog[1].entity).toBe('dataset')
    expect(_changeLog[1].source).toBe('file')
  })

  it('creates _changeLog with import event if none existed', () => {
    const { importData } = useProjectStore.getState()
    importData({
      version: '0.19.1',
      exportedAt: '2026-01-01T00:00:00Z',
      projects: [makeProject()],
      sprints: [],
    })
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(1)
    expect(_changeLog[0].op).toBe('import')
  })

  it('does not carry _storageRef or attribution into store state', () => {
    const { importData } = useProjectStore.getState()
    importData({
      version: '0.20.0',
      exportedAt: '2026-01-01T00:00:00Z',
      projects: [makeProject()],
      sprints: [],
      _originRef: 'orig',
      _storageRef: 'storage-ref',
      _exportedBy: 'Alice',
      _exportedById: '12345',
    })
    const state = useProjectStore.getState()
    // These should not exist on the store state
    expect((state as Record<string, unknown>)._storageRef).toBeUndefined()
    expect((state as Record<string, unknown>)._exportedBy).toBeUndefined()
    expect((state as Record<string, unknown>)._exportedById).toBeUndefined()
  })
})

// --- Merge import with fingerprinting ---

describe('mergeImportData with fingerprinting', () => {
  it('preserves existing _originRef', () => {
    useProjectStore.setState({ _originRef: 'existing-origin' })
    const { mergeImportData } = useProjectStore.getState()
    mergeImportData([makeProject()], [makeSprint()])
    expect(useProjectStore.getState()._originRef).toBe('existing-origin')
  })

  it('appends merge-import event to _changeLog', () => {
    useProjectStore.setState({
      _changeLog: [{ t: 1000, op: 'add', entity: 'project' }],
    })
    const { mergeImportData } = useProjectStore.getState()
    mergeImportData([makeProject()], [makeSprint()])
    const { _changeLog } = useProjectStore.getState()
    expect(_changeLog).toHaveLength(2)
    expect(_changeLog[1].op).toBe('merge-import')
    expect(_changeLog[1].entity).toBe('dataset')
    expect(_changeLog[1].source).toBe('spert-story-map')
  })
})
