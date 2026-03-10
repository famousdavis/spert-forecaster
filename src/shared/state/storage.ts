// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// localStorage abstraction for Zustand persistence

import { CHANGELOG_MAX_ENTRIES } from '@/shared/constants'

const STORAGE_KEY = 'spert-data'
export const WORKSPACE_ID_KEY = 'spert-workspace-id'

export interface StorageData {
  projects: unknown[]
  sprints: unknown[]
  version: string
}

export const storage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(name)
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(name, value)
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(name)
  },
}

// Workspace identity — generated once per browser, persists across sessions
export function getWorkspaceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(WORKSPACE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(WORKSPACE_ID_KEY, id)
  }
  return id
}

// Structural operation log entry for export pipeline diagnostics
export interface ChangeLogEntry {
  t: number       // Unix timestamp in seconds
  op: string      // 'add' | 'delete' | 'import' | 'merge-import'
  entity: string  // 'project' | 'sprint' | 'adjustment' | 'milestone' | 'dataset'
  id?: string
  count?: number
  source?: string
}

// Append an entry to a changelog, capping at max size
export function appendChangeLogEntry(
  log: ChangeLogEntry[],
  entry: Omit<ChangeLogEntry, 't'>
): ChangeLogEntry[] {
  const updated = [...log, { ...entry, t: Math.floor(Date.now() / 1000) }]
  return updated.length > CHANGELOG_MAX_ENTRIES
    ? updated.slice(updated.length - CHANGELOG_MAX_ENTRIES)
    : updated
}

export const STORAGE_MODE_KEY = 'spert-storage-mode'

export function getStorageMode(): 'local' | 'cloud' {
  if (typeof window === 'undefined') return 'local'
  return (localStorage.getItem(STORAGE_MODE_KEY) as 'local' | 'cloud') || 'local'
}

export { STORAGE_KEY }
