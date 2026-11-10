// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { DragEvent } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import { PencilIconButton } from '@/shared/components/PencilIconButton'
import { TrashIconButton } from '@/shared/components/TrashIconButton'
import { ExportIconButton } from '@/shared/components/ExportIconButton'
import { ShareIconButton } from '@/shared/components/ShareIconButton'
import { CloneIconButton } from '@/shared/components/CloneIconButton'
import { DragHandle } from '@/shared/components/DragHandle'
import {
  ABOVE_OPEN,
  ACTIONS,
  BADGE,
  GRIP,
  META,
  NAME,
  NAME_ROW,
  OPEN,
  REVEAL,
  TILE,
  TILE_BG,
  TILE_BORDER,
  TILE_DROP,
  TILE_HOVER,
} from './dashboard-styles'

interface ProjectTileProps {
  project: Project
  /** The tile's meta lines (`tileMetaLines`). */
  metaLines: string[]
  /** "View only" / "Not in cloud", or null (Brief 39): shown beside the name and named in its button. */
  badge: string | null
  /** Why Delete is disabled; null when it is offered (V8: disabled with its reason, never hidden). */
  deleteBlockedReason: string | null
  /** The id for the screen-reader-only element holding `deleteBlockedReason`. */
  deleteReasonId: string
  /** Share is offered for this project (its explicit cloud owner, after the first load). */
  showShare: boolean
  isDragged: boolean
  isDropTarget: boolean
  onViewHistory: (projectId: string) => void
  onShare?: (project: Project) => void
  onExport: (id: string) => void
  onEdit: (project: Project) => void
  onClone: (project: Project) => void
  onDelete: (id: string) => void
  onGripDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
}

/** The name button's label names the badge too: a label replaces the button's text for a screen reader. */
const viewHistoryLabel = (name: string, badge: string | null) =>
  badge ? `View history for ${name} (${badge})` : `View history for ${name}`

/**
 * One project's tile (v0.49.0, GanttApp's anatomy): the grip, the name, its access badge and
 * Delete in the first row; the meta lines; then the revealed row, Share (cloud owner) · Export ·
 * Edit · Clone. Edit, Export and Clone are offered whatever the access: Edit opens the project
 * read only for a user who can only view it (OD-8).
 *
 * ⚠️ The whole tile opens Sprint History through the name button's `::after`, which covers the
 * tile. There is deliberately NO click handler on the tile root: every icon's click would bubble
 * into it and navigate, Delete's included, and no jsdom test could see it.
 */
export function ProjectTile({
  project,
  metaLines,
  badge,
  deleteBlockedReason,
  deleteReasonId,
  showShare,
  isDragged,
  isDropTarget,
  onViewHistory,
  onShare,
  onExport,
  onEdit,
  onClone,
  onDelete,
  onGripDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ProjectTileProps) {
  return (
    <li
      data-tile="true"
      data-project-id={project.id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        TILE,
        TILE_BG,
        // The drop box REPLACES the border colour and its hover: a `dark:border-*` left beside
        // it would win in dark mode, and a test reading className could not tell.
        isDropTarget ? TILE_DROP : cn(TILE_BORDER, TILE_HOVER),
        isDragged && 'opacity-50',
      )}
    >
      <div className={NAME_ROW}>
        {/* The only draggable element (D4: reordering is by drag, by the grip). */}
        <span
          draggable
          title="Drag to reorder"
          aria-hidden="true"
          className={GRIP}
          onDragStart={onGripDragStart}
          onDragEnd={onDragEnd}
        >
          <DragHandle />
        </span>
        <h3 className={NAME}>
          <button
            type="button"
            className={OPEN}
            onClick={() => onViewHistory(project.id)}
            title="View history"
            aria-label={viewHistoryLabel(project.name, badge)}
          >
            {project.name}
          </button>
        </h3>
        {badge && <span className={BADGE}>{badge}</span>}
        <span className={cn(ABOVE_OPEN, 'inline-flex flex-none')}>
          {deleteBlockedReason && <span id={deleteReasonId} className="sr-only">{deleteBlockedReason}</span>}
          <TrashIconButton
            onClick={() => onDelete(project.id)}
            ariaLabel={`Delete ${project.name}`}
            title={deleteBlockedReason ?? 'Delete project'}
            disabled={deleteBlockedReason !== null}
            describedBy={deleteBlockedReason ? deleteReasonId : undefined}
          />
        </span>
      </div>
      {metaLines.map((line) => (
        <p key={line} className={META}>
          {line}
        </p>
      ))}
      <div className={ACTIONS}>
        <div className={cn(REVEAL, ABOVE_OPEN)}>
          {showShare && onShare && (
            <ShareIconButton onClick={() => onShare(project)} ariaLabel="Share project" title="Share project" />
          )}
          <ExportIconButton onClick={() => onExport(project.id)} ariaLabel={`Export ${project.name}`} title="Export project" />
          <PencilIconButton onClick={() => onEdit(project)} ariaLabel={`Edit ${project.name}`} title="Edit project" />
          <CloneIconButton onClick={() => onClone(project)} ariaLabel={`Clone ${project.name}`} title="Clone project" />
        </div>
      </div>
    </li>
  )
}
