// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Milestone } from '@/shared/types'
import { ListRowActions } from '@/shared/components/ListRowActions'
import { dropGapForPointer, reorderIntoGap } from '../lib/drag-reorder'

interface MilestoneListProps {
  milestones: Milestone[]
  unitOfMeasure: string
  onEdit: (milestone: Milestone) => void
  onDelete: (id: string) => void
  onToggleChart?: (id: string, showOnChart: boolean) => void
  onReorder?: (milestoneIds: string[]) => void
  onRename?: (id: string, newName: string) => void
  editingId?: string | null
}

export function MilestoneList({
  milestones,
  unitOfMeasure,
  onEdit,
  onDelete,
  onToggleChart,
  onReorder,
  onRename,
  editingId,
}: MilestoneListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  // The gap the insertion line is drawn in, 0..milestones.length. Purely
  // presentational — the drop re-derives its own gap from the drop event, so a
  // stray dragleave can never turn a drop into a no-op.
  const [dropGap, setDropGap] = useState<number | null>(null)

  // Inline-rename state (v0.33.5). Power-user shortcut for the common case
  // of fixing a milestone-name typo without opening the full edit form.
  // Enter saves; Escape reverts; blur saves if trimmed + non-empty + changed,
  // reverts otherwise. The full Pencil-button edit path still opens the
  // complete MilestoneForm for name + backlogSize + color edits.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  // Stable id base for the inline-rename input; parametrized per-milestone
  // below so list-rendered inputs don't collide on `id` (form-hygiene rule 5).
  const renameInputIdBase = useId()

  const startRename = (m: Milestone) => {
    setRenamingId(m.id)
    setDraftName(m.name)
  }

  const commitRename = (m: Milestone) => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== m.name) {
      onRename?.(m.id, trimmed)
    }
    setRenamingId(null)
    setDraftName('')
  }

  const cancelRename = () => {
    setRenamingId(null)
    setDraftName('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, m: Milestone) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename(m)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }

  if (milestones.length === 0) {
    return (
      <p className="text-sm italic text-spert-text-muted">
        No milestones defined. Add milestones to forecast individual release dates.
      </p>
    )
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  // Both the line and the drop go through here, which is what keeps them
  // honest: whatever gap the pointer marked is the gap the milestone lands in.
  const gapForEvent = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    const { top, height } = e.currentTarget.getBoundingClientRect()
    return dropGapForPointer(index, e.clientY, top, height)
  }

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropGap(gapForEvent(e, index))
  }

  const handleDragLeave = () => {
    setDropGap(null)
  }

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null) {
      const newOrder = reorderIntoGap(
        milestones.map((m) => m.id),
        draggedIndex,
        gapForEvent(e, index)
      )
      if (newOrder) onReorder?.(newOrder)
    }

    setDraggedIndex(null)
    setDropGap(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDropGap(null)
  }

  // Compute cumulative backlog for display
  type Row = { milestone: Milestone; index: number; cumulative: number }
  const rows = milestones.reduce<Row[]>((acc, m, idx) => {
    const prev = acc[acc.length - 1]?.cumulative ?? 0
    acc.push({ milestone: m, index: idx + 1, cumulative: prev + m.backlogSize })
    return acc
  }, [])

  const total = rows[rows.length - 1]?.cumulative ?? 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-spert-border-light">
            {onReorder && <th className="w-[30px] p-2" />}
            <th className="w-[40px] p-2 text-center font-semibold text-spert-text-secondary">
              #
            </th>
            <th className="p-2 text-left font-semibold text-spert-text-secondary">
              Name
            </th>
            <th className="p-2 text-right font-semibold text-spert-text-secondary">
              Remaining
            </th>
            <th className="p-2 text-right font-semibold text-spert-text-secondary">
              Cumulative
            </th>
            <th className="w-[40px] p-2 text-center font-semibold text-spert-text-secondary">
              Color
            </th>
            <th className="w-[50px] p-2 text-center font-semibold text-spert-text-secondary" title="Show reference line on burn-up chart">
              Chart
            </th>
            <th className="p-2 text-right font-semibold text-spert-text-secondary">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ milestone: m, index, cumulative: cum }, rowIdx) => (
            <tr
              key={m.id}
              draggable={!!onReorder}
              onDragStart={(e) => handleDragStart(e, rowIdx)}
              onDragOver={(e) => handleDragOver(e, rowIdx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, rowIdx)}
              onDragEnd={handleDragEnd}
              className={cn(
                'border-b border-spert-border-light',
                // The line lives in a gap, so it draws as the top border of the
                // row below it — except the final gap, which has no row below
                // and draws under the last row instead. Exactly one line shows.
                dropGap === rowIdx && 'border-t-2 border-t-spert-blue',
                dropGap === rows.length &&
                  rowIdx === rows.length - 1 &&
                  'border-b-2 border-b-spert-blue',
                draggedIndex === rowIdx && 'opacity-50'
              )}
            >
              {onReorder && (
                <td className="p-1 text-center">
                  <span
                    className="inline-flex cursor-grab active:cursor-grabbing text-spert-text-light"
                    title="Drag to reorder"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </span>
                </td>
              )}
              <td className="p-2 text-center text-spert-text-muted">{index}</td>
              <td className="p-2 font-medium dark:text-gray-100">
                {onRename && renamingId === m.id ? (
                  <input
                    id={`${renameInputIdBase}-${m.id}`}
                    name="milestoneName"
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => commitRename(m)}
                    onKeyDown={(e) => handleRenameKeyDown(e, m)}
                    maxLength={50}
                    // size=1 keeps the input's intrinsic min-content width tiny so the
                    // table's auto-layout algorithm doesn't grow the Name column to fit
                    // the input's default size=20 preference (~200px). w-full then stretches
                    // the input to fill whatever width the column has settled on from the
                    // rest of the rows' plain-text content — preventing the layout shift
                    // the user reported in v0.33.5.
                    size={1}
                    autoFocus
                    aria-label={`Rename ${m.name}`}
                    className="w-full rounded border border-spert-blue bg-spert-bg-highlight p-[0.2rem] font-medium text-[0.875rem] dark:bg-gray-700 dark:text-gray-100"
                  />
                ) : onRename && m.id !== editingId ? (
                  <button
                    type="button"
                    onClick={() => startRename(m)}
                    title="Click to rename"
                    draggable={false}
                    className="cursor-text rounded text-left font-medium decoration-spert-text-muted decoration-dotted underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-spert-blue dark:text-gray-100"
                  >
                    {m.name}
                  </button>
                ) : (
                  m.name
                )}
              </td>
              <td className="whitespace-nowrap p-2 text-right dark:text-gray-100">
                {m.backlogSize.toLocaleString()} {unitOfMeasure}
              </td>
              <td className="whitespace-nowrap p-2 text-right text-spert-text-muted">
                {cum.toLocaleString()} {unitOfMeasure}
              </td>
              <td className="p-2 text-center">
                <span
                  className="inline-block size-4 rounded-full border border-spert-border dark:border-gray-600"
                  style={{ backgroundColor: m.color }}
                  title={m.color}
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  name="showMilestoneOnChart"
                  checked={m.showOnChart !== false}
                  onChange={(e) => onToggleChart?.(m.id, e.target.checked)}
                  className="cursor-pointer accent-blue-600"
                  title={m.showOnChart !== false ? 'Shown on burn-up chart' : 'Hidden from burn-up chart'}
                  aria-label={`Show ${m.name} on chart`}
                />
              </td>
              <ListRowActions
                onEdit={() => onEdit(m)}
                onDelete={() => onDelete(m.id)}
                isEditing={m.id === editingId}
                editLabel={`Edit ${m.name}`}
                deleteLabel={`Delete ${m.name}`}
              />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-spert-border-light">
            {onReorder && <td />}
            <td colSpan={2} className="p-2 text-right font-semibold text-spert-text-secondary">
              Total remaining:
            </td>
            <td className="whitespace-nowrap p-2 text-right font-semibold dark:text-gray-100">
              {total.toLocaleString()} {unitOfMeasure}
            </td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
