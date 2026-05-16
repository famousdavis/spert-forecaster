// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useIsClient } from '@/shared/hooks'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { today } from '@/shared/lib/dates'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { SharingSection } from '@/features/auth/components/SharingSection'
import { ProjectList } from './ProjectList'
import { ProjectForm } from './ProjectForm'
import { ImportPreviewSection } from './ImportPreviewSection'
import { useImportState } from '../hooks/useImportState'
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
  const idPrefix = useId()
  const projects = useProjectStore((state) => state.projects)
  const addProject = useProjectStore((state) => state.addProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const cloneProject = useProjectStore((state) => state.cloneProject)
  const reorderProjects = useProjectStore((state) => state.reorderProjects)
  const sprints = useProjectStore((state) => state.sprints)
  const exportData = useProjectStore((state) => state.exportData)
  const originRef = useProjectStore((state) => state._originRef)
  const changeLog = useProjectStore((state) => state._changeLog)

  const {
    importPreview,
    importBanner,
    replaceAllPending,
    applying,
    fileInputRef,
    handleFileChange,
    handleConfirmMerge,
    handleImportCancel,
    onModeChange,
    onDecisionChange,
    openReplaceAllConfirm,
    cancelReplaceAllConfirm,
    handleConfirmReplaceAll,
    dismissBanner,
  } = useImportState()

  const [editingProject, setEditingProject] = useState<Project | null>(null)
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

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean
    projectId: string | null
    projectName: string
  }>({
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

  const handleClone = useCallback(
    (project: Project) => {
      const newId = cloneProject(project.id)
      if (newId) {
        toast.success(`Cloned: ${project.name}`)
      } else {
        toast.error('Clone failed: project not found')
      }
    },
    [cloneProject],
  )

  const handleExportProject = useCallback(
    (projectId: string) => {
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
    },
    [projects, sprints, originRef, changeLog],
  )

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleDeleteRequest = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      setDeleteConfirm({
        isOpen: true,
        projectId,
        projectName: project?.name ?? 'Unknown',
      })
    },
    [projects],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirm.projectId) {
      deleteProject(deleteConfirm.projectId)
    }
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: '' })
  }, [deleteConfirm.projectId, deleteProject])

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: '' })
  }, [])

  if (!isClient) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Projects</h2>

      {importBanner && (
        <div
          role={importBanner.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-center justify-between rounded border px-4 py-3 text-sm',
            importBanner.kind === 'error'
              ? 'border-[#e53e3e] bg-[#fff3f3] text-spert-error-dark dark:bg-red-900/20 dark:text-red-100'
              : 'border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-900/30 dark:text-green-100',
          )}
        >
          <span>{importBanner.text}</span>
          <button
            onClick={dismissBanner}
            className="border-none bg-transparent cursor-pointer font-bold text-base"
            aria-label="Dismiss"
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

      {importPreview && (
        <ImportPreviewSection
          imported={importPreview.imported}
          conflicts={importPreview.conflicts}
          decisions={importPreview.decisions}
          mode={importPreview.mode}
          applying={applying}
          idPrefix={idPrefix}
          onModeChange={onModeChange}
          onDecisionChange={onDecisionChange}
          onConfirm={handleConfirmMerge}
          onRequestReplaceAll={openReplaceAllConfirm}
          onCancel={handleImportCancel}
        />
      )}

      <div className={cn('flex gap-2', projects.length === 0 ? 'justify-center' : 'justify-end')}>
        {projects.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            aria-label="Export all projects as JSON"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-transparent bg-transparent text-gray-500 text-[0.9rem] font-medium cursor-pointer transition-all duration-[120ms] hover:text-[#10b981] hover:bg-emerald-50 dark:hover:bg-emerald-500/15 hover:border-[#10b981] focus:outline-none focus:text-[#10b981] focus:bg-emerald-50 dark:focus:bg-emerald-500/15 focus:border-[#10b981]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export All
          </button>
        )}
        <button
          type="button"
          onClick={handleImportClick}
          disabled={applying}
          aria-label="Import projects from JSON"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-transparent bg-transparent text-gray-500 text-[0.9rem] font-medium cursor-pointer transition-all duration-[120ms] hover:text-[#0070f3] hover:bg-blue-50 dark:hover:bg-blue-500/15 hover:border-[#0070f3] focus:outline-none focus:text-[#0070f3] focus:bg-blue-50 dark:focus:bg-blue-500/15 focus:border-[#0070f3] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onExport={handleExportProject}
        onClone={handleClone}
        onReorder={reorderProjects}
        onViewHistory={onViewHistory ?? (() => {})}
        onShare={setSharingProject}
        isCloudMode={mode === 'cloud'}
        ownedProjectIds={ownedProjectIds}
        editingProjectId={editingProject?.id ?? null}
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

      <ConfirmDialog
        isOpen={replaceAllPending && importPreview !== null}
        title="Replace all data"
        message="This will replace all existing projects, sprint history, milestones, and productivity adjustments with the contents of this file. This cannot be undone. Export your current data first if you want to keep it."
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onConfirm={handleConfirmReplaceAll}
        onCancel={cancelReplaceAllConfirm}
        variant="danger"
      />
    </div>
  )
}
