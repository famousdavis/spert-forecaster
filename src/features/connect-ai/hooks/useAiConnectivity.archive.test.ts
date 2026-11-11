// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.50.0: Connect AI follows the same archive-aware viewed project as Sprint History and Forecast
// (B52): the session's open project is the viewed one if it is unarchived, else the first
// unarchived; archiving the viewed project moves it (the hook re-renders on the map, not only on
// the projects); with every project archived there is nothing to start a session on.

import { vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  updateDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  getDoc: vi.fn(async (..._args: unknown[]): Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }> => ({
    exists: () => false,
    data: () => undefined,
  })),
  onSnapshot: vi.fn((..._args: unknown[]) => () => undefined),
}))

vi.mock('firebase/firestore', () => ({
  doc: (...path: unknown[]) => ({ path: path.slice(1).join('/') }),
  collection: (...path: unknown[]) => ({ path: path.slice(1).join('/') }),
  setDoc: hoisted.setDoc,
  updateDoc: hoisted.updateDoc,
  deleteDoc: hoisted.deleteDoc,
  getDoc: hoisted.getDoc,
  onSnapshot: hoisted.onSnapshot,
  serverTimestamp: () => '__serverTimestamp__',
}))
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }))
vi.mock('@/shared/firebase/config', () => ({ db: { __fake: true }, functionsInstance: { __fake: true }, isFirebaseAvailable: true, auth: null }))

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import { useAiConnectivity } from './useAiConnectivity'
import type { ProjectPrefs } from '@/shared/lib/project-prefs'

const project = (id: string) => ({
  id,
  name: `Project ${id}`,
  unitOfMeasure: 'points',
  sprintCadenceWeeks: 2 as const,
  firstSprintStartDate: '2026-01-05',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

function seed(viewing: string, prefs: ProjectPrefs) {
  useProjectStore.setState({ projects: ['p1', 'p2', 'p3'].map(project), sprints: [], viewingProjectId: viewing, forecastInputs: {}, burnUpConfigs: {} })
  useSettingsStore.setState({ projectPrefs: prefs })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
}
const sessionCreate = () => hoisted.setDoc.mock.calls.find((c) => !String((c[0] as { path: string }).path).includes('snapshot'))
const openProductIds = () =>
  hoisted.updateDoc.mock.calls.map((c) => (c[1] as { openProductId?: string }).openProductId).filter((v) => v !== undefined)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => localStorage.clear())

describe('Connect AI and archive', () => {
  it('a session starts on the first UNARCHIVED project when the viewed one is archived', async () => {
    seed('p1', { p1: { archived: true } })
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => {
      expect(await result.current.startSession(false)).toBe(true)
    })
    expect((sessionCreate()![1] as { openProductId: string }).openProductId).toBe('p2')
  })

  it('archiving the viewed project moves the session to the next unarchived one (the hook re-renders on the map)', async () => {
    seed('p1', {})
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => {
      await result.current.startSession(false)
    })
    expect((sessionCreate()![1] as { openProductId: string }).openProductId).toBe('p1')
    hoisted.updateDoc.mockClear()
    await act(async () => {
      useSettingsStore.getState().setProjectArchived('p1', true)
    })
    expect(openProductIds()).toContain('p2')
    // Unarchiving brings the selection back: viewingProjectId itself was never rewritten.
    hoisted.updateDoc.mockClear()
    await act(async () => {
      useSettingsStore.getState().setProjectArchived('p1', false)
    })
    expect(openProductIds()).toContain('p1')
    expect(useProjectStore.getState().viewingProjectId).toBe('p1')
  })

  it('with every project archived there is no project to start on: refused, nothing written', async () => {
    seed('p1', { p1: { archived: true }, p2: { archived: true }, p3: { archived: true } })
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => {
      expect(await result.current.startSession(false)).toBe(false)
    })
    expect(sessionCreate()).toBeUndefined()
  })
})
