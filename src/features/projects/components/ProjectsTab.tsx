// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useIsClient } from '@/shared/hooks'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { SharingSection } from '@/features/auth/components/SharingSection'
import { useProjectAccessOf } from '@/features/auth/hooks/useProjectAccess'
import { blocksReplaceAll } from '@/shared/state/project-access'
import { accessReason, NOT_IN_CLOUD_LIST_NOTE } from '@/features/auth/lib/access-texts'
import { ProjectList } from './ProjectList'
import { ProjectForm, type ProjectFormHandle } from './ProjectForm'
import { ImportPreviewSection } from './ImportPreviewSection'
import { ProjectsToolbar } from './ProjectsToolbar'
import { ProjectsEmptyState } from '@/shared/components/ProjectsEmptyState'
import { loadSampleProject } from '../lib/sample-project'
// Type-only: the hook is CALLED in AppShell now, not here. Importing the value would put it
// back in this component's runtime graph and invite someone to call it again by accident.
import type { useImportState } from '../hooks/useImportState'
import { exportSingleProject } from '../lib/export-project'
import { exportWorkspaceBackup } from '../lib/export-backup'
import { reportExportCheck } from '@/shared/state/export-check-store'
import { getWorkspaceId, getStorageMode } from '@/shared/state/storage'
import { auth } from '@/shared/firebase/config'
import { useAuth } from '@/shared/providers/AuthProvider'
import type { Project } from '@/shared/types'

interface ProjectsTabProps {
  onViewHistory?: (projectId: string) => void
  /**
   * ⚠️ Owned by `AppShell`, not by this component, because this component UNMOUNTS on every
   * tab switch and a transfer arriving mid-switch would land on nothing.
   *
   * Passed as ONE bundle rather than 15 props: the hook returns 19 members and this component
   * uses 15 of them, and spreading them into the prop list would put a hook's return shape
   * into a component's public API and churn the signature on every change to it. Required,
   * not optional — a missing prop then fails `tsc`, which the ship gate runs BEFORE the
   * tests, rather than failing at runtime in front of a user.
   */
  importState: ReturnType<typeof useImportState>
}

