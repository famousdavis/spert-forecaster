// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { exportSelectedProjects } from '@/features/projects/lib/export-project'
import { getWorkspaceId, getStorageMode } from '@/shared/state/storage'
import { auth } from '@/shared/firebase/config'
import { reportExportCheck } from '@/shared/state/export-check-store'

const sectionHeaderClass = 'text-lg font-semibold text-spert-blue mb-4'
const descriptionClass = 'text-xs text-spert-text-muted dark:text-gray-400'
const labelClass = 'text-sm font-semibold text-spert-text-secondary dark:text-gray-300'

export function ExportProjectsSection() {
  const projects = useProjectStore((state) => state.projects)
  const sprints = useProjectStore((state) => state.sprints)
  const originRef = useProjectStore((state) => state._originRef)
  const changeLog = useProjectStore((state) => state._changeLog)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)

  const allSelected = selectedIds.size === projects.length && projects.length > 0
  const noneSelected = selectedIds.size === 0

  const sprintCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sprints) {
      counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1)
    }
    return counts
  }, [sprints])

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(projects.map((p) => p.id)))
  }

  const handleExport = () => {
    if (noneSelected) return
    setIsExporting(true)
    try {
      const settings = useSettingsStore.getState()
      const storageRef =
        (getStorageMode() === 'cloud' && auth?.currentUser?.uid) || getWorkspaceId()
      const result = exportSelectedProjects(Array.from(selectedIds), {
        projects,
        sprints,
        originRef: originRef || getWorkspaceId(),
        storageRef,
        changeLog,
        exportedBy: settings.exportName || undefined,
        exportedById: settings.exportId || undefined,
      })
      toast.success(
        result.exported === 1
          ? 'Project exported'
          : `${result.exported} projects exported`,
      )
      reportExportCheck(result.json)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Export failed: ${message}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section>
      <h3 className={sectionHeaderClass}>Export Projects</h3>
      <p className={`${descriptionClass} mb-4`}>
        Download selected projects as a portable JSON file. The file can be
        imported into any SPERT Forecaster workspace and merges additively
        without affecting unrelated projects.
      </p>

      {projects.length === 0 ? (
        <p className="text-sm text-spert-text-muted dark:text-gray-400 italic">
          No projects to export.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="exportProjectsSelectAll"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded border-gray-300 dark:border-gray-500 cursor-pointer"
            />
            <span className={labelClass}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </label>

          <div className="border border-spert-border dark:border-gray-600 rounded-md max-h-60 overflow-y-auto">
            {projects.map((project, i) => {
              const count = sprintCounts.get(project.id) ?? 0
              return (
                <label
                  key={project.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    i > 0 ? 'border-t border-spert-border-light dark:border-gray-700' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    name="exportProjectSelection"
                    aria-label={`Select ${project.name} for export`}
                    checked={selectedIds.has(project.id)}
                    onChange={() => toggleProject(project.id)}
                    className="rounded border-gray-300 dark:border-gray-500 cursor-pointer"
                  />
                  <span className="flex-1 text-sm font-medium text-spert-text dark:text-gray-100">
                    {project.name}
                  </span>
                  <span className="text-xs text-spert-text-muted dark:text-gray-400">
                    {count} sprint{count === 1 ? '' : 's'}
                  </span>
                </label>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={noneSelected || isExporting}
            className="px-5 py-2 text-sm font-semibold rounded bg-spert-blue text-white cursor-pointer hover:bg-spert-blue-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-400 dark:disabled:bg-gray-600"
          >
            {isExporting
              ? 'Exporting…'
              : `Export${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          </button>
        </div>
      )}
    </section>
  )
}
