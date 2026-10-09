// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useState, useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './ConfirmDialog'

interface CrudItem {
  id: string
  name?: string
}

/** The form the panel shows: null for none; `editingItem` null for an add form. */
export type CrudPanelForm<T> = { editingItem: T | null } | null

interface CollapsibleCrudPanelProps<T extends CrudItem> {
  title: string
  description?: string
  items: T[]
  onDelete: (id: string) => void
  /**
   * `onSubmitDone` closes the form: call it only once the save succeeded. A
   * refused save leaves the form open with what the user typed (Brief 39, V2).
   */
  renderForm: (props: {
    editingItem: T | null
    onSubmitDone: () => void
    onCancel: () => void
    readOnlyReason: string | null
  }) => ReactNode
  renderList: (props: {
    items: T[]
    onEdit: (item: T) => void
    onDelete: (id: string) => void
    editingItem: T | null
    readOnlyReason: string | null
  }) => ReactNode
  addButtonLabel?: string
  deleteDialogTitle?: string
  maxItems?: number
  softLimit?: number
  softLimitMessage?: string
  /**
   * Shown in place of "Maximum of N items reached." once the list is at or above
   * `maxItems` — for a panel whose items can exceed the cap by other routes.
   */
  capNotice?: ReactNode
  panelId: string
  /** Extra content rendered between description and add button */
  headerExtra?: ReactNode
  /**
   * Why the user may not change these items; null or absent when they may.
   * While set, the add button stays in place, disabled, and says why, and the
   * list and form are given the reason to do the same (Brief 39 PR B).
   */
  readOnlyReason?: string | null
  /**
   * The open form, when the caller owns it (Brief 39, V10: Forecast ties each
   * form to the project it was opened for). With `onFormStateChange` given, the
   * panel shows `formState` and asks for every change; without it, the panel
   * keeps its own.
   */
  formState?: CrudPanelForm<T>
  onFormStateChange?: (next: CrudPanelForm<T>) => void
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
  capNotice,
  panelId,
  headerExtra,
  readOnlyReason = null,
  formState,
  onFormStateChange,
}: CollapsibleCrudPanelProps<T>) {
  const addReasonId = useId()
  const [isExpanded, setIsExpanded] = useState(false)
  const [ownForm, setOwnForm] = useState<CrudPanelForm<T>>(null)
  const form = onFormStateChange ? (formState ?? null) : ownForm
  const setForm: (next: CrudPanelForm<T>) => void = onFormStateChange ?? setOwnForm
  const editingItem = form?.editingItem ?? null
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean
    itemId: string | null
    itemName: string
  }>({ isOpen: false, itemId: null, itemName: '' })

  const showForm = form !== null
  const canAdd = maxItems === undefined || items.length < maxItems
  // Not gated on canAdd: the readability advice matters MOST past the cap.
  const showSoftWarning = softLimit !== undefined && items.length >= softLimit

  const handleEdit = (item: T) => setForm({ editingItem: item })
  const handleSubmitDone = () => setForm(null)
  const handleCancel = () => setForm(null)

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
            editingItem,
            readOnlyReason,
          })}

          {/* Add button — below list */}
          {!showForm && canAdd && (
            <>
              {readOnlyReason && <span id={addReasonId} className="sr-only">{readOnlyReason}</span>}
              <button
                onClick={() => setForm({ editingItem: null })}
                disabled={readOnlyReason !== null}
                title={readOnlyReason ?? undefined}
                aria-describedby={readOnlyReason ? addReasonId : undefined}
                className="mt-4 cursor-pointer rounded border-none dark:border dark:border-blue-600 bg-spert-blue dark:bg-blue-900/30 px-4 py-2 text-sm font-medium text-white dark:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addButtonLabel}
              </button>
            </>
          )}

          {maxItems !== undefined && !canAdd && !showForm && (
            capNotice ? (
              <div className="mt-2 text-xs text-spert-text-muted">{capNotice}</div>
            ) : (
              <p className="mt-2 text-xs text-spert-text-muted">
                Maximum of {maxItems} items reached.
              </p>
            )
          )}

          {showSoftWarning && !showForm && softLimitMessage && (
            <p className="mt-2 text-xs text-spert-warning-dark dark:text-yellow-400">
              {softLimitMessage}
            </p>
          )}

          {/* Form — below list and add button */}
          {showForm && (
            <div className="mt-4">
              {renderForm({
                editingItem,
                onSubmitDone: handleSubmitDone,
                onCancel: handleCancel,
                readOnlyReason,
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
