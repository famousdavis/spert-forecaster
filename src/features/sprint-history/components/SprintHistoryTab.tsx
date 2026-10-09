// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  useProjectStore,
  selectViewingProject,
} from '@/shared/state/project-store'
import { useIsClient } from '@/shared/hooks'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { useProjectAccess } from '@/features/auth/hooks/useProjectAccess'
import { accessReason, VIEW_ONLY_LOCK_NOTE } from '@/features/auth/lib/access-texts'
import { ViewOnlyNotice } from '@/features/auth/components/ViewOnlyNotice'
import { useProjectBoundForm } from '@/features/projects/hooks/useProjectBoundForm'
import { SprintList } from './SprintList'
import { SprintForm } from './SprintForm'
import { RecentSprintsSummary } from './RecentSprintsSummary'
import { SprintConfig } from './SprintConfig'
import { VelocityStats } from './VelocityStats'
import { VelocityChart } from './VelocityChart'
import { ScopeAnalysis } from './ScopeAnalysis'
import { SprintDateNotice } from './SprintDateNotice'
import { deriveSprintData } from '@/shared/lib/forecast-derivations'
import { isValidIsoDate } from '@/shared/lib/dates'
import { ADD_TITLE_FIRST_DATE } from '@/shared/lib/sprint-date-texts'
import type { Project, Sprint } from '@/shared/types'
import type { SprintCadence } from '@/features/projects/constants'

/** Add Sprint's tooltip while it is disabled: a present-but-refused first date has its own (D14). */
function addSprintTitle(project: Project | undefined, configComplete: boolean): string | undefined {
  if (configComplete) return undefined
  const first = project?.firstSprintStartDate
  return first !== undefined && !isValidIsoDate(first)
    ? ADD_TITLE_FIRST_DATE
    : 'Set sprint cadence and first sprint start date first'
}

