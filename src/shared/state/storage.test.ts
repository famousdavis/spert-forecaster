// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from 'vitest'
import { getWorkspaceId, appendChangeLogEntry, WORKSPACE_ID_KEY, type ChangeLogEntry } from './storage'
import { CHANGELOG_MAX_ENTRIES } from '@/shared/constants'

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
})

// --- getWorkspaceId ---

describe('getWorkspaceId', () => {
  it('generates and persists a UUID on first call', () => {
    const id = getWorkspaceId()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
    expect(localStorage.getItem(WORKSPACE_ID_KEY)).toBe(id)
  })

  it('returns the same ID on subsequent calls', () => {
    const id1 = getWorkspaceId()
    const id2 = getWorkspaceId()
    expect(id1).toBe(id2)
  })

  it('returns existing ID from localStorage', () => {
    localStorage.setItem(WORKSPACE_ID_KEY, 'pre-existing-id')
    expect(getWorkspaceId()).toBe('pre-existing-id')
  })
})

// --- appendChangeLogEntry ---

describe('appendChangeLogEntry', () => {
  it('appends entry with timestamp', () => {
    const result = appendChangeLogEntry([], { op: 'add', entity: 'project', id: 'x' })
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('add')
    expect(result[0].entity).toBe('project')
    expect(result[0].id).toBe('x')
    expect(result[0].t).toBeGreaterThan(0)
  })

  it('handles empty log array', () => {
    const result = appendChangeLogEntry([], { op: 'add', entity: 'project' })
    expect(result).toHaveLength(1)
  })

  it('preserves existing entries', () => {
    const existing: ChangeLogEntry[] = [{ t: 1000, op: 'add', entity: 'project' }]
    const result = appendChangeLogEntry(existing, { op: 'add', entity: 'sprint', id: 's1' })
    expect(result).toHaveLength(2)
    expect(result[0].op).toBe('add')
    expect(result[0].entity).toBe('project')
    expect(result[1].op).toBe('add')
    expect(result[1].entity).toBe('sprint')
  })

  it('caps at CHANGELOG_MAX_ENTRIES', () => {
    const log: ChangeLogEntry[] = Array.from({ length: CHANGELOG_MAX_ENTRIES }, (_, i) => ({
      t: i,
      op: 'add',
      entity: 'sprint',
      id: `s${i}`,
    }))
    const result = appendChangeLogEntry(log, { op: 'add', entity: 'sprint', id: 'new' })
    expect(result).toHaveLength(CHANGELOG_MAX_ENTRIES)
    expect(result[CHANGELOG_MAX_ENTRIES - 1].id).toBe('new')
    // First entry should be s1 (s0 was dropped)
    expect(result[0].id).toBe('s1')
  })
})
