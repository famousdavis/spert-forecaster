// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useRef } from 'react'
import { HeadingRow } from '@/shared/components/HeadingRow'
import { useProjectStore } from '@/shared/state/project-store'
// Deep imports, as in AppShell: `@/features/projects`' barrel deliberately exports only `ProjectsTab`.
import { ProjectsToolbar } from '@/features/projects/components/ProjectsToolbar'
import { exportWorkspaceBackup } from '@/features/projects/lib/export-backup'

const noop = () => {}

/**
 * The Projects heading row while cloud mode waits for its first load (Brief 40, R2), when the CloudLoadingPanel stands
 * in for ProjectsTab's body. Contract §7 ("Loading"): the frame and the heading row render at full geometry and only
 * the body waits, and the toolbar's four buttons keep their fixed places (Nov 8: never hidden, disabled instead).
 *
 * The gates: Export All as always (disabled with no projects; it is a read, the same helper as the panel's
 * "Export a backup"); Import as always while the cloud is pending (disabled). Load Sample and New Project are
 * disabled too: until v0.52.0 the whole toolbar was absent here, and either one would write a project into a copy
 * that may be stale, which the first-load wait exists to prevent.
 */
export function ProjectsLoadingHeading() {
  const hasProjects = useProjectStore((state) => state.projects.length > 0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  const newProjectRef = useRef<HTMLButtonElement>(null)
  return (
    <HeadingRow
      toolbar={
        <ProjectsToolbar
          hasProjects={hasProjects}
          importDisabled
          addDisabled
          fileInputRef={fileInputRef}
          importRef={importRef}
          newProjectRef={newProjectRef}
          onExportAll={exportWorkspaceBackup}
          onImportClick={noop}
          onFileChange={noop}
          onLoadSample={noop}
          onNewProject={noop}
        />
      }
    >
      Projects
    </HeadingRow>
  )
}
