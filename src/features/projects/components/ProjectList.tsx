// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useId, useMemo, useState } from 'react'
import type { Project, Sprint } from '@/shared/types'
import type { ProjectAccess } from '@/shared/state/project-access'
import { isProjectArchived, projectPrefOf, reorderShown, type ProjectColor, type ProjectPrefs } from '@/shared/lib/project-prefs'
import { accessBadge, deleteReason } from '@/features/auth/lib/access-texts'
import { summarizeSprints, tileMetaLines } from '../lib/tile-meta'
import { ProjectTile } from './ProjectTile'
import { GRID, GRID_AREA } from './dashboard-styles'

interface ProjectListProps {
  /** The tiles to render: the projects this person sees (archived ones hidden unless shown). */
  projects: Project[]
  /**
   * Every project, in order (v0.50.0). A drag reorders the tiles shown, and the order handed to
   * `onReorder` is this list with those slots reordered (`reorderShown`), so a hidden project
   * keeps its slot.
   */
  allProjects: Project[]
  /** This person's tile colours and archived projects. */
  prefs: ProjectPrefs
  /** The project whose Tile color popover is open, or null. */
  colorOpenFor: string | null
  onColorOpenChange: (projectId: string, open: boolean) => void
  onPickColor: (projectId: string, color: ProjectColor | null) => boolean
  onArchive: (project: Project) => void
  onUnarchive: (project: Project) => void
  /**
   * Every sprint in the store (`state.sprints`, read once by the caller). Each tile's count and
   * last sprint are derived here in a `useMemo`. ⚠️ Never select per project with
   * `useProjectStore(selectProjectSprints(id))`: it returns a new array on every call and
   * throws "Maximum update depth exceeded" under Zustand 5.
   */
  sprints: Sprint[]
  onEdit: (project: Project) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onClone: (project: Project) => void
  /** ⚠️ Always handed the FULL id list: `reorderProjects` deletes every project it is not given. */
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
}

/**
 * The Projects dashboard's grid of tiles (v0.49.0): one column, two from 560 px of the grid's
 * own width, three from 860 (GanttApp's container queries). Reordering is by dragging a tile's
 * grip onto another tile.
 */
export function ProjectList({
  projects,
  allProjects,
  prefs,
  colorOpenFor,
  onColorOpenChange,
  onPickColor,
  onArchive,
  onUnarchive,
  sprints,
  onEdit,
  onDelete,
  onExport,
  onClone,
  onReorder,
  onViewHistory,
  onShare,
  accessOf,
  canShare,
}: ProjectListProps) {
  // Ids for each tile's delete reason, by tile index: a project id may hold a
  // space, and aria-describedby is a space-separated list.
  const reasonIdBase = useId()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Each tile's meta lines, from one pass over the store's sprints.
  const metaById = useMemo(() => {
    const byProject = new Map<string, Sprint[]>()
    for (const s of sprints) {
      const list = byProject.get(s.projectId)
      if (list) list.push(s)
      else byProject.set(s.projectId, [s])
    }
    return new Map(
      projects.map((p) => [p.id, tileMetaLines(p, summarizeSprints(p, byProject.get(p.id) ?? []))] as const),
    )
  }, [projects, sprints])

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
    // ⚠️ `newOrder` holds the SHOWN tiles only. reorderProjects deletes every id it is not given
    // (B29), so it gets the full list, with the shown slots reordered and each hidden project in
    // its own slot.
    onReorder(reorderShown(allProjects, newOrder).map((p) => p.id))

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

  return (
    <div className={GRID_AREA}>
      <ul className={GRID} aria-label="Projects">
        {projects.map((project, index) => (
          <ProjectTile
            key={project.id}
            project={project}
            metaLines={metaById.get(project.id) ?? []}
            badge={accessBadge(accessOf(project.id))}
            deleteBlockedReason={deleteReason(accessOf(project.id))}
            deleteReasonId={`${reasonIdBase}-delete-${index}`}
            showShare={canShare(project.id)}
            isDragged={draggedIndex === index}
            isDropTarget={dragOverIndex === index}
            color={projectPrefOf(prefs, project.id).color}
            archived={isProjectArchived(prefs, project.id)}
            colorOpen={colorOpenFor === project.id}
            onColorOpenChange={(open) => onColorOpenChange(project.id, open)}
            onPickColor={(color) => onPickColor(project.id, color)}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onViewHistory={onViewHistory}
            onShare={onShare}
            onExport={onExport}
            onEdit={onEdit}
            onClone={onClone}
            onDelete={onDelete}
            onGripDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              // The whole tile as the drag image, found through `data-tile`, not just the small grip.
              let el: HTMLElement | null = e.currentTarget as HTMLElement
              while (el && !el.dataset.tile) el = el.parentElement
              if (el) e.dataTransfer.setDragImage(el, 12, el.getBoundingClientRect().height / 2)
              handleDragStart(e, index)
            }}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          />
        ))}
      </ul>
    </div>
  )
}
