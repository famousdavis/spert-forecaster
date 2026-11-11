// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/shared/state/project-store'
import { useIsClient } from '@/shared/hooks'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { SharingSection } from '@/features/auth/components/SharingSection'
import { useProjectAccessOf } from '@/features/auth/hooks/useProjectAccess'
import { blocksReplaceAll } from '@/shared/state/project-access'
import { NOT_IN_CLOUD_LIST_NOTE } from '@/features/auth/lib/access-texts'
import { ProjectList } from './ProjectList'
import { ProjectForm } from './ProjectForm'
import { ProjectDialog } from './ProjectDialog'
import { ImportBanner } from './ImportBanner'
import { ImportPreviewSection } from './ImportPreviewSection'
import { ProjectsToolbar } from './ProjectsToolbar'
import { HEAD_ROW, HEADING, NOTE } from './dashboard-styles'
import { AllArchivedLine, ArchiveAnnouncer, ShowArchivedFilter } from './ArchiveControls'
import { ProjectsEmptyState } from '@/shared/components/ProjectsEmptyState'
import { loadSampleProject } from '../lib/sample-project'
// Type-only: the hook is CALLED in AppShell now, not here. Importing the value would put it
// back in this component's runtime graph and invite someone to call it again by accident.
import type { useImportState } from '../hooks/useImportState'
import { useProjectDialog } from '../hooks/useProjectDialog'
import { useProjectDelete } from '../hooks/useProjectDelete'
import { useProjectArchive } from '../hooks/useProjectArchive'
import { useProjectTileActions } from '../hooks/useProjectTileActions'
import { useImportFocusReturn } from '../hooks/useImportFocusReturn'
import { exportWorkspaceBackup } from '../lib/export-backup'
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

/**
 * The Projects dashboard (v0.49.0, GanttApp's): the heading row and toolbar, the notices, the
 * grid of tiles, and one New Project / Edit Project dialog.
 */
