// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { ChangeEvent, RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  TOOLBAR_BUTTON,
  TOOLBAR_ICON_PRIMARY,
  TOOLBAR_ICON_SECONDARY,
  TOOLBAR_PRIMARY,
  TOOLBAR_SECONDARY,
} from '@/shared/components/toolbar-button-styles'
import { ToolbarIcon } from './ToolbarIcon'
import { TOOLBAR_ICON_PATHS } from './toolbarIconPaths'

/**
 * The Projects dashboard toolbar, in the SPERT® suite's shared order: Export All · Import ·
 * Load Sample · New Project, with New Project as the filled primary button on the right.
 *
 * ⚠️ Every button is ALWAYS rendered. None appears, disappears or moves with the project count
 * or a loading state; with no projects, Export All is disabled rather than hidden.
 *
 * Deliberately NOT `role="toolbar"`: that role promises arrow-key navigation between the
 * buttons, and nothing here provides it.
 */
interface ProjectsToolbarProps {
  hasProjects: boolean
  /** Import's gate, unchanged: an import being read or applied, or the first cloud load pending. */
  importDisabled: boolean
  /**
   * Load Sample and New Project, disabled only while cloud mode waits for its first load (v0.52.0): the frame keeps
   * the toolbar on screen then (`ProjectsLoadingHeading`), where until v0.52.0 there was none.
   */
  addDisabled?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  /** Where focus goes once an import preview has gone (useImportFocusReturn, v0.50.4). */
  importRef: RefObject<HTMLButtonElement | null>
  newProjectRef: RefObject<HTMLButtonElement | null>
  onExportAll: () => void
  onImportClick: () => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onLoadSample: () => void
  onNewProject: () => void
}

// v0.49.0: GanttApp's `.pt-btn` look (grey outline, dark text, grey icons), from the shared
// strings that the welcome empty state (ProjectsEmptyState.tsx) uses too. The toolbar is the
// model now; until v0.49.0 it copied the empty state's blue outline.
//
// v0.52.0: `sf-btn` (the SPERT® Suite frame, contract §2) sizes every toolbar button the same in every app: 36 px tall,
// 14 px / 500, with 18 px icons. It is unlayered, so it wins over the shared strings' size, padding and weight
// (New Project's 600 becomes 500); corners, colours, hover and the disabled look stay Forecaster's own. Only the
// toolbar carries it: the welcome empty state's buttons keep the shared strings' size.
const SECONDARY = cn('sf-btn', TOOLBAR_BUTTON, TOOLBAR_SECONDARY)
const PRIMARY = cn('sf-btn', TOOLBAR_BUTTON, TOOLBAR_PRIMARY)
const icon = (d: string, primary = false) => (
  <ToolbarIcon d={d} className={primary ? TOOLBAR_ICON_PRIMARY : TOOLBAR_ICON_SECONDARY} />
)

export function ProjectsToolbar({
  hasProjects,
  importDisabled,
  addDisabled = false,
  fileInputRef,
  importRef,
  newProjectRef,
  onExportAll,
  onImportClick,
  onFileChange,
  onLoadSample,
  onNewProject,
}: ProjectsToolbarProps) {
  return (
    // The frame's toolbar (`.sf-toolbar`): flush right on the heading row, wrapping only its own buttons, in order.
    <div className="sf-toolbar" data-sf="toolbar">
      <button
        type="button"
        onClick={onExportAll}
        disabled={!hasProjects}
        aria-label="Export all projects as JSON"
        className={SECONDARY}
      >
        {icon(TOOLBAR_ICON_PATHS.export)}
        Export All
      </button>
      <button
        type="button"
        ref={importRef}
        onClick={onImportClick}
        disabled={importDisabled}
        aria-label="Import projects from JSON"
        className={SECONDARY}
      >
        {icon(TOOLBAR_ICON_PATHS.import)}
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        name="projectImportFile"
        accept=".json"
        onChange={onFileChange}
        className="hidden"
      />
      <button type="button" onClick={onLoadSample} disabled={addDisabled} className={SECONDARY}>
        {icon(TOOLBAR_ICON_PATHS.sample)}
        Load Sample
      </button>
      <button type="button" ref={newProjectRef} onClick={onNewProject} disabled={addDisabled} className={PRIMARY}>
        {icon(TOOLBAR_ICON_PATHS.plus, true)}
        New Project
      </button>
    </div>
  )
}
