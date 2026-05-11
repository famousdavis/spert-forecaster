// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import { formatDate } from '@/shared/lib/dates'
import { PencilIconButton } from '@/shared/components/PencilIconButton'
import { TrashIconButton } from '@/shared/components/TrashIconButton'
import { ExportIconButton } from '@/shared/components/ExportIconButton'
import { ShareIconButton } from '@/shared/components/ShareIconButton'
import { DragHandle } from '@/shared/components/DragHandle'

interface ProjectListProps {
  projects: Project[]
  onEdit: (project: Project) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onReorder: (projectIds: string[]) => void
  onViewHistory: (projectId: string) => void
  onShare?: (project: Project) => void
  isCloudMode?: boolean
  ownedProjectIds?: Set<string>
  editingProjectId?: string | null
}

export function ProjectList({
  projects,
  onEdit,
  onDelete,
  onExport,
  onReorder,
  onViewHistory,
  onShare,
  isCloudMode,
  ownedProjectIds,
  editingProjectId,
}: ProjectListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)

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

    const newOrder = [...projects.map((p) => p.id)]
    const [removed] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(dropIndex, 0, removed)
    onReorder(newOrder)

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  if (projects.length === 0) {
    return null
  }

  // Build sprint count summary
  const getProjectSummary = (project: Project) => {
    const parts: string[] = []
    // Only show sprint cadence if it's been configured
    if (project.sprintCadenceWeeks) {
      parts.push(`${project.sprintCadenceWeeks}-week sprints`)
    }
    parts.push(project.unitOfMeasure)
    if (project.projectFinishDate) {
      parts.push(`finish: ${formatDate(project.projectFinishDate)}`)
    }
    return parts.length > 0 ? `(${parts.join(', ')})` : ''
  }

  return (
    <div className="space-y-2">
      {projects.map((project, index) => (
        <div
          key={project.id}
          data-tile="true"
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          className={cn(
            'rounded-lg cursor-default transition-colors duration-[120ms]',
            hoveredProjectId === project.id
              ? 'bg-blue-50 dark:bg-[rgba(0,112,243,0.10)]'
              : 'bg-white dark:bg-gray-800',
            dragOverIndex === index
              ? 'border-2 border-spert-blue'
              : 'border border-spert-border-light dark:border-gray-700',
            draggedIndex === index ? 'opacity-50' : 'opacity-100'
          )}
        >
          <div className="flex items-center px-4">
            <div
              draggable
              title="Drag to reorder"
              className="flex-shrink-0"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                let el: HTMLElement | null = e.currentTarget as HTMLElement
                while (el && !el.dataset.tile) el = el.parentElement
                if (el) e.dataTransfer.setDragImage(el, 12, el.getBoundingClientRect().height / 2)
                handleDragStart(e, index)
              }}
              onDragEnd={handleDragEnd}
            >
              <DragHandle />
            </div>

            <button
              type="button"
              onClick={() => onViewHistory(project.id)}
              onMouseEnter={() => setHoveredProjectId(project.id)}
              onMouseLeave={() => setHoveredProjectId((prev) => (prev === project.id ? null : prev))}
              onFocus={() => setHoveredProjectId(project.id)}
              onBlur={() => setHoveredProjectId((prev) => (prev === project.id ? null : prev))}
              title="View history"
              aria-label={`View history for ${project.name}`}
              className="flex-1 min-w-0 flex items-center text-left bg-transparent border-none cursor-pointer self-stretch py-4 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spert-blue rounded"
            >
              <span className="font-semibold dark:text-gray-100">{project.name}</span>
              <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                {getProjectSummary(project)}
              </span>
            </button>

            {isCloudMode && onShare && ownedProjectIds?.has(project.id) ? (
              <ShareIconButton
                onClick={() => onShare(project)}
                ariaLabel="Share project"
                title="Share project"
              />
            ) : (
              <div className="w-8 h-8 flex-shrink-0" aria-hidden="true" />
            )}

            <div className="flex items-center gap-0.5">
              <ExportIconButton
                onClick={() => onExport(project.id)}
                ariaLabel={`Export ${project.name}`}
                title="Export project"
              />
              <PencilIconButton
                onClick={() => onEdit(project)}
                ariaLabel={`Edit ${project.name}`}
                title="Edit project"
                active={project.id === editingProjectId}
              />
              <TrashIconButton
                onClick={() => onDelete(project.id)}
                ariaLabel={`Delete ${project.name}`}
                title="Delete project"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
