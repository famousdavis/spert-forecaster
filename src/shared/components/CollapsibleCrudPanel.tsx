// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './ConfirmDialog'

interface CrudItem {
  id: string
  name?: string
}

interface CollapsibleCrudPanelProps<T extends CrudItem> {
  title: string
  description?: string
  items: T[]
  onDelete: (id: string) => void
  renderForm: (props: {
    editingItem: T | null
    onSubmitDone: () => void
    onCancel: () => void
  }) => ReactNode
  renderList: (props: {
    items: T[]
    onEdit: (item: T) => void
    onDelete: (id: string) => void
  }) => ReactNode
  addButtonLabel?: string
  deleteDialogTitle?: string
  maxItems?: number
  softLimit?: number
  softLimitMessage?: string
  panelId: string
  /** Extra content rendered between description and add button */
  headerExtra?: ReactNode
}

export function CollapsibleCrudPanel<T extends CrudItem>({
  title,
  description,
  items,
  onDelete,
  renderForm,
  renderList,
  addButtonLabel = '+ Add',
  deleteDialogTitle = 'Delete',
  maxItems,
  softLimit,
  softLimitMessage,
  panelId,
  headerExtra,
}: CollapsibleCrudPanelProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingItem, setEditingItem] = useState<T | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean
    itemId: string | null
    itemName: string
  }>({ isOpen: false, itemId: null, itemName: '' })

  const showForm = isAdding || editingItem !== null
  const canAdd = maxItems === undefined || items.length < maxItems
  const showSoftWarning =
    softLimit !== undefined && items.length >= softLimit && canAdd

  const handleEdit = (item: T) => {
    setEditingItem(item)
    setIsAdding(false)
  }

  const handleSubmitDone = () => {
    setIsAdding(false)
    setEditingItem(null)
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingItem(null)
  }

  const handleDeleteRequest = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id)
      setDeleteConfirm({
        isOpen: true,
        itemId: id,
        itemName: (item?.name as string) ?? 'Unknown',
      })
    },
    [items]
  )

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirm.itemId) {
      onDelete(deleteConfirm.itemId)
    }
    setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' })
  }, [deleteConfirm.itemId, onDelete])

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' })
  }, [])

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label={`${title}${items.length > 0 ? ` (${items.length})` : ''}`}
      >
        <span
          className={cn(
            'inline-block text-[10px] text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
          aria-hidden="true"
        >
          ▶
        </span>
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {items.length > 0 && (
          <span className="rounded-[10px] bg-spert-bg-disabled px-2 py-0.5 text-xs text-spert-text-muted">
            {items.length}
          </span>
        )}
      </button>

      {isExpanded && (
        <div id={panelId} role="region" aria-label={title} className="px-4 pb-4">
          {description && (
            <p className="text-xs text-muted-foreground mb-4">{description}</p>
          )}

          {headerExtra}

          {/* List — always visible so users retain context while adding/editing */}
          {renderList({
            items,
            onEdit: handleEdit,
            onDelete: handleDeleteRequest,
          })}

          {/* Add button — below list */}
          {!showForm && canAdd && (
            <button
              onClick={() => setIsAdding(true)}
              className="mt-4 cursor-pointer rounded border-none dark:border dark:border-blue-600 bg-spert-blue dark:bg-blue-900/30 px-4 py-2 text-sm font-medium text-white dark:text-blue-400"
            >
              {addButtonLabel}
            </button>
          )}

          {showSoftWarning && !showForm && softLimitMessage && (
            <p className="mt-2 text-xs text-spert-warning-dark dark:text-yellow-400">
              {softLimitMessage}
            </p>
          )}

          {maxItems !== undefined && !canAdd && !showForm && (
            <p className="mt-2 text-xs text-spert-text-muted">
              Maximum of {maxItems} items reached.
            </p>
          )}

          {/* Form — below list and add button */}
          {showForm && (
            <div className="mt-4">
              {renderForm({
                editingItem,
                onSubmitDone: handleSubmitDone,
                onCancel: handleCancel,
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={deleteDialogTitle}
        message={`Delete "${deleteConfirm.itemName}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        variant="danger"
      />
    </div>
  )
}
