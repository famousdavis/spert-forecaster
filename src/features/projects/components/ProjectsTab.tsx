// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useProjectStore, selectActiveProject, type ExportData } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useIsClient } from '@/shared/hooks'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { MergeImportDialog } from '@/shared/components/MergeImportDialog'
import {
  isStoryMapExport,
  isProjectSubsetExport,
  buildMergePlan,
  applyMergePlan,
  buildSubsetMergePlan,
  applySubsetMerge,
  type StoryMapExportData,
  type ProjectSubsetExportData,
  type MergePlan,
  type SubsetMergePlan,
} from '@/shared/state/merge-import'
import { validateImportData } from '@/shared/state/import-validation'
import { today } from '@/shared/lib/dates'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { SharingSection } from '@/features/auth/components/SharingSection'
import { ProjectList } from './ProjectList'
import { ProjectForm } from './ProjectForm'
import { exportSingleProject } from '../lib/export-project'
import { getWorkspaceId, getStorageMode } from '@/shared/state/storage'
import { auth } from '@/shared/firebase/config'
import { loadOwnedProjectIds } from '@/shared/firebase/firestore-driver'
import { useAuth } from '@/shared/providers/AuthProvider'
import type { Project } from '@/shared/types'

interface ProjectsTabProps {
  onViewHistory?: (projectId: string) => void
}

