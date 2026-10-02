// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Project, Sprint } from '@/shared/types'
import type { ChangeLogEntry } from '@/shared/state/storage'
import { APP_VERSION } from '@/shared/constants'
import { today } from '@/shared/lib/dates'
import { PROJECT_SUBSET_EXPORT_TYPE } from '@/shared/state/import-limits'

// Owned by import-limits.ts, which the importer's limit and classifier read too.
export { PROJECT_SUBSET_EXPORT_TYPE }

export interface ExportProjectsState {
  projects: Project[]
  sprints: Sprint[]
  originRef: string
  storageRef: string
  changeLog: ChangeLogEntry[]
  exportedBy?: string
  exportedById?: string
}

export interface ProjectSubsetExport {
  version: string
  exportedAt: string
  _exportType: typeof PROJECT_SUBSET_EXPORT_TYPE
  projects: Project[]
  sprints: Sprint[]
  _originRef: string
  _storageRef: string
  _changeLog: ChangeLogEntry[]
  _exportedBy?: string
  _exportedById?: string
}

/**
 * Slugify a project name for use in a filename.
 * Lowercase, spaces→hyphens, strip non-`[a-z0-9-]`, collapse hyphens, trim, max 40 chars.
 * Falls back to `'project'` if the input reduces to an empty string.
 */
export function slugifyProjectName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'project'
  )
}

/**
 * Build the JSON payload for a per-project (or multi-project) subset export.
 * The `_changeLog` is filtered to events relevant only to the included
 * projects/sprints/adjustments/milestones — global events (import, dataset
 * merge-import) are kept since they're workspace-level provenance.
 */
export function buildProjectSubsetExport(
  projectIds: string[],
  state: ExportProjectsState,
): ProjectSubsetExport {
  if (projectIds.length === 0) {
    throw new Error('No projects selected for export')
  }

  const idSet = new Set(projectIds)
  const projects = state.projects.filter((p) => idSet.has(p.id))
  if (projects.length === 0) {
    throw new Error('Selected project(s) not found')
  }
  const sprints = state.sprints.filter((s) => idSet.has(s.projectId))

  // Filter changelog: keep dataset-level events (no `id`) and entries whose `id`
  // matches an included project, sprint, adjustment, or milestone.
  const relevantIds = new Set<string>()
  for (const p of projects) {
    relevantIds.add(p.id)
    for (const a of p.productivityAdjustments ?? []) relevantIds.add(a.id)
    for (const m of p.milestones ?? []) relevantIds.add(m.id)
  }
  for (const s of sprints) relevantIds.add(s.id)

  const filteredLog = state.changeLog.filter((entry) => {
    if (!entry.id) return entry.entity === 'dataset'
    return relevantIds.has(entry.id)
  })

  const payload: ProjectSubsetExport = {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    _exportType: PROJECT_SUBSET_EXPORT_TYPE,
    projects,
    sprints,
    _originRef: state.originRef,
    _storageRef: state.storageRef,
    _changeLog: filteredLog,
  }

  if (state.exportedBy) payload._exportedBy = state.exportedBy
  if (state.exportedById) payload._exportedById = state.exportedById

  return payload
}

function downloadJson(filename: string, payload: unknown): void {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Export a single project + its sprints as a portable JSON file.
 * Filename: `spert-forecaster-{slug}-{date}.json`.
 */
export function exportSingleProject(
  projectId: string,
  state: ExportProjectsState,
): { filename: string } {
  const project = state.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('Project not found')

  const payload = buildProjectSubsetExport([projectId], state)
  const filename = `spert-forecaster-${slugifyProjectName(project.name)}-${today()}.json`
  downloadJson(filename, payload)
  return { filename }
}

/**
 * Export multiple selected projects + their sprints as one combined JSON file.
 * Filename uses the single project slug when one project is selected, else
 * `spert-forecaster-projects-{date}.json`.
 */
export function exportSelectedProjects(
  projectIds: string[],
  state: ExportProjectsState,
): { filename: string; exported: number } {
  const payload = buildProjectSubsetExport(projectIds, state)
  const filename =
    payload.projects.length === 1
      ? `spert-forecaster-${slugifyProjectName(payload.projects[0].name)}-${today()}.json`
      : `spert-forecaster-projects-${today()}.json`
  downloadJson(filename, payload)
  return { filename, exported: payload.projects.length }
}
