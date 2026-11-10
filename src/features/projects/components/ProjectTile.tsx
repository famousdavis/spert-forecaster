// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useRef, type DragEvent } from 'react'
import { cn } from '@/lib/utils'
import type { Project } from '@/shared/types'
import type { ProjectColor } from '@/shared/lib/project-prefs'
import { PencilIconButton } from '@/shared/components/PencilIconButton'
import { TrashIconButton } from '@/shared/components/TrashIconButton'
import { ExportIconButton } from '@/shared/components/ExportIconButton'
import { ShareIconButton } from '@/shared/components/ShareIconButton'
import { CloneIconButton } from '@/shared/components/CloneIconButton'
import { ArchiveIconButton } from '@/shared/components/ArchiveIconButton'
import { DragHandle } from '@/shared/components/DragHandle'
import {
  ABOVE_OPEN,
  ACTIONS,
  BADGE,
  GRIP,
  META,
  NAME,
  NAME_ARCHIVED,
  NAME_COLOR,
  NAME_ROW,
  OPEN,
  REVEAL,
  STAY,
  TILE,
  TILE_ARCHIVED_BORDER,
  TILE_BORDER,
  TILE_DROP,
  TILE_HOVER,
} from './dashboard-styles'
import { TILE_TINT, TILE_TINT_ARCHIVED } from './tile-color-styles'
import { ProjectColorButton, ProjectColorPopover } from './ProjectColorControl'

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
  /** This person's tile colour for the project (v0.50.0); undefined for none. */
  color: ProjectColor | undefined
  /** Archived by this person (v0.50.0): GanttApp's archived look, Unarchive always shown. */
  archived: boolean
  /** The Tile color popover is open on this tile. */
  colorOpen: boolean
  onColorOpenChange: (open: boolean) => void
  /** Applies a colour pick; false when it was refused, and the popover puts its radio back. */
  onPickColor: (color: ProjectColor | null) => boolean
  onArchive: (project: Project) => void
  onUnarchive: (project: Project) => void
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

/**
 * The name button's label names the badge too: a label replaces the button's text for a screen
 * reader. An archived tile's says what a click does (v0.50.0); "Archived" itself is not in it, the
 * badge shows it.
 */
const viewHistoryLabel = (name: string, badge: string | null, archived: boolean) =>
  `${archived ? 'Unarchive and view' : 'View'} history for ${name}${badge ? ` (${badge})` : ''}`

/** The tile's border at rest: the drop box replaces either look whole (R1's rule). */
const borderClasses = (isDropTarget: boolean, archived: boolean) => {
  if (isDropTarget) return TILE_DROP
  return cn(archived ? TILE_ARCHIVED_BORDER : TILE_BORDER, TILE_HOVER)
}

/**
 * One project's tile (v0.49.0, GanttApp's anatomy): the grip, the name, its access badge and
 * Delete in the first row; the meta lines; then the revealed row, Share (cloud owner) · Export ·
 * Edit · Clone · Archive · Tile color (v0.50.0, D4). Edit, Export and Clone are offered whatever
 * the access: Edit opens the project read only for a user who can only view it (OD-8). Archive,
 * Unarchive and Tile color are offered to everyone who sees the tile, for every role and access
 * state (D31): they change only this person's settings, never the project.
 *
 * An archived tile (D20): half the tint, a dashed border, the name in the meta colour, an
 * "Archived" badge after the access badge, no Archive in the revealed row, and Unarchive in a
 * group that is always shown. Its name button unarchives it and opens Sprint History.
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
  color,
  archived,
  colorOpen,
  onColorOpenChange,
  onPickColor,
  onArchive,
  onUnarchive,
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
  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const tint = (archived ? TILE_TINT_ARCHIVED : TILE_TINT)[color ?? 'none']
  return (
    <li
      data-tile="true"
      data-project-id={project.id}
      data-color={color ?? 'none'}
      data-archived={archived ? 'true' : undefined}
      // Keeps the revealed row shown while the popover is open, whatever has focus or the pointer.
      data-popopen={colorOpen ? 'true' : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        TILE,
        tint,
        // The drop box REPLACES the border colour and its hover, and the archived dashes: a
        // `dark:border-*` or `border-dashed` left beside it would win, and a test reading
        // className could not tell.
        borderClasses(isDropTarget, archived),
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
        <h3 className={cn(NAME, archived ? NAME_ARCHIVED : NAME_COLOR)}>
          <button
            type="button"
            className={OPEN}
            onClick={() => onViewHistory(project.id)}
            title={archived ? 'Unarchive and view history' : 'View history'}
            aria-label={viewHistoryLabel(project.name, badge, archived)}
          >
            {project.name}
          </button>
        </h3>
        {badge && <span className={BADGE}>{badge}</span>}
        {archived && <span className={BADGE}>Archived</span>}
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
          {!archived && (
            <ArchiveIconButton variant="archive" onClick={() => onArchive(project)} ariaLabel={`Archive ${project.name}`} title="Archive project" />
          )}
          <ProjectColorButton
            projectName={project.name}
            color={color}
            open={colorOpen}
            buttonRef={colorButtonRef}
            onOpenChange={onColorOpenChange}
          />
        </div>
        {/* Beside the row, not inside it: the actions bar is unpositioned, so the tile is the
            popover's containing block, and its z-20 is not capped at the row's level 1. */}
        {colorOpen && (
          <ProjectColorPopover color={color} buttonRef={colorButtonRef} onPick={onPickColor} onOpenChange={onColorOpenChange} />
        )}
        {archived && (
          // ABOVE_OPEN: v0.48.2's shared base has no z-index of its own, so without it a click on
          // Unarchive lands on the name button's ::after and opens Sprint History.
          <div className={cn(STAY, ABOVE_OPEN)}>
            <ArchiveIconButton variant="unarchive" onClick={() => onUnarchive(project)} ariaLabel={`Unarchive ${project.name}`} title="Unarchive project" />
          </div>
        )}
      </div>
    </li>
  )
}
