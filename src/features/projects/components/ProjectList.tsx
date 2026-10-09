// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import type { ProjectAccess } from '@/shared/state/project-access'
import { accessBadge, deleteReason } from '@/features/auth/lib/access-texts'
import { formatDate } from '@/shared/lib/dates'
import { PencilIconButton } from '@/shared/components/PencilIconButton'
import { TrashIconButton } from '@/shared/components/TrashIconButton'
import { ExportIconButton } from '@/shared/components/ExportIconButton'
import { ShareIconButton } from '@/shared/components/ShareIconButton'
import { CloneIconButton } from '@/shared/components/CloneIconButton'
import { DragHandle } from '@/shared/components/DragHandle'

interface ProjectListProps {
  projects: Project[]
  onEdit: (project: Project) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onClone: (project: Project) => void
  onReorder: (projectIds: string[]) => void
  onViewHistory: (projectId: string) => void
  onShare?: (project: Project) => void
  /**
   * The user's access to each project (Brief 39): the badge beside its name,
   * and whether Delete is offered. Required — a list that cannot tell must not
   * guess full access.
   */
  accessOf: (projectId: string) => ProjectAccess
  /** Whether to offer Share for this project (the caller's rule: its owner, in a loaded cloud view). */
  canShare: (projectId: string) => boolean
  editingProjectId?: string | null
}

interface ProjectRowActionsProps {
  project: Project
  /** Share is offered for this project. */
  showShare: boolean
  /** Why Delete is disabled; null when it is offered. */
  deleteBlockedReason: string | null
  /** The id for the screen-reader-only element holding `deleteBlockedReason`. */
  deleteReasonId: string
  isEditing: boolean
  onShare?: (project: Project) => void
  onExport: (id: string) => void
  onEdit: (project: Project) => void
  onClone: (project: Project) => void
  onDelete: (id: string) => void
}

/**
 * A tile's Share slot and action buttons. Edit, Export and Clone stay
 * offered whatever the user's access: Edit opens the project read only for a
 * user who can only view it (OD-8). Delete is disabled, and says why, for anyone
 * but its owner.
 */
function ProjectRowActions({
  project,
  showShare,
  deleteBlockedReason,
  deleteReasonId,
  isEditing,
  onShare,
  onExport,
  onEdit,
  onClone,
  onDelete,
}: ProjectRowActionsProps) {
  return (
    <>
      {showShare && onShare ? (
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
          active={isEditing}
        />
        <CloneIconButton
          onClick={() => onClone(project)}
          ariaLabel={`Clone ${project.name}`}
          title="Clone project"
        />
        {deleteBlockedReason && <span id={deleteReasonId} className="sr-only">{deleteBlockedReason}</span>}
        <TrashIconButton
          onClick={() => onDelete(project.id)}
          ariaLabel={`Delete ${project.name}`}
          title={deleteBlockedReason ?? 'Delete project'}
          disabled={deleteBlockedReason !== null}
          describedBy={deleteBlockedReason ? deleteReasonId : undefined}
        />
      </div>
    </>
  )
}

/** The name button's label names the badge too: a label replaces the button's text for a screen reader. */
const viewHistoryLabel = (name: string, badge: string | null) =>
  badge ? `View history for ${name} (${badge})` : `View history for ${name}`

/** The small muted pill beside a read-only project's name (Brief 39 PR B, T4/T4b); nothing otherwise. */
function AccessBadge({ text }: { text: string | null }) {
  if (text === null) return null
  return (
    <span className="ml-2 whitespace-nowrap rounded-[10px] bg-spert-bg-disabled dark:bg-gray-700 px-2 py-0.5 text-xs text-spert-text-muted dark:text-gray-300">
      {text}
    </span>
  )
}

export function ProjectList({
  projects,
  onEdit,
  onDelete,
  onExport,
  onClone,
  onReorder,
  onViewHistory,
  onShare,
  accessOf,
  canShare,
  editingProjectId,
}: ProjectListProps) {
  // Ids for each tile's delete reason, by tile index: a project id may hold a
  // space, and aria-describedby is a space-separated list.
  const reasonIdBase = useId()
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

  // Splicing at the hovered tile's own index is deliberate, and is NOT the bug
  // v0.40.1 fixed in MilestoneList. This list marks its target with a box around
  // a whole tile; a box surrounds a slot, so it promises "this project will take
  // this position", and splicing at that index keeps the promise in both
  // directions — the dragged project's new index is always dropIndex.
  //
  // MilestoneList draws a *line*, which has no slot to sit in and can only mean a
  // gap between two rows, so it needs forecast/lib/drag-reorder.ts. Reusing that
  // module here would break downward drags by one slot and leave upward drags
  // alone — the same one-direction-only fault, mirrored. ProjectList.test.tsx
  // fails if anyone tries it.
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
              aria-label={viewHistoryLabel(project.name, accessBadge(accessOf(project.id)))}
              className="flex-1 min-w-0 flex items-center text-left bg-transparent border-none cursor-pointer self-stretch py-4 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spert-blue rounded"
            >
              <span className="font-semibold dark:text-gray-100">{project.name}</span>
              <AccessBadge text={accessBadge(accessOf(project.id))} />
              <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                {getProjectSummary(project)}
              </span>
            </button>

            <ProjectRowActions
              project={project}
              showShare={canShare(project.id)}
              deleteBlockedReason={deleteReason(accessOf(project.id))}
              deleteReasonId={`${reasonIdBase}-delete-${index}`}
              isEditing={project.id === editingProjectId}
              onShare={onShare}
              onExport={onExport}
              onEdit={onEdit}
              onClone={onClone}
              onDelete={onDelete}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