export function ProjectsTab({ onViewHistory }: ProjectsTabProps) {
  const isClient = useIsClient()
  const projects = useProjectStore((state) => state.projects)
  const activeProject = useProjectStore(selectActiveProject)
  const addProject = useProjectStore((state) => state.addProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const reorderProjects = useProjectStore((state) => state.reorderProjects)
  const sprints = useProjectStore((state) => state.sprints)
  const exportData = useProjectStore((state) => state.exportData)
  const importData = useProjectStore((state) => state.importData)
  const mergeImportData = useProjectStore((state) => state.mergeImportData)
  const mergeProjectSubset = useProjectStore((state) => state.mergeProjectSubset)
  const originRef = useProjectStore((state) => state._originRef)
  const changeLog = useProjectStore((state) => state._changeLog)

  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mergeState, setMergeState] = useState<{
    isOpen: boolean
    plan: MergePlan | null
    data: StoryMapExportData | null
  }>({ isOpen: false, plan: null, data: null })
  const [subsetMergeState, setSubsetMergeState] = useState<{
    isOpen: boolean
    plan: SubsetMergePlan | null
    data: ProjectSubsetExportData | null
  }>({ isOpen: false, plan: null, data: null })
  const [replaceConfirm, setReplaceConfirm] = useState<{
    isOpen: boolean
    data: ExportData | null
  }>({ isOpen: false, data: null })
  const { mode } = useStorageMode()
  const { user } = useAuth()
  const [sharingProject, setSharingProject] = useState<Project | null>(null)
  const [ownedProjectIds, setOwnedProjectIds] = useState<Set<string>>(new Set())

  // Load the set of project IDs owned by the current user. Used to gate the
  // Share button so editors and viewers don't see an affordance they can't act
  // on. Refresh whenever the project list changes (a newly-created project
  // needs to appear in the owned set immediately) or auth state changes.
  // In non-cloud mode we leave any prior set in place — the Share button is
  // already gated upstream on `mode === 'cloud'`, so a stale set is harmless
  // and skipping the clear avoids a synchronous setState-in-effect.
  useEffect(() => {
    if (mode !== 'cloud' || !user) return
    let cancelled = false
    loadOwnedProjectIds(user.uid)
      .then((ids) => {
        if (!cancelled) setOwnedProjectIds(ids)
      })
      .catch(() => {
        if (!cancelled) setOwnedProjectIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [mode, user, projects.length])
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; projectId: string | null; projectName: string }>({
    isOpen: false,
    projectId: null,
    projectName: '',
  })

  const handleEdit = (project: Project) => {
    setEditingProject(project)
  }

  const handleFormSubmit = (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingProject) {
      updateProject(editingProject.id, data)
      setEditingProject(null)
    } else {
      addProject(data)
    }
  }

  const handleFormCancel = () => {
    setEditingProject(null)
  }

  const handleExport = () => {
    const data = exportData()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spert-forecaster-${today()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Project data exported')
  }

  const handleExportProject = useCallback((projectId: string) => {
    try {
      const settings = useSettingsStore.getState()
      const storageRef =
        (getStorageMode() === 'cloud' && auth?.currentUser?.uid) || getWorkspaceId()
      exportSingleProject(projectId, {
        projects,
        sprints,
        originRef: originRef || getWorkspaceId(),
        storageRef,
        changeLog,
        exportedBy: settings.exportName || undefined,
        exportedById: settings.exportId || undefined,
      })
      toast.success('Project exported')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Export failed: ${message}`)
    }
  }, [projects, sprints, originRef, changeLog])

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)

    // Validate file type
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setImportError('Import failed: Please select a JSON file (.json)')
      e.target.value = ''
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setImportError(`Import failed: File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string

      // Parse JSON with better error handling
      let data: ExportData
      try {
        data = JSON.parse(content) as ExportData
      } catch {
        setImportError('Import failed: Invalid JSON format. Please check the file is a valid SPERT export.')
        return
      }

      // Validate structure (shared validation for both formats)
      try {
        validateImportData(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown validation error'
        setImportError(`Import failed: ${message}`)
        return
      }

      // Detect Forecaster per-project subset export and use additive merge flow
      if (isProjectSubsetExport(data)) {
        const plan = buildSubsetMergePlan(projects, sprints, data)
        setSubsetMergeState({ isOpen: true, plan, data })
        return
      }

      // Detect Story Map export and use merge flow
      if (isStoryMapExport(data)) {
        const plan = buildMergePlan(projects, sprints, data)
        setMergeState({ isOpen: true, plan, data })
        return
      }

      // Native Forecaster export: show confirmation before full replace
      setReplaceConfirm({ isOpen: true, data })
    }
    reader.onerror = () => {
      setImportError('Import failed: Could not read file')
    }
    reader.readAsText(file)
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleDeleteRequest = useCallback((projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    setDeleteConfirm({
      isOpen: true,
      projectId,
      projectName: project?.name ?? 'Unknown',
    })
  }, [projects])

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirm.projectId) {
      deleteProject(deleteConfirm.projectId)
    }
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: '' })
  }, [deleteConfirm.projectId, deleteProject])

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: '' })
  }, [])

  const handleMergeConfirm = useCallback(() => {
    if (!mergeState.plan || !mergeState.data) return
    try {
      const result = applyMergePlan(projects, sprints, mergeState.data, mergeState.plan)
      mergeImportData(result.projects, result.sprints)

      const parts: string[] = []
      if (mergeState.plan.totalUpdatedProjects > 0) {
        parts.push(`${mergeState.plan.totalUpdatedProjects} project${mergeState.plan.totalUpdatedProjects !== 1 ? 's' : ''} updated`)
      }
      if (mergeState.plan.totalNewProjects > 0) {
        parts.push(`${mergeState.plan.totalNewProjects} project${mergeState.plan.totalNewProjects !== 1 ? 's' : ''} added`)
      }
      toast.success(`Story Map imported: ${parts.join(', ')}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setImportError(`Merge failed: ${message}`)
    }
    setMergeState({ isOpen: false, plan: null, data: null })
  }, [mergeState, projects, sprints, mergeImportData])

  const handleMergeCancel = useCallback(() => {
    setMergeState({ isOpen: false, plan: null, data: null })
  }, [])

  const handleSubsetMergeConfirm = useCallback(() => {
    if (!subsetMergeState.plan || !subsetMergeState.data) return
    try {
      const result = applySubsetMerge(projects, sprints, subsetMergeState.data)
      mergeProjectSubset(result.projects, result.sprints)

      const parts: string[] = []
      if (subsetMergeState.plan.addedProjects > 0) {
        parts.push(`${subsetMergeState.plan.addedProjects} added`)
      }
      if (subsetMergeState.plan.updatedProjects > 0) {
        parts.push(`${subsetMergeState.plan.updatedProjects} updated`)
      }
      if (subsetMergeState.plan.addedSprints > 0) {
        parts.push(`${subsetMergeState.plan.addedSprints} new sprint(s)`)
      }
      toast.success(`Imported: ${parts.length > 0 ? parts.join(', ') : 'no changes'}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setImportError(`Merge failed: ${message}`)
    }
    setSubsetMergeState({ isOpen: false, plan: null, data: null })
  }, [subsetMergeState, projects, sprints, mergeProjectSubset])

  const handleSubsetMergeCancel = useCallback(() => {
    setSubsetMergeState({ isOpen: false, plan: null, data: null })
  }, [])

  const handleReplaceConfirm = useCallback(() => {
    if (!replaceConfirm.data) return
    try {
      importData(replaceConfirm.data)
      toast.success('Project data imported')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown validation error'
      setImportError(`Import failed: ${message}`)
    }
    setReplaceConfirm({ isOpen: false, data: null })
  }, [replaceConfirm.data, importData])

  const handleReplaceCancel = useCallback(() => {
    setReplaceConfirm({ isOpen: false, data: null })
  }, [])

  if (!isClient) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Projects</h2>

      {importError && (
        <div
          className="flex items-center justify-between rounded border border-[#e53e3e] bg-[#fff3f3] px-4 py-3 text-[0.9rem] text-spert-error-dark"
        >
          <span>{importError}</span>
          <button
            onClick={() => setImportError(null)}
            className="border-none bg-transparent cursor-pointer text-spert-error-dark font-bold text-base"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <ProjectForm
        key={editingProject?.id ?? 'new'}
        project={editingProject}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
      />

      <div className="flex justify-end gap-2">
        {projects.length > 0 && (
          <button
            onClick={handleExport}
            className="rounded border border-spert-blue dark:border-blue-500 bg-white dark:bg-gray-800 px-4 py-2 text-[0.9rem] font-semibold text-spert-blue dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
          >
            Export All
          </button>
        )}
        <button
          onClick={handleImportClick}
          className="rounded border border-spert-blue dark:border-blue-500 bg-white dark:bg-gray-800 px-4 py-2 text-[0.9rem] font-semibold text-spert-blue dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          name="projectImportFile"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <ProjectList
        projects={projects}
        activeProjectId={activeProject?.id}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onExport={handleExportProject}
        onReorder={reorderProjects}
        onViewHistory={onViewHistory ?? (() => {})}
        onShare={setSharingProject}
        isCloudMode={mode === 'cloud'}
        ownedProjectIds={ownedProjectIds}
      />

      {/* Sharing panel */}
      {sharingProject && mode === 'cloud' && (
        <div className="rounded-lg border border-spert-border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-start justify-between">
            <SharingSection projectId={sharingProject.id} projectName={sharingProject.name} />
            <button
              onClick={() => setSharingProject(null)}
              className="text-spert-text-muted hover:text-spert-text dark:hover:text-gray-200 cursor-pointer text-lg px-2 flex-shrink-0"
              aria-label="Close sharing"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Project"
        message={`Delete project "${deleteConfirm.projectName}"? This will also delete all its sprint history.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        variant="danger"
      />

      <MergeImportDialog
        isOpen={mergeState.isOpen}
        plan={mergeState.plan}
        onConfirm={handleMergeConfirm}
        onCancel={handleMergeCancel}
      />

      <ConfirmDialog
        isOpen={replaceConfirm.isOpen}
        title="Replace All Data"
        message="This will replace all existing projects, sprint history, milestones, and productivity adjustments with the contents of this file. This cannot be undone. Export your current data first if you want to keep it."
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onConfirm={handleReplaceConfirm}
        onCancel={handleReplaceCancel}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={subsetMergeState.isOpen}
        title="Merge Project(s)"
        message={
          subsetMergeState.plan
            ? `This will add ${subsetMergeState.plan.addedProjects} new project(s) and update ${subsetMergeState.plan.updatedProjects} existing project(s). ${subsetMergeState.plan.addedSprints} sprint(s) will be added; ${subsetMergeState.plan.skippedSprints} duplicate sprint(s) will be skipped. Existing projects not in this file are kept unchanged.`
            : ''
        }
        confirmLabel="Merge"
        cancelLabel="Cancel"
        onConfirm={handleSubsetMergeConfirm}
        onCancel={handleSubsetMergeCancel}
      />
    </div>
  )
}
