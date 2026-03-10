// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useCallback } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import { CollapsibleCrudPanel } from '@/shared/components/CollapsibleCrudPanel'
import type { Milestone } from '@/shared/types'
import { MilestoneForm } from './MilestoneForm'
import { MilestoneList } from './MilestoneList'
import { MAX_MILESTONES, MILESTONE_SOFT_LIMIT } from '../constants'

interface MilestonesProps {
  projectId: string
  unitOfMeasure: string
}

export function Milestones({ projectId, unitOfMeasure }: MilestonesProps) {
  const projects = useProjectStore((state) => state.projects)
  const milestones = useMemo(() => {
    const project = projects.find((p) => p.id === projectId)
    return project?.milestones ?? []
  }, [projects, projectId])
  const addMilestone = useProjectStore((state) => state.addMilestone)
  const updateMilestone = useProjectStore((state) => state.updateMilestone)
  const deleteMilestone = useProjectStore((state) => state.deleteMilestone)
  const reorderMilestones = useProjectStore((state) => state.reorderMilestones)

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

  return (
    <CollapsibleCrudPanel<Milestone>
      title="Milestones"
      description="Define ordered release milestones to forecast individual delivery dates. Enter the remaining work for each milestone — update these values as work is completed."
      items={milestones}
      onDelete={handleDelete}
      renderForm={({ editingItem, onSubmitDone, onCancel }) => (
        <MilestoneForm
          milestone={editingItem}
          existingCount={milestones.length}
          unitOfMeasure={unitOfMeasure}
          onSubmit={(data) => {
            if (editingItem) {
              updateMilestone(projectId, editingItem.id, data)
            } else {
              addMilestone(projectId, data)
            }
            onSubmitDone()
          }}
          onCancel={onCancel}
        />
      )}
      renderList={({ items, onEdit, onDelete }) => (
        <MilestoneList
          milestones={items}
          unitOfMeasure={unitOfMeasure}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleChart={handleToggleChart}
          onReorder={handleReorder}
        />
      )}
      addButtonLabel="+ Add Milestone"
      deleteDialogTitle="Delete Milestone"
      maxItems={MAX_MILESTONES}
      softLimit={MILESTONE_SOFT_LIMIT}
      softLimitMessage={`You have ${milestones.length} milestones. Consider keeping it under ${MILESTONE_SOFT_LIMIT} for best chart readability.`}
      panelId={`milestones-panel-${projectId}`}
    />
  )
}
