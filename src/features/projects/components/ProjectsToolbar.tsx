// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { ChangeEvent, RefObject } from 'react'
import { cn } from '@/lib/utils'
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
  fileInputRef: RefObject<HTMLInputElement | null>
  newProjectRef: RefObject<HTMLButtonElement | null>
  onExportAll: () => void
  onImportClick: () => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onLoadSample: () => void
  onNewProject: () => void
}

// The empty state's two buttons (ProjectsEmptyState.tsx) are the model for both styles.
const BUTTON =
  'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const SECONDARY =
  'bg-transparent text-spert-blue border-spert-blue hover:bg-spert-blue/10 disabled:hover:bg-transparent dark:text-blue-300 dark:border-blue-400 dark:hover:bg-blue-400/10'
const PRIMARY = 'bg-spert-blue text-white border-spert-blue hover:bg-spert-blue-dark'

export function ProjectsToolbar({
  hasProjects,
  importDisabled,
  fileInputRef,
  newProjectRef,
  onExportAll,
  onImportClick,
  onFileChange,
  onLoadSample,
  onNewProject,
}: ProjectsToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onExportAll}
        disabled={!hasProjects}
        aria-label="Export all projects as JSON"
        className={cn(BUTTON, SECONDARY)}
      >
        <ToolbarIcon d={TOOLBAR_ICON_PATHS.export} />
        Export All
      </button>
      <button
        type="button"
        onClick={onImportClick}
        disabled={importDisabled}
        aria-label="Import projects from JSON"
        className={cn(BUTTON, SECONDARY)}
      >
        <ToolbarIcon d={TOOLBAR_ICON_PATHS.import} />
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
      <button type="button" onClick={onLoadSample} className={cn(BUTTON, SECONDARY)}>
        <ToolbarIcon d={TOOLBAR_ICON_PATHS.sample} />
        Load Sample
      </button>
      <button type="button" ref={newProjectRef} onClick={onNewProject} className={cn(BUTTON, PRIMARY)}>
        <ToolbarIcon d={TOOLBAR_ICON_PATHS.plus} />
        New Project
      </button>
    </div>
  )
}