export function SprintHistoryTab() {
  const isClient = useIsClient()
  const projects = useProjectStore((state) => state.projects)
  const selectedProject = useProjectStore(selectViewingProject)
  const allSprints = useProjectStore((state) => state.sprints)
  const addSprint = useProjectStore((state) => state.addSprint)
  const updateSprint = useProjectStore((state) => state.updateSprint)
  const deleteSprint = useProjectStore((state) => state.deleteSprint)
  const toggleSprintIncluded = useProjectStore((state) => state.toggleSprintIncluded)
  const updateProject = useProjectStore((state) => state.updateProject)
  const setViewingProjectId = useProjectStore((state) => state.setViewingProjectId)

  // Brief 39 PR B: a project the user may not change — every control that would
  // change it stays in place, disabled, and says why (`reason`).
  const access = useProjectAccess(selectedProject?.id)
  const reason = accessReason(access)
  const reasonId = useId()

  // The sprint form, tied to the project it was opened for (V10): it closes when
  // that project leaves the list, and every save targets that project.
  const sprintForm = useProjectBoundForm<Sprint>(selectedProject?.id)
  const isFormOpen = sprintForm.form !== null
  const editingSprint = sprintForm.form?.item ?? null

  const sprints = useMemo(
    () => (selectedProject ? allSprints.filter((s) => s.projectId === selectedProject.id) : []),
    [allSprints, selectedProject]
  )

  // Every bad stored date, the schedule's state and any spill past 9999, for the notice
  const dateData = useMemo(() => deriveSprintData(selectedProject, allSprints), [selectedProject, allSprints])

  const [sortAscending, setSortAscending] = useState(false) // Default: descending (most recent first)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; sprintId: string | null }>({
    isOpen: false,
    sprintId: null,
  })

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProjectId = e.target.value
    setViewingProjectId(newProjectId)
    // Close form if open when switching projects (no message: the user chose it)
    sprintForm.close()
  }

  const handleCreate = () => {
    if (selectedProject) sprintForm.open(selectedProject, null)
  }

  const handleEdit = (sprint: Sprint) => {
    if (selectedProject) sprintForm.open(selectedProject, sprint)
  }

  const handleFormSubmit = (
    data: Omit<Sprint, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
  ) => {
    // The form's own project, never the one on screen (V10). Gone: nothing is
    // written, and the close and its message follow on the next render.
    const projectId = sprintForm.targetId()
    if (projectId === null) return
    const saved = editingSprint ? updateSprint(editingSprint.id, data) : addSprint({ ...data, projectId })
    // Refused — the role dropped as the user clicked, and the store said so:
    // the form stays open with what they typed (V2).
    if (saved) sprintForm.close()
  }

  const handleFormCancel = () => {
    sprintForm.close()
  }

  const handleCadenceChange = (value: SprintCadence) => {
    if (selectedProject) {
      updateProject(selectedProject.id, { sprintCadenceWeeks: value })
    }
  }

  const handleFirstSprintDateChange = (value: string) => {
    if (selectedProject) {
      updateProject(selectedProject.id, { firstSprintStartDate: value || undefined })
    }
  }

  const handleToggleSortOrder = () => {
    setSortAscending(!sortAscending)
  }

  const handleDeleteRequest = useCallback((sprintId: string) => {
    setDeleteConfirm({ isOpen: true, sprintId })
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirm.sprintId) {
      deleteSprint(deleteConfirm.sprintId)
    }
    setDeleteConfirm({ isOpen: false, sprintId: null })
  }, [deleteConfirm.sprintId, deleteSprint])

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ isOpen: false, sprintId: null })
  }, [])

  // Check if firstSprintStartDate can be edited (only when no sprints exist)
  const canEditFirstSprintDate = sprints.length === 0

  // Check if sprint configuration is complete (both cadence and first sprint date are set).
  // A first date the rule refuses counts as missing (D14): nothing can be worked out from it.
  const isSprintConfigComplete =
    selectedProject?.sprintCadenceWeeks !== undefined &&
    isValidIsoDate(selectedProject?.firstSprintStartDate)
  const canAddSprint = isSprintConfigComplete && !reason

  if (!isClient) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-muted-foreground">
          No projects yet. Create a project first to add sprint history.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-spert-text flex items-baseline">
          <span className="font-semibold">Sprint History for </span>
          <select
            name="sprintHistoryProject"
            aria-label="Project"
            value={selectedProject?.id || ''}
            onChange={handleProjectChange}
            className="text-xl text-spert-text border-none bg-transparent cursor-pointer font-inherit font-semibold p-0 outline-none ml-0"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </h2>
        {reason && <span id={reasonId} className="sr-only">{reason}</span>}
        {!isFormOpen && (
          <button
            onClick={handleCreate}
            disabled={!canAddSprint}
            title={reason ?? addSprintTitle(selectedProject, isSprintConfigComplete)}
            aria-describedby={reason ? reasonId : undefined}
            className={cn(
              'px-4 py-2 border-none rounded text-[0.9rem] font-semibold text-white',
              canAddSprint
                ? 'bg-spert-blue dark:bg-blue-700 cursor-pointer opacity-100'
                : 'bg-[#ccc] cursor-not-allowed opacity-60'
            )}
          >
            Add Sprint
          </button>
        )}
      </div>

      <ViewOnlyNotice access={access} />

      {selectedProject && <SprintDateNotice project={selectedProject} data={dateData} />}

      {/* Recent sprints reference + Sprint Form — appear immediately after the Add Sprint button.
          Reference-then-form ordering is intentional: prior values above, in-progress form below. */}
      {selectedProject && isFormOpen && (
        <>
          <RecentSprintsSummary
            sprints={sprints}
            unitOfMeasure={selectedProject.unitOfMeasure}
            firstSprintStartDate={selectedProject.firstSprintStartDate}
            sprintCadenceWeeks={selectedProject.sprintCadenceWeeks}
          />
          <SprintForm
            sprint={editingSprint}
            project={selectedProject}
            existingSprintCount={sprints.length}
            allSprints={sprints}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            readOnlyReason={reason}
          />
        </>
      )}

      {selectedProject && (
        <>
          {/* Locked by the user's access first, else by the sprints recorded (the default note). */}
          <SprintConfig
            project={selectedProject}
            canEdit={canEditFirstSprintDate && !reason}
            lockNote={reason ? VIEW_ONLY_LOCK_NOTE : undefined}
            lockReason={reason ?? undefined}
            lockReasonId={reason ? reasonId : undefined}
            onCadenceChange={handleCadenceChange}
            onFirstSprintDateChange={handleFirstSprintDateChange}
          />

          <VelocityStats sprints={sprints} unitOfMeasure={selectedProject.unitOfMeasure} />

          <VelocityChart sprints={sprints} unitOfMeasure={selectedProject.unitOfMeasure} />

          <ScopeAnalysis sprints={sprints} unitOfMeasure={selectedProject.unitOfMeasure} />

          {!isFormOpen && (
            <SprintList
              sprints={sprints}
              unitOfMeasure={selectedProject.unitOfMeasure}
              sortAscending={sortAscending}
              firstSprintStartDate={selectedProject.firstSprintStartDate}
              sprintCadenceWeeks={selectedProject.sprintCadenceWeeks}
              editingSprintId={editingSprint?.id ?? null}
              onToggleSortOrder={handleToggleSortOrder}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
              onToggleIncluded={toggleSprintIncluded}
              readOnlyReason={reason}
            />
          )}
        </>
      )}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Sprint"
        message="Delete this sprint? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        variant="danger"
      />
    </div>
  )
}
