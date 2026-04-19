// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  useProjectStore,
  selectViewingProject,
} from '@/shared/state/project-store'
import { useIsClient } from '@/shared/hooks'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { SprintList } from './SprintList'
import { SprintForm } from './SprintForm'
import { RecentSprintsSummary } from './RecentSprintsSummary'
import { SprintConfig } from './SprintConfig'
import { VelocityStats } from './VelocityStats'
import { VelocityChart } from './VelocityChart'
import { ScopeAnalysis } from './ScopeAnalysis'
import type { Sprint } from '@/shared/types'
import type { SprintCadence } from '@/features/projects/constants'

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

  const sprints = useMemo(
    () => (selectedProject ? allSprints.filter((s) => s.projectId === selectedProject.id) : []),
    [allSprints, selectedProject]
  )

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null)
  const [sortAscending, setSortAscending] = useState(false) // Default: descending (most recent first)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; sprintId: string | null }>({
    isOpen: false,
    sprintId: null,
  })

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProjectId = e.target.value
    setViewingProjectId(newProjectId)
    // Close form if open when switching projects
    setIsFormOpen(false)
    setEditingSprint(null)
  }

  const handleCreate = () => {
    setEditingSprint(null)
    setIsFormOpen(true)
  }

  const handleEdit = (sprint: Sprint) => {
    setEditingSprint(sprint)
    setIsFormOpen(true)
  }

  const handleFormSubmit = (
    data: Omit<Sprint, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (editingSprint) {
      updateSprint(editingSprint.id, data)
    } else if (selectedProject) {
      addSprint({ ...data, projectId: selectedProject.id })
    }
    setIsFormOpen(false)
    setEditingSprint(null)
  }

  const handleFormCancel = () => {
    setIsFormOpen(false)
    setEditingSprint(null)
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

  // Check if sprint configuration is complete (both cadence and first sprint date are set)
  const isSprintConfigComplete =
    selectedProject?.sprintCadenceWeeks !== undefined &&
    selectedProject?.firstSprintStartDate !== undefined

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
        {!isFormOpen && (
          <button
            onClick={handleCreate}
            disabled={!isSprintConfigComplete}
            title={!isSprintConfigComplete ? 'Set sprint cadence and first sprint start date first' : undefined}
            className={cn(
              'px-4 py-2 border-none rounded text-[0.9rem] font-semibold text-white',
              isSprintConfigComplete
                ? 'bg-spert-blue dark:bg-blue-700 cursor-pointer opacity-100'
                : 'bg-[#ccc] cursor-not-allowed opacity-60'
            )}
          >
            Add Sprint
          </button>
        )}
      </div>

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
          />
        </>
      )}

      {selectedProject && (
        <>
          <SprintConfig
            project={selectedProject}
            canEdit={canEditFirstSprintDate}
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
              onToggleSortOrder={handleToggleSortOrder}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
              onToggleIncluded={toggleSprintIncluded}
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