export function ProjectsTab({ onViewHistory, importState }: ProjectsTabProps) {
  const isClient = useIsClient()
  const idPrefix = useId()
  const projects = useProjectStore((state) => state.projects)
  const addProject = useProjectStore((state) => state.addProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const cloneProject = useProjectStore((state) => state.cloneProject)
  const reorderProjects = useProjectStore((state) => state.reorderProjects)
  const sprints = useProjectStore((state) => state.sprints)
  const originRef = useProjectStore((state) => state._originRef)
  const changeLog = useProjectStore((state) => state._changeLog)
  // Brief 39: what the user may do to each project — for the import preview,
  // the list's badges and Delete, and the project form (read only for a
  // project the user can only view).
  const accessOf = useProjectAccessOf()
  const projectRoles = useProjectStore((state) => state.projectRoles)
  const replaceAllBlocked = projects.some((p) => blocksReplaceAll(accessOf(p.id)))

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
    cloudDataLoaded,
  } = importState

  const [editingProject, setEditingProject] = useState<Project | null>(null)
  // v0.48.0: the form is hidden until asked for — New Project, the empty state's "Create
  // New Project", another tab's call to action, or a project's pencil — whatever the
  // project count. Persists through the focus-flag reset so the form doesn't unmount
  // mid-render.
  const [wantsToCreateNew, setWantsToCreateNew] = useState(false)
  const projectFormRef = useRef<ProjectFormHandle>(null)
  // Where focus goes back to when a create form closes (Add Project or Cancel): the button
  // that opens it. Always rendered, so it is there to receive focus.
  const newProjectRef = useRef<HTMLButtonElement>(null)
  const shouldFocusNewProjectForm = useProjectStore((s) => s.shouldFocusNewProjectForm)
  const setShouldFocusNewProjectForm = useProjectStore((s) => s.setShouldFocusNewProjectForm)
  const { mode } = useStorageMode()
  // Pitfall #88: gate the Import button on cloud-data hydration so users can't
  // pick a file before Firestore's initial load has populated state.projects.
  const isCloudPending = mode === 'cloud' && !cloudDataLoaded
  const { user } = useAuth()
  const [sharingProject, setSharingProject] = useState<Project | null>(null)

  // Share is offered only to the project's owner, signed in, once the first
  // cloud load has succeeded — and only on an EXPLICIT 'owner' role (Brief 39 PR B,
  // OD-6). Not the resolved access: a project with no role entry is one this
  // browser is still creating, whose cloud document may not exist yet. The
  // roles come from every cloud snapshot, so Share appears as soon as the
  // post-create snapshot names this user the owner (no query of its own).
  const canShare = useCallback(
    (projectId: string) => !!user && cloudDataLoaded && projectRoles[projectId] === 'owner',
    [user, cloudDataLoaded, projectRoles],
  )

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
      // Refused — the user's access dropped as they clicked, and the store said
      // so: the form stays open with what they typed (V2).
      if (updateProject(editingProject.id, data)) setEditingProject(null)
    } else {
      addProject(data)
      newProjectRef.current?.focus()
    }
    // Intent fulfilled — clear the "wants to create new" flag, which hides the form
    // (v0.48.0: a populated list no longer keeps it open).
    setWantsToCreateNew(false)
  }

  const handleFormCancel = () => {
    const wasCreating = editingProject === null
    setEditingProject(null)
    // Hides the form, whatever the project count (v0.48.0). With no projects the
    // welcome empty state is what remains.
    setWantsToCreateNew(false)
    if (wasCreating) newProjectRef.current?.focus()
  }

  // The same helper serves "Export a backup" while the first cloud load is
  // outstanding (Brief 40), so the two can never drift apart.
  const handleExport = () => exportWorkspaceBackup()

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
        const { json } = exportSingleProject(projectId, {
          projects,
          sprints,
          originRef: originRef || getWorkspaceId(),
          storageRef,
          changeLog,
          exportedBy: settings.exportName || undefined,
          exportedById: settings.exportId || undefined,
        })
        toast.success('Project exported')
        reportExportCheck(json)
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

  // Tab-switch focus handoff: when a sibling tab's empty-state CTA fires, it sets the
  // shouldFocusNewProjectForm flag and switches to this tab. v0.33.3: the in-tab
  // "Create New Project" CTA also sets the same flag, and v0.48.0's New Project button
  // does too, so every entry point shares a single focus pipeline. On render with the
  // flag set, we (1) flip wantsToCreateNew
  // so the form stays mounted after we reset the flag, (2) focus the name input via
  // the imperative handle, and (3) reset the flag so subsequent renders don't refocus.
  // Strict Mode double-fires this in dev; the flag-reset makes the second fire a no-op.
  //
  // The form-visibility gate (showProjectForm below) includes shouldFocusNewProjectForm
  // so the form IS mounted at the moment this effect runs — projectFormRef.current is
  // non-null and focusNameInput can complete on the same render cycle.
  useEffect(() => {
    if (shouldFocusNewProjectForm) {
      // setWantsToCreateNew flips a sibling state synchronously inside an effect.
      // react-hooks/set-state-in-effect flags this as a cascading-renders smell, but
      // here the setState is a one-shot intent transition driven by an external trigger
      // (a Zustand-store flag set from outside this component), not a derivation that
      // would loop. Matches the same eslint-disable pattern adopted in v0.31.5 for
      // useForecastState's project-change reset effect.
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setWantsToCreateNew(true)
      projectFormRef.current?.focusNameInput()
      setShouldFocusNewProjectForm(false)
    }
  }, [shouldFocusNewProjectForm, setShouldFocusNewProjectForm])

  // New Project (toolbar) and the empty state's "Create New Project" share this handler,
  // and delegate to the global focus flag, matching the cross-tab path. The effect above
  // handles both visibility (via setWantsToCreateNew) and focus.
  //
  // ⚠️ It ends any edit first. Without that, pressing New Project while a project's form
  // is open would focus THAT project's name field. Ending the edit discards unsaved edit
  // text, exactly as Cancel or another project's pencil already does; `key` then remounts
  // the form blank. No confirm, no gate (v0.48.0, D2).
  const handleNewProject = useCallback(() => {
    setEditingProject(null)
    setShouldFocusNewProjectForm(true)
  }, [setShouldFocusNewProjectForm])
  const handleLoadSample = useCallback(() => {
    loadSampleProject()
  }, [])

  // Form-visibility gate (v0.48.0; was v0.33.3). Show the form only when asked for:
  //   - the user is editing an existing project (editingProject set);
  //   - the user pressed New Project or "Create New Project" in this tab (wantsToCreateNew);
  //   - or a CTA is requesting focus right now (shouldFocusNewProjectForm).
  // ⚠️ A populated list no longer keeps it open. Until v0.48.0 `projects.length > 0` was a
  // fourth branch, making the form the always-on "add another" surface; William ruled on
  // 2026-11-08 that it stays hidden until asked for, and hides again after Add Project or
  // Cancel.
  const showProjectForm =
    editingProject !== null ||
    wantsToCreateNew ||
    shouldFocusNewProjectForm

  if (!isClient) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* The dashboard's first row: heading left, toolbar right. Wraps on a narrow
          screen with the buttons in the same order. Everything the dashboard shows
          comes after it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Projects</h2>
        <ProjectsToolbar
          hasProjects={projects.length > 0}
          importDisabled={applying || isCloudPending}
          fileInputRef={fileInputRef}
          newProjectRef={newProjectRef}
          onExportAll={handleExport}
          onImportClick={handleImportClick}
          onFileChange={handleFileChange}
          onLoadSample={handleLoadSample}
          onNewProject={handleNewProject}
        />
      </div>

      {isCloudPending && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-spert-text-muted dark:text-gray-400"
        >
          Loading your cloud projects — import will be available shortly.
        </p>
      )}

      {importBanner && (
        <div
          role={importBanner.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex justify-between rounded border px-4 py-3 text-sm',
            importBanner.details?.length ? 'items-start' : 'items-center',
            importBanner.kind === 'error'
              ? 'border-[#e53e3e] bg-[#fff3f3] text-spert-error-dark dark:bg-red-900/20 dark:text-red-100'
              : 'border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-900/30 dark:text-green-100',
          )}
        >
          <div className="min-w-0">
            <span>{importBanner.text}</span>
            {importBanner.details && importBanner.details.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {importBanner.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={dismissBanner}
            className="border-none bg-transparent cursor-pointer font-bold text-base"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {showProjectForm && (
        <ProjectForm
          key={editingProject?.id ?? 'new'}
          ref={projectFormRef}
          project={editingProject}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          readOnlyReason={editingProject ? accessReason(accessOf(editingProject.id)) : null}
        />
      )}

      {/* Welcome empty-state — only when the user has no projects yet. */}
      {projects.length === 0 && !importPreview && (
        <ProjectsEmptyState
          variant="welcome"
          onCreateNew={handleNewProject}
          onLoadSample={handleLoadSample}
        />
      )}

      {importPreview && (
        <ImportPreviewSection
          imported={importPreview.imported}
          conflicts={importPreview.conflicts}
          decisions={importPreview.decisions}
          mode={importPreview.mode}
          applying={applying}
          existingSprints={sprints}
          idPrefix={idPrefix}
          accessOf={accessOf}
          replaceAllBlocked={replaceAllBlocked}
          onModeChange={onModeChange}
          onDecisionChange={onDecisionChange}
          onConfirm={handleConfirmMerge}
          onRequestReplaceAll={openReplaceAllConfirm}
          onCancel={handleImportCancel}
        />
      )}

      {/* T4c (V6): adding, copying or importing a project — all on this tab — is
          what drops a not-in-cloud project from the list, so the warning is here. */}
      {projects.some((p) => accessOf(p.id) === 'not-in-cloud') && (
        <p role="note" className="text-sm text-spert-text-secondary dark:text-gray-300">
          {NOT_IN_CLOUD_LIST_NOTE}
        </p>
      )}

      <ProjectList
        projects={projects}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onExport={handleExportProject}
        onClone={handleClone}
        onReorder={reorderProjects}
        onViewHistory={onViewHistory ?? (() => {})}
        onShare={setSharingProject}
        accessOf={accessOf}
        canShare={canShare}
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
