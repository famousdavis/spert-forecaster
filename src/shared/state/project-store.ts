// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, Sprint, ProductivityAdjustment, Milestone, ForecastMode } from '@/shared/types'
import { storage, STORAGE_KEY, getWorkspaceId, getStorageMode, appendChangeLogEntry, type ChangeLogEntry } from './storage'
import { auth } from '@/shared/firebase/config'
import { APP_VERSION } from '@/shared/constants'
import { type BurnUpConfig, DEFAULT_BURN_UP_CONFIG } from '@/shared/types/burn-up'
import { validateImportData, type ExportData } from './import-validation'
import { useSettingsStore } from './settings-store'
import { syncBus } from '@/shared/firebase/sync-bus'
import {
  applyImportDecisions,
  conflictsEqual,
  detectImportConflicts,
  type ApplySmartImportArgs,
  type SmartImportOutcome,
} from './import-utils'
export { validateImportData, type ExportData } from './import-validation'

// Session-only forecast inputs (per project, not persisted to localStorage)
interface ForecastInputs {
  remainingBacklog: string
  velocityMean: string
  velocityStdDev: string
  forecastMode?: ForecastMode // undefined = auto-detect based on sprint count
  velocityEstimate?: string   // Subjective mode: user's velocity guess
  selectedCV?: number         // Subjective mode: selected coefficient of variation
  volatilityMultiplier?: number // History mode: SD multiplier (1.0 = match history)
}

interface ProjectState {
  projects: Project[]
  sprints: Sprint[]
  viewingProjectId: string | null // Shared across Sprint History and Forecast tabs
  forecastInputs: Record<string, ForecastInputs> // projectId -> inputs (session only)
  burnUpConfigs: Record<string, BurnUpConfig> // projectId -> config (session only)

  // Workspace reconciliation tokens (persisted)
  _originRef: string
  _changeLog: ChangeLogEntry[]

  // Cloud sync flag (transient, not persisted)
  _isCloudUpdate: boolean

  // Project actions
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => void
  deleteProject: (id: string) => void
  cloneProject: (sourceId: string) => string | null
  reorderProjects: (projectIds: string[]) => void
  setViewingProjectId: (id: string | null) => void

