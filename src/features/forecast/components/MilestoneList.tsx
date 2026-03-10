// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Milestone } from '@/shared/types'
import { ListRowActions } from '@/shared/components/ListRowActions'

interface MilestoneListProps {
  milestones: Milestone[]
  unitOfMeasure: string
  onEdit: (milestone: Milestone) => void
  onDelete: (id: string) => void
  onToggleChart?: (id: string, showOnChart: boolean) => void
  onReorder?: (milestoneIds: string[]) => void
}

export function MilestoneList({
  milestones,
  unitOfMeasure,
  onEdit,
  onDelete,
  onToggleChart,
  onReorder,
}: MilestoneListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

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

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newOrder = milestones.map((m) => m.id)
    const [removed] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(dropIndex, 0, removed)
    onReorder?.(newOrder)

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // Compute cumulative backlog for display
  let cumulative = 0
  const rows = milestones.map((m, idx) => {
    cumulative += m.backlogSize
    return { milestone: m, index: idx + 1, cumulative }
  })

  const total = cumulative

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
                dragOverIndex === rowIdx && 'border-b-2 border-b-spert-blue',
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
              <td className="p-2 font-medium dark:text-gray-100">{m.name}</td>
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
                  checked={m.showOnChart !== false}
                  onChange={(e) => onToggleChart?.(m.id, e.target.checked)}
                  className="cursor-pointer accent-blue-600"
                  title={m.showOnChart !== false ? 'Shown on burn-up chart' : 'Hidden from burn-up chart'}
                  aria-label={`Show ${m.name} on chart`}
                />
              </td>
              <ListRowActions onEdit={() => onEdit(m)} onDelete={() => onDelete(m.id)} />
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
