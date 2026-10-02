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

const ADD_MILESTONE_LABEL = '+ Add Milestone'

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

  const handleRename = useCallback(
    (milestoneId: string, name: string) => {
      updateMilestone(projectId, milestoneId, { name })
    },
    [updateMilestone, projectId]
  )

  return (
    <CollapsibleCrudPanel<Milestone>
      title="Milestones"
      description="Define ordered release milestones to forecast individual delivery dates. Enter the remaining work for each milestone — update these values as work is completed. For milestones that came from Story Map, an Update from a Story Map v0.53.8 or later export replaces these values with Story Map's figures."
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
      renderList={({ items, onEdit, onDelete, editingItem }) => (
        <MilestoneList
          milestones={items}
          unitOfMeasure={unitOfMeasure}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleChart={handleToggleChart}
          onReorder={handleReorder}
          onRename={handleRename}
          editingId={editingItem?.id ?? null}
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
    />
  )
}