  // Sprint actions
  addSprint: (sprint: Omit<Sprint, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateSprint: (id: string, updates: Partial<Omit<Sprint, 'id' | 'projectId' | 'createdAt'>>) => void
  deleteSprint: (id: string) => void
  toggleSprintIncluded: (id: string) => void

  // Productivity Adjustment actions
  addProductivityAdjustment: (
    projectId: string,
    adjustment: Omit<ProductivityAdjustment, 'id' | 'createdAt' | 'updatedAt'>
  ) => void
  updateProductivityAdjustment: (
    projectId: string,
    adjustmentId: string,
    updates: Partial<Omit<ProductivityAdjustment, 'id' | 'createdAt'>>
  ) => void
  deleteProductivityAdjustment: (projectId: string, adjustmentId: string) => void

  // Milestone actions
  addMilestone: (
    projectId: string,
    milestone: Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>
  ) => void
  updateMilestone: (
    projectId: string,
    milestoneId: string,
    updates: Partial<Omit<Milestone, 'id' | 'createdAt'>>
  ) => void
  deleteMilestone: (projectId: string, milestoneId: string) => void
  reorderMilestones: (projectId: string, milestoneIds: string[]) => void

  // Import/Export actions
  exportData: () => ExportData
  importDataAndSelectFirst: (data: ExportData, firstProjectId?: string) => void
  applySmartImport: (args: ApplySmartImportArgs) => SmartImportOutcome

  // Cloud sync actions
  replaceProjectsFromCloud: (projects: Project[], sprints: Sprint[]) => void

  // Sign-out action — zeros user-scoped data, preserves workspace identity tokens
  clearProjectsOnSignOut: () => void

  // Forecast input actions (session only)
  setForecastInput: <K extends keyof ForecastInputs>(projectId: string, field: K, value: ForecastInputs[K]) => void
  getForecastInputs: (projectId: string) => ForecastInputs

  // Burn-up config actions (session only)
  setBurnUpConfig: (projectId: string, config: BurnUpConfig) => void
  getBurnUpConfig: (projectId: string) => BurnUpConfig
}

const generateId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

const DEFAULT_FORECAST_INPUTS: ForecastInputs = {
  remainingBacklog: '',
  velocityMean: '',
  velocityStdDev: '',
  forecastMode: undefined,
  velocityEstimate: undefined,
  selectedCV: undefined,
}

// Lazily ensure _originRef is set (first structural mutation or export)
const ensureOriginRef = (state: { _originRef: string }): string =>
  state._originRef || getWorkspaceId()

// Emit sync bus event for a project change (skipped during cloud updates)
function emitProjectSave(projectId: string, isCloudUpdate: boolean): void {
  if (!isCloudUpdate) {
    syncBus.emit({ type: 'project:save', projectId })
  }
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [] as Project[],
      sprints: [] as Sprint[],
      viewingProjectId: null as string | null,
      forecastInputs: {} as Record<string, ForecastInputs>,
      burnUpConfigs: {} as Record<string, BurnUpConfig>,
      _originRef: '' as string,
      _changeLog: [] as ChangeLogEntry[],
      _isCloudUpdate: false,

      addProject: (projectData) => {
        const id = generateId()
        set((state) => ({
          projects: [
            ...state.projects,
            { ...projectData, id, createdAt: now(), updatedAt: now() },
          ],
          _originRef: ensureOriginRef(state),
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'add', entity: 'project', id }),
        }))
        emitProjectSave(id, get()._isCloudUpdate)
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: now() } : p
          ),
        }))
        emitProjectSave(id, get()._isCloudUpdate)
      },

      cloneProject: (sourceId) => {
        const state = get()
        const source = state.projects.find((p) => p.id === sourceId)
        if (!source) return null

        // Find a non-colliding name following GanttApp's "X - Copy (N)" pattern.
        // Cap at 99 to match GanttApp; fall back to an 8-char UUID slice on extreme collision.
        const existingNames = new Set(state.projects.map((p) => p.name))
        let suffix = 1
        let newName = `${source.name} - Copy (${suffix})`
        while (existingNames.has(newName) && suffix < 99) {
          suffix++
          newName = `${source.name} - Copy (${suffix})`
        }
        if (existingNames.has(newName)) {
          newName = `${source.name} - Copy (${crypto.randomUUID().slice(0, 8)})`
        }

        const newProjectId = generateId()
        const nowTime = now()

        set((s) => {
          const src = s.projects.find((p) => p.id === sourceId)
          if (!src) return s

          const clonedMilestones = (src.milestones || []).map((m) => ({
            ...m,
            id: generateId(),
            createdAt: nowTime,
            updatedAt: nowTime,
          }))
          const clonedAdjustments = (src.productivityAdjustments || []).map((a) => ({
            ...a,
            id: generateId(),
            createdAt: nowTime,
            updatedAt: nowTime,
          }))
          const sourceSprints = s.sprints.filter((sp) => sp.projectId === sourceId)
          const clonedSprints = sourceSprints.map((sp) => ({
            ...sp,
            id: generateId(),
            projectId: newProjectId,
            createdAt: nowTime,
            updatedAt: nowTime,
          }))

          const newProject: Project = {
            ...src,
            id: newProjectId,
            name: newName,
            milestones: clonedMilestones,
            productivityAdjustments: clonedAdjustments,
            createdAt: nowTime,
            updatedAt: nowTime,
          }

          const srcIndex = s.projects.findIndex((p) => p.id === sourceId)
          const newProjects = [...s.projects]
          newProjects.splice(srcIndex + 1, 0, newProject)

          return {
            projects: newProjects,
            sprints: [...s.sprints, ...clonedSprints],
            _originRef: ensureOriginRef(s),
            _changeLog: appendChangeLogEntry(s._changeLog, { op: 'add', entity: 'project', id: newProjectId }),
          }
        })

        emitProjectSave(newProjectId, get()._isCloudUpdate)
        return newProjectId
      },

      deleteProject: (id) => {
        set((state) => {
          const { [id]: _forecastInputs, ...remainingForecastInputs } = state.forecastInputs
          const { [id]: _burnUpConfig, ...remainingBurnUpConfigs } = state.burnUpConfigs
          const remainingProjects = state.projects.filter((p) => p.id !== id)
          return {
            projects: remainingProjects,
            sprints: state.sprints.filter((s) => s.projectId !== id),
            forecastInputs: remainingForecastInputs,
            burnUpConfigs: remainingBurnUpConfigs,
            viewingProjectId:
              state.viewingProjectId === id
                ? (remainingProjects[0]?.id ?? null)
                : state.viewingProjectId,
            _changeLog: appendChangeLogEntry(state._changeLog, { op: 'delete', entity: 'project', id }),
          }
        })
        if (!get()._isCloudUpdate) {
          syncBus.emit({ type: 'project:delete', projectId: id })
        }
      },

      reorderProjects: (projectIds) => {
        set((state) => {
          const projectMap = new Map(state.projects.map((p) => [p.id, p]))
          return {
            projects: projectIds
              .map((id) => projectMap.get(id))
              .filter((p): p is Project => p !== undefined),
          }
        })
        // Emit save for each project so cloud sync can persist order
        const isCloud = get()._isCloudUpdate
        for (const id of projectIds) {
          emitProjectSave(id, isCloud)
        }
      },

      setViewingProjectId: (id) => set({ viewingProjectId: id }),

      addSprint: (sprintData) => {
        const id = generateId()
        set((state) => ({
          sprints: [
            ...state.sprints,
            { ...sprintData, id, createdAt: now(), updatedAt: now() },
          ],
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'add', entity: 'sprint', id }),
        }))
        emitProjectSave(sprintData.projectId, get()._isCloudUpdate)
      },

      updateSprint: (id, updates) => {
        const sprint = get().sprints.find((s) => s.id === id)
        const hasDateChange = 'customFinishDate' in updates && updates.customFinishDate !== sprint?.customFinishDate
        set((state) => ({
          sprints: state.sprints.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: now() } : s
          ),
          ...(hasDateChange ? {
            _changeLog: appendChangeLogEntry(state._changeLog, { op: 'edit', entity: 'sprintDate', id }),
          } : {}),
        }))
        if (sprint) emitProjectSave(sprint.projectId, get()._isCloudUpdate)
      },

      deleteSprint: (id) => {
        const sprint = get().sprints.find((s) => s.id === id)
        set((state) => ({
          sprints: state.sprints.filter((s) => s.id !== id),
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'delete', entity: 'sprint', id }),
        }))
        if (sprint) emitProjectSave(sprint.projectId, get()._isCloudUpdate)
      },

      toggleSprintIncluded: (id) => {
        const sprint = get().sprints.find((s) => s.id === id)
        set((state) => ({
          sprints: state.sprints.map((s) =>
            s.id === id
              ? { ...s, includedInForecast: !s.includedInForecast, updatedAt: now() }
              : s
          ),
        }))
        if (sprint) emitProjectSave(sprint.projectId, get()._isCloudUpdate)
      },

      addProductivityAdjustment: (projectId, adjustmentData) => {
        const id = generateId()
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  productivityAdjustments: [
                    ...(p.productivityAdjustments || []),
                    { ...adjustmentData, id, createdAt: now(), updatedAt: now() },
                  ],
                  updatedAt: now(),
                }
              : p
          ),
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'add', entity: 'adjustment', id }),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      updateProductivityAdjustment: (projectId, adjustmentId, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  productivityAdjustments: (p.productivityAdjustments || []).map((adj) =>
                    adj.id === adjustmentId
                      ? { ...adj, ...updates, updatedAt: now() }
                      : adj
                  ),
                  updatedAt: now(),
                }
              : p
          ),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      deleteProductivityAdjustment: (projectId, adjustmentId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  productivityAdjustments: (p.productivityAdjustments || []).filter(
                    (adj) => adj.id !== adjustmentId
                  ),
                  updatedAt: now(),
                }
              : p
          ),
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'delete', entity: 'adjustment', id: adjustmentId }),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      addMilestone: (projectId, milestoneData) => {
        const id = generateId()
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  milestones: [
                    ...(p.milestones || []),
                    { ...milestoneData, id, createdAt: now(), updatedAt: now() },
                  ],
                  updatedAt: now(),
                }
              : p
          ),
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'add', entity: 'milestone', id }),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      updateMilestone: (projectId, milestoneId, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  milestones: (p.milestones || []).map((m) =>
                    m.id === milestoneId
                      ? { ...m, ...updates, updatedAt: now() }
                      : m
                  ),
                  updatedAt: now(),
                }
              : p
          ),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      deleteMilestone: (projectId, milestoneId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  milestones: (p.milestones || []).filter(
                    (m) => m.id !== milestoneId
                  ),
                  updatedAt: now(),
                }
              : p
          ),
          _changeLog: appendChangeLogEntry(state._changeLog, { op: 'delete', entity: 'milestone', id: milestoneId }),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      reorderMilestones: (projectId, milestoneIds) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p
            const milestoneMap = new Map((p.milestones || []).map((m) => [m.id, m]))
            return {
              ...p,
              milestones: milestoneIds
                .map((id) => milestoneMap.get(id))
                .filter((m): m is Milestone => m !== undefined),
              updatedAt: now(),
            }
          }),
        }))
        emitProjectSave(projectId, get()._isCloudUpdate)
      },

      exportData: (): ExportData => {
        const state = get()
        const settings = useSettingsStore.getState()
        return {
          version: APP_VERSION,
          exportedAt: now(),
          projects: state.projects,
          sprints: state.sprints,
          _originRef: ensureOriginRef(state),
          _storageRef: (getStorageMode() === 'cloud' && auth?.currentUser?.uid) || getWorkspaceId(),
          _changeLog: state._changeLog,
          ...(settings.exportName ? { _exportedBy: settings.exportName } : {}),
          ...(settings.exportId ? { _exportedById: settings.exportId } : {}),
        }
      },

      importDataAndSelectFirst: (data, firstProjectId) => {
        validateImportData(data)
        const originRef = data._originRef || getWorkspaceId()
        const importedLog = Array.isArray(data._changeLog) ? data._changeLog : []
        const newLog = appendChangeLogEntry(importedLog, {
          op: 'import',
          entity: 'dataset',
          source: 'file',
        })
        set(() => ({
          projects: data.projects,
          sprints: data.sprints,
          _originRef: originRef,
          _changeLog: newLog,
          viewingProjectId: firstProjectId ?? null,
          forecastInputs: {},
          burnUpConfigs: {},
        }))
        syncBus.emit({ type: 'project:import' })
      },

      applySmartImport: ({ incoming, decisions, freshConflicts, source }) => {
        // C22: Exhaustive switch. Adding a new exportType to ParsedImportData's
        // union becomes a compile error. TypeScript enforces exhaustiveness;
        // no runtime test needed.
        const changeLogSource = ((): string => {
          switch (source) {
            case 'spert-story-map':
              return 'spert-story-map'
            case 'spert-forecaster-project-export':
              return 'spert-forecaster-project-export'
            case 'legacy':
              return 'spert-legacy-export'
            default: {
              const _exhaustive: never = source
              return _exhaustive
            }
          }
        })()

        // outcome starts as failure; set to success only inside set() if no drift.
        let outcome: SmartImportOutcome = { ok: false, reason: 'workspace-changed' }
        set((state) => {
          // C28/H1: Re-detect conflicts against state.projects AT WRITE TIME.
          // Closes the concurrent-delete drift window between the hook's
          // stale-data guard and this write.
          const currentConflicts = detectImportConflicts(incoming, state.projects)
          if (!conflictsEqual(currentConflicts, freshConflicts)) {
            // Workspace changed between hook's guard and this write. No-op.
            return state
          }
          const { mergedProjects, mergedSprints, result } = applyImportDecisions(
            state.projects,
            state.sprints,
            incoming,
            decisions,
            currentConflicts,
          )
          outcome = { ok: true, result }

          const existingIds = new Set(state.projects.map((p) => p.id))
          const forecastInputs = { ...state.forecastInputs }
          const burnUpConfigs = { ...state.burnUpConfigs }

          // N-C-1: Defensive clear for all genuinely-new project IDs. Covers
          // 'added', 'copy', and name-conflict winner IDs. Runs BEFORE the
          // forecastInputs rename so the rename target is always clean.
          //
          // Per-project entity treatment:
          //   Sprint history:           substituted from incoming (replace); fresh IDs (copy)
          //   Milestones:               substituted from incoming (replace); fresh IDs (copy)
          //   Productivity adjustments: substituted from incoming (replace); fresh IDs (copy)
          //   Forecast inputs:          RENAMED for name-conflicts; preserved for ID-conflicts
          //                             (same key); BLANK for copies (deliberate — C11).
          //   Burn-up configurations:   CLEARED for ALL replaced IDs; untouched preserved.
          for (const p of mergedProjects) {
            if (!existingIds.has(p.id)) {
              delete forecastInputs[p.id]
              delete burnUpConfigs[p.id]
            }
          }
          // forecastInputs rename for name-conflict displaced projects.
          for (const [existingId, incomingId] of result.replacedIdMap) {
            if (existingId in forecastInputs) {
              forecastInputs[incomingId] = forecastInputs[existingId]
              delete forecastInputs[existingId]
            }
          }
          // burnUpConfigs selective clear for replaced project slots.
          for (const existingId of result.replacedExistingIds) {
            delete burnUpConfigs[existingId]
          }
          // C7: viewingProjectId reconciliation — atomic in same set().
          let newViewingProjectId = state.viewingProjectId
          if (state.viewingProjectId && result.replacedIdMap.size > 0) {
            const remapped = result.replacedIdMap.get(state.viewingProjectId)
            if (remapped !== undefined) newViewingProjectId = remapped
          }
          return {
            projects: mergedProjects,
            sprints: mergedSprints,
            _originRef: ensureOriginRef(state),
            _changeLog: appendChangeLogEntry(state._changeLog, {
              op: 'merge-import',
              entity: 'dataset',
              source: changeLogSource,
            }),
            forecastInputs,
            burnUpConfigs,
            viewingProjectId: newViewingProjectId,
          }
        })
        // C28: syncBus only fires on success. A no-op set() should not trigger
        // cloud sync of unchanged data.
        if (outcome.ok) {
          syncBus.emit({ type: 'project:import' })
        }
        return outcome
      },

      replaceProjectsFromCloud: (projects, sprints) => {
        set({
          projects,
          sprints,
          _isCloudUpdate: true,
        })
        // Defer reset so all synchronous Zustand subscribers see the flag
        queueMicrotask(() => set({ _isCloudUpdate: false }))
      },

      clearProjectsOnSignOut: () => {
        // Zero user-scoped data so the next browser user cannot see the
        // previous user's cloud projects. Preserves _originRef (browser-
        // scoped workspace identity, used for cross-import reconciliation;
        // not user-identifying on its own). Clears _changeLog (v0.28.3 L2):
        // although ChangeLogEntry has no actor field, the timeline of
        // operations fingerprints the prior user's activity on shared
        // devices and would otherwise leak into the next user's exports.
        // Does NOT emit to syncBus: the sign-out path revokes credentials
        // before this fires, and a cloud-side 'project:delete' storm is
        // not the intent.
        set({
          projects: [],
          sprints: [],
          viewingProjectId: null,
          forecastInputs: {},
          burnUpConfigs: {},
          _changeLog: [],
        })
      },

      setForecastInput: (projectId, field, value) =>
        set((state) => ({
          forecastInputs: {
            ...state.forecastInputs,
            [projectId]: {
              ...(state.forecastInputs[projectId] || DEFAULT_FORECAST_INPUTS),
              [field]: value,
            },
          },
        })),

      getForecastInputs: (projectId) => {
        const state = get()
        return state.forecastInputs[projectId] || DEFAULT_FORECAST_INPUTS
      },

      setBurnUpConfig: (projectId, config) =>
        set((state) => ({
          burnUpConfigs: {
            ...state.burnUpConfigs,
            [projectId]: config,
          },
        })),

      getBurnUpConfig: (projectId) => {
        const state = get()
        return state.burnUpConfigs[projectId] || DEFAULT_BURN_UP_CONFIG
      },
    }),
    {
      name: STORAGE_KEY,
      storage: {
        getItem: (name) => {
          const value = storage.getItem(name)
          return value ? JSON.parse(value) : null
        },
        setItem: (name, value) => {
          storage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          storage.removeItem(name)
        },
      },
      // Persist projects, sprints, and workspace reconciliation tokens
      partialize: (state) => ({
        projects: state.projects,
        sprints: state.sprints,
        _originRef: state._originRef,
        _changeLog: state._changeLog,
      } as ProjectState),
    }
  )
)

// Selectors
export const selectActiveProject = (state: ProjectState): Project | undefined =>
  state.projects[0]

export const selectViewingProject = (state: ProjectState): Project | undefined => {
  if (state.viewingProjectId) {
    return state.projects.find((p) => p.id === state.viewingProjectId) || state.projects[0]
  }
  return state.projects[0]
}

export const selectProjectSprints = (projectId: string) => (state: ProjectState): Sprint[] =>
  state.sprints.filter((s) => s.projectId === projectId)

export const selectIncludedSprints = (projectId: string) => (state: ProjectState): Sprint[] =>
  state.sprints.filter((s) => s.projectId === projectId && s.includedInForecast)

export const selectProjectAdjustments =
  (projectId: string) =>
  (state: ProjectState): ProductivityAdjustment[] => {
    const project = state.projects.find((p) => p.id === projectId)
    return project?.productivityAdjustments || []
  }

export const selectProjectMilestones =
  (projectId: string) =>
  (state: ProjectState): Milestone[] => {
    const project = state.projects.find((p) => p.id === projectId)
    return project?.milestones || []
  }
