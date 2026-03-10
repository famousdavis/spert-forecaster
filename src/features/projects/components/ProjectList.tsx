// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import { formatDate } from '@/shared/lib/dates'

interface ProjectListProps {
  projects: Project[]
  activeProjectId?: string
  onEdit: (project: Project) => void
  onDelete: (id: string) => void
  onReorder: (projectIds: string[]) => void
  onViewHistory: (projectId: string) => void
  onShare?: (project: Project) => void
  isCloudMode?: boolean
}

export function ProjectList({
  projects,
  activeProjectId,
  onEdit,
  onDelete,
  onReorder,
  onViewHistory,
  onShare,
  isCloudMode,
}: ProjectListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

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
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={cn(
            'rounded-lg bg-white dark:bg-gray-800 cursor-default',
            dragOverIndex === index
              ? 'border-2 border-spert-blue'
              : 'border border-spert-border-light dark:border-gray-700',
            draggedIndex === index ? 'opacity-50' : 'opacity-100'
          )}
        >
          <div className="flex items-center p-4">
            {/* Drag handle */}
            <div
              className="mr-3 cursor-grab active:cursor-grabbing text-spert-text-light"
              title="Drag to reorder"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
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
            </div>

            {/* Project info */}
            <div className="flex-1">
              <span className="font-semibold dark:text-gray-100">{project.name}</span>
              <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                {getProjectSummary(project)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewHistory(project.id)}
                className="px-4 py-2 bg-[#e7f3ff] dark:bg-blue-900/30 border border-spert-blue rounded cursor-pointer text-[0.9rem] text-spert-blue dark:text-blue-400"
              >
                View History
              </button>
              {isCloudMode && onShare && (
                <button
                  onClick={() => onShare(project)}
                  className="px-4 py-2 bg-[#f0f0ff] dark:bg-purple-900/30 border border-[#7c3aed] dark:border-purple-500 rounded cursor-pointer text-[0.9rem] text-[#7c3aed] dark:text-purple-300"
                >
                  Share
                </button>
              )}
              <button
                onClick={() => onEdit(project)}
                className="px-4 py-2 bg-spert-bg-warning-light dark:bg-yellow-900/40 border border-spert-warning dark:border-yellow-600 rounded cursor-pointer text-[0.9rem] dark:text-yellow-200"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(project.id)}
                className="px-4 py-2 bg-spert-bg-error-light dark:bg-red-900/40 border border-spert-error dark:border-red-600 rounded cursor-pointer text-[0.9rem] dark:text-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
