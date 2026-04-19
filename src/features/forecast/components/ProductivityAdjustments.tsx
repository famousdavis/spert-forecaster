// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useCallback } from 'react'
import { useProjectStore } from '@/shared/state/project-store'
import { CollapsibleCrudPanel } from '@/shared/components/CollapsibleCrudPanel'
import type { ProductivityAdjustment } from '@/shared/types'
import { ProductivityAdjustmentForm } from './ProductivityAdjustmentForm'
import { ProductivityAdjustmentList } from './ProductivityAdjustmentList'

interface ProductivityAdjustmentsProps {
  projectId: string
}

export function ProductivityAdjustments({ projectId }: ProductivityAdjustmentsProps) {
  const projects = useProjectStore((state) => state.projects)
  const adjustments = useMemo(() => {
    const project = projects.find((p) => p.id === projectId)
    return project?.productivityAdjustments ?? []
  }, [projects, projectId])
  const addProductivityAdjustment = useProjectStore((state) => state.addProductivityAdjustment)
  const updateProductivityAdjustment = useProjectStore((state) => state.updateProductivityAdjustment)
  const deleteProductivityAdjustment = useProjectStore((state) => state.deleteProductivityAdjustment)

  const handleDelete = useCallback(
    (id: string) => deleteProductivityAdjustment(projectId, id),
    [deleteProductivityAdjustment, projectId]
  )

  const handleToggleEnabled = useCallback(
    (adjustmentId: string) => {
      const adjustment = adjustments.find((a) => a.id === adjustmentId)
      if (adjustment) {
        updateProductivityAdjustment(projectId, adjustmentId, {
          enabled: adjustment.enabled === false ? true : false,
        })
      }
    },
    [adjustments, updateProductivityAdjustment, projectId]
  )

  return (
    <CollapsibleCrudPanel<ProductivityAdjustment>
      title="Productivity Adjustments (Holidays, Breaks, Events)"
      description="Define periods of reduced productivity (holidays, vacations, events) that will adjust the forecasted velocity. A factor of 50% means the team will complete half their normal velocity during that period. Because forecasts report sprint finish dates (not intra-sprint completion dates), a small adjustment may not shift the projected end date if work still completes within the same sprint."
      items={adjustments}
      onDelete={handleDelete}
      renderForm={({ editingItem, onSubmitDone, onCancel }) => (
        <ProductivityAdjustmentForm
          adjustment={editingItem}
          onSubmit={(data) => {
            if (editingItem) {
              updateProductivityAdjustment(projectId, editingItem.id, data)
            } else {
              addProductivityAdjustment(projectId, data)
            }
            onSubmitDone()
          }}
          onCancel={onCancel}
        />
      )}
      renderList={({ items, onEdit, onDelete }) => (
        <ProductivityAdjustmentList
          adjustments={items}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleEnabled={handleToggleEnabled}
        />
      )}
      addButtonLabel="+ Add Adjustment"
      deleteDialogTitle="Delete Adjustment"
      panelId={`productivity-adjustments-panel-${projectId}`}
    />
  )
}