export function ProjectsTab({ onViewHistory, importState }: ProjectsTabProps) {
  const isClient = useIsClient()
  const idPrefix = useId()
  const projects = useProjectStore((state) => state.projects)
  const reorderProjects = useProjectStore((state) => state.reorderProjects)
  const sprints = useProjectStore((state) => state.sprints)
  // Brief 39: what the user may do to each project — for the import preview,
  // the tiles' badges and Delete, and the project dialog (read only for a
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

  // New Project, always rendered: where focus goes when a create dialog closes, or after the
  // last project is deleted.
  const newProjectRef = useRef<HTMLButtonElement>(null)
  // The tab's root, where a tile's controls are found by project id when focus must land on one.
  const rootRef = useRef<HTMLDivElement>(null)
  const dialog = useProjectDialog({ accessOf, rootRef, newProjectRef })
  // v0.50.0: archive, "Show archived (N)" and tile colour. `archive.shown` is what the grid shows
  // and what delete focus reads; every save still gets the full list.
  const archive = useProjectArchive({ projects, rootRef, newProjectRef, onViewHistory, dialogOpen: dialog.open || replaceAllPending })
  const deletion = useProjectDelete({ shown: archive.shown, rootRef, newProjectRef })
  const tileActions = useProjectTileActions()
  // v0.50.3: once the import preview goes (applied, replaced, cancelled), focus lost with it goes to Import.
  const importRef = useImportFocusReturn(importPreview !== null, newProjectRef)

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

  // The same helper serves "Export a backup" while the first cloud load is
  // outstanding (Brief 40), so the two can never drift apart.
  const handleExport = () => exportWorkspaceBackup()

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleLoadSample = useCallback(() => {
    loadSampleProject()
  }, [])

  if (!isClient) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  // Spacing (D23): the root's `space-y-6` puts 24 px below each child, and the heading row's
  // own `mb-4` overrides it to 16 px, so the grid sits 16 px below the heading row when it
  // follows it directly. Every section that can come between them, or after the grid,
  // carries `mt-6`: adjacent margins collapse, so each keeps 24 px above and below it.
  return (
    <div ref={rootRef} className="space-y-6">
      {/* The dashboard's first row: heading left, toolbar right. Wraps on a narrow
          screen with the buttons in the same order. Everything the dashboard shows
          comes after it. */}
      <div className={cn(HEAD_ROW, 'mb-4')}>
        <h2 className={HEADING}>Projects</h2>
        <ProjectsToolbar
          hasProjects={projects.length > 0}
          importDisabled={applying || isCloudPending}
          fileInputRef={fileInputRef}
          importRef={importRef}
          newProjectRef={newProjectRef}
          onExportAll={handleExport}
          onImportClick={handleImportClick}
          onFileChange={handleFileChange}
          onLoadSample={handleLoadSample}
          onNewProject={dialog.openNew}
        />
      </div>

      {archive.archivedCount > 0 && (
        <ShowArchivedFilter
          id={`${idPrefix}-show-archived`}
          count={archive.archivedCount}
          checked={archive.showArchived}
          onChange={archive.setShowArchived}
        />
      )}

      {isCloudPending && (
        <p
          role="status"
          aria-live="polite"
          className="mt-6 text-sm text-spert-text-muted dark:text-gray-400"
        >
          Loading your cloud projects — import will be available shortly.
        </p>
      )}

      {importBanner && <ImportBanner banner={importBanner} onDismiss={dismissBanner} />}

      {/* Welcome empty-state — only when the user has no projects yet. */}
      {projects.length === 0 && !importPreview && (
        <div className="mt-6">
          <ProjectsEmptyState variant="welcome" onCreateNew={dialog.openNew} onLoadSample={handleLoadSample} />
        </div>
      )}

      {importPreview && (
        <div className="mt-6">
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
        </div>
      )}

      {/* T4c (V6): adding, copying or importing a project — all on this tab — is
          what drops a not-in-cloud project from the list, so the warning is here. */}
      {projects.some((p) => accessOf(p.id) === 'not-in-cloud') && (
        <p role="note" className={cn('mt-6', NOTE)}>
          {NOT_IN_CLOUD_LIST_NOTE}
        </p>
      )}

      <ArchiveAnnouncer text={archive.status} />
      {projects.length > 0 && archive.shown.length === 0 && <AllArchivedLine count={archive.archivedCount} />}

      <ProjectList
        projects={archive.shown}
        allProjects={projects}
        prefs={archive.prefs}
        colorOpenFor={archive.colorOpenFor}
        onColorOpenChange={archive.setColorOpen}
        onPickColor={archive.pickColor}
        onArchive={archive.archive}
        onUnarchive={archive.unarchive}
        sprints={sprints}
        onEdit={dialog.openEdit}
        // The Delete dialog takes over the tab: an open colour popover closes first.
        onDelete={(projectId) => (archive.setColorOpen(projectId, false), deletion.request(projectId))}
        onExport={tileActions.exportProject}
        onClone={tileActions.clone}
        onReorder={reorderProjects}
        onViewHistory={archive.openProject}
        onShare={setSharingProject}
        accessOf={accessOf}
        canShare={canShare}
      />

      {/* Sharing panel */}
      {sharingProject && mode === 'cloud' && (
        <div className="mt-6 rounded-lg border border-spert-border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
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
        isOpen={deletion.pending !== null}
        title="Delete Project"
        message={`Delete project "${deletion.pending?.projectName ?? ''}"? This will also delete all its sprint history.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
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

      {/* Rendered ONCE, here, never inside a tile: a portal's events bubble through its React
          ancestors, so inside a tile its fields' drag events would reach the tile's drop
          handlers. Its DOM goes to document.body. Keyed by identity, so a different project's
          Edit starts a fresh form. */}
      {dialog.open && (
        <ProjectDialog
          key={dialog.identity}
          identity={dialog.identity}
          title={dialog.editingProject ? 'Edit Project' : 'New Project'}
          readOnly={dialog.readOnlyReason !== null}
          onCancel={dialog.close}
          returnFocusTo={dialog.returnFocusTo}
        >
          <ProjectForm
            project={dialog.editingProject}
            onSubmit={dialog.submit}
            onCancel={dialog.close}
            readOnlyReason={dialog.readOnlyReason}
          />
        </ProjectDialog>
      )}
    </div>
  )
}
