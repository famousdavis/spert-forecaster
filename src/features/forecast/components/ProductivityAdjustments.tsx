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
import type { ProductivityAdjustment } from '@/shared/types'
import { ProductivityAdjustmentForm } from './ProductivityAdjustmentForm'
import { ProductivityAdjustmentList } from './ProductivityAdjustmentList'

interface ProductivityAdjustmentsProps {
  projectId: string
}

export function ProductivityAdjustments({ projectId }: ProductivityAdjustmentsProps) {
  const projects = useProjectStore((state) => state.projects)
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])
  const adjustments = useMemo(() => project?.productivityAdjustments ?? [], [project])
  const addProductivityAdjustment = useProjectStore((state) => state.addProductivityAdjustment)
  const updateProductivityAdjustment = useProjectStore((state) => state.updateProductivityAdjustment)
  const deleteProductivityAdjustment = useProjectStore((state) => state.deleteProductivityAdjustment)
  // Brief 39 PR B: why the user may not change this project; null when they may.
  const reason = accessReason(useProjectAccess(projectId))
  // The add/edit form, tied to the project it was opened for (V10): it closes
  // when that project leaves the list or another is picked, and saves only there.
  const adjustmentForm = useProjectBoundForm<ProductivityAdjustment>(projectId)
  const handleFormStateChange = (next: CrudPanelForm<ProductivityAdjustment>) => {
    if (next === null) adjustmentForm.close()
    else if (project) adjustmentForm.open(project, next.editingItem)
  }

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
      renderForm={({ editingItem, onSubmitDone, onCancel, readOnlyReason }) => (
        <ProductivityAdjustmentForm
          adjustment={editingItem}
          readOnlyReason={readOnlyReason}
          onSubmit={(data) => {
            // The form's own project, never the one on screen (V10). Gone: nothing
            // is written, and the close and its message follow on the next render.
            const target = adjustmentForm.targetId()
            if (target === null) return
            const saved = editingItem
              ? updateProductivityAdjustment(target, editingItem.id, data)
              : addProductivityAdjustment(target, data)
            // Refused (the store said why): the form stays open with what was typed (V2).
            if (saved) onSubmitDone()
          }}
          onCancel={onCancel}
        />
      )}
      renderList={({ items, onEdit, onDelete, editingItem, readOnlyReason }) => (
        <ProductivityAdjustmentList
          adjustments={items}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleEnabled={handleToggleEnabled}
          editingId={editingItem?.id ?? null}
          readOnlyReason={readOnlyReason}
        />
      )}
      addButtonLabel="+ Add Adjustment"
      deleteDialogTitle="Delete Adjustment"
      panelId={`productivity-adjustments-panel-${projectId}`}
      readOnlyReason={reason}
      formState={adjustmentForm.form && { editingItem: adjustmentForm.form.item }}
      onFormStateChange={handleFormStateChange}
    />
  )
}
