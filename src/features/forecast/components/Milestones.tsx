// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useCallback } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import { CollapsibleCrudPanel, type CrudPanelForm } from '@/shared/components/CollapsibleCrudPanel'
import { useProjectAccess } from '@/features/auth/hooks/useProjectAccess'
import { accessReason } from '@/features/auth/lib/access-texts'
import { useProjectBoundForm } from '@/features/projects/hooks/useProjectBoundForm'
import type { Milestone } from '@/shared/types'
import { MilestoneForm } from './MilestoneForm'
import { MilestoneList } from './MilestoneList'
import { MAX_MILESTONES, MILESTONE_SOFT_LIMIT } from '../constants'

interface MilestonesProps {
  projectId: string
  unitOfMeasure: string
}

const ADD_MILESTONE_LABEL = '+ Add Milestone'

export function Milestones({ projectId, unitOfMeasure }: MilestonesProps) {
  const projects = useProjectStore((state) => state.projects)
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])
  const milestones = useMemo(() => project?.milestones ?? [], [project])
  const addMilestone = useProjectStore((state) => state.addMilestone)
  const updateMilestone = useProjectStore((state) => state.updateMilestone)
  const deleteMilestone = useProjectStore((state) => state.deleteMilestone)
  const reorderMilestones = useProjectStore((state) => state.reorderMilestones)
  // Brief 39 PR B: why the user may not change this project; null when they may.
  const reason = accessReason(useProjectAccess(projectId))
  // The add/edit form, tied to the project it was opened for (V10): it closes
  // when that project leaves the list or another is picked, and saves only there.
  const milestoneForm = useProjectBoundForm<Milestone>(projectId)
  const handleFormStateChange = (next: CrudPanelForm<Milestone>) => {
    if (next === null) milestoneForm.close()
    else if (project) milestoneForm.open(project, next.editingItem)
  }

  const handleDelete = useCallback(
    (id: string) => deleteMilestone(projectId, id),
    [deleteMilestone, projectId]
  )

  const handleToggleChart = useCallback(
    (milestoneId: string, showOnChart: boolean) => {
      updateMilestone(projectId, milestoneId, { showOnChart })
    },
    [updateMilestone, projectId]
  )

  const handleReorder = useCallback(
    (milestoneIds: string[]) => reorderMilestones(projectId, milestoneIds),
    [reorderMilestones, projectId]
  )

  // Returns whether the rename saved: a refused one keeps the inline editor open.
  const handleRename = useCallback(
    (milestoneId: string, name: string) => updateMilestone(projectId, milestoneId, { name }),
    [updateMilestone, projectId]
  )

  return (
    <CollapsibleCrudPanel<Milestone>
      title="Milestones"
      description="Define ordered release milestones to forecast individual delivery dates. Enter the remaining work for each milestone — update these values as work is completed. For milestones that came from Story Map, an Update from a Story Map v0.53.8 or later export replaces these values with Story Map's figures."
      items={milestones}
      onDelete={handleDelete}
      renderForm={({ editingItem, onSubmitDone, onCancel, readOnlyReason }) => (
        <MilestoneForm
          milestone={editingItem}
          existingCount={milestones.length}
          unitOfMeasure={unitOfMeasure}
          readOnlyReason={readOnlyReason}
          onSubmit={(data) => {
            // The form's own project, never the one on screen (V10). Gone: nothing
            // is written, and the close and its message follow on the next render.
            const target = milestoneForm.targetId()
            if (target === null) return
            const saved = editingItem ? updateMilestone(target, editingItem.id, data) : addMilestone(target, data)
            // Refused (the store said why): the form stays open with what was typed (V2).
            if (saved) onSubmitDone()
          }}
          onCancel={onCancel}
        />
      )}
      renderList={({ items, onEdit, onDelete, editingItem, readOnlyReason }) => (
        <MilestoneList
          milestones={items}
          unitOfMeasure={unitOfMeasure}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleChart={handleToggleChart}
          onReorder={handleReorder}
          onRename={handleRename}
          editingId={editingItem?.id ?? null}
          readOnlyReason={readOnlyReason}
        />
      )}
      addButtonLabel={ADD_MILESTONE_LABEL}
      deleteDialogTitle="Delete Milestone"
      maxItems={MAX_MILESTONES}
      capNotice={
        <p>
          You can add up to {MAX_MILESTONES} milestones by hand — more than that makes the charts
          hard to read. The <strong>{ADD_MILESTONE_LABEL}</strong> button comes back when this
          project has fewer than {MAX_MILESTONES}. Story Map updates can still bring in more, and
          the project keeps them.
        </p>
      }
      softLimit={MILESTONE_SOFT_LIMIT}
      softLimitMessage={`You have ${milestones.length} milestones. Consider keeping it under ${MILESTONE_SOFT_LIMIT} for best chart readability.`}
      panelId={`milestones-panel-${projectId}`}
      readOnlyReason={reason}
      formState={milestoneForm.form && { editingItem: milestoneForm.form.item }}
      onFormStateChange={handleFormStateChange}
    />
  )
}
