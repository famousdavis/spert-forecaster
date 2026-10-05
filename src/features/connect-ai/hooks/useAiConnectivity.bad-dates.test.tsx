// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * U1: a bad STORED sprint date must not take down the whole app while Connect
 * AI is publishing (Brief 38 PR C).
 *
 * AiConnectivityProvider sits above every per-tab ErrorBoundary, so a throw
 * while building the snapshot blanked the shell and wrote nothing. This mounts
 * the real provider the way AppShell does (provider > ErrorBoundary > content),
 * with Firestore mocked as useAiConnectivity.test.ts mocks it, and drives the
 * three paths a snapshot is written on: an immediate write after a project
 * switch, the write when a session starts, and the debounced write when a date
 * goes bad mid-session.
 *
 * ⚠️ Imports only modules that existed before PR C, so these rows also run
 * against the earlier tree and go red there per assertion.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  updateDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  getDoc: vi.fn(async (..._args: unknown[]): Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }> =>
    ({ exists: () => false, data: () => undefined })),
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

import { useEffect } from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { AiConnectivityProvider, useAiConnectivityContext } from '@/features/connect-ai/AiConnectivityProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { useProjectStore } from '@/shared/state/project-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import type { Sprint } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const BAD = '20276-09-04'
const REASON = `Sprint 1's saved finish date, "${BAD}", isn't a valid date`

const sprint = (projectId: string, customFinishDate?: string): Sprint => ({
  id: `${projectId}-s1`, projectId, sprintNumber: 1, sprintStartDate: '2026-01-05',
  sprintFinishDate: customFinishDate ?? '2026-01-16', customFinishDate,
  doneValue: 5, includedInForecast: true, createdAt: T, updatedAt: T,
})

/** Two projects, "good" and "bad"; the bad one's only sprint may carry a bad custom date. */
function seed(badDate: string | undefined, viewing: 'good' | 'bad') {
  const project = (id: string, name: string) =>
    ({ id, name, unitOfMeasure: 'points', sprintCadenceWeeks: 2 as const, firstSprintStartDate: '2026-01-05', createdAt: T, updatedAt: T })
  useProjectStore.setState({
    projects: [project('good', 'Good'), project('bad', 'Bad')],
    sprints: [sprint('good'), sprint('bad', badDate)],
    viewingProjectId: viewing,
    forecastInputs: {},
    burnUpConfigs: {},
  })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
}

type StartSession = (consentRead: boolean) => Promise<unknown>
function Shell({ capture }: { capture: (start: StartSession | null) => void }) {
  const ctx = useAiConnectivityContext()
  useEffect(() => { capture(ctx?.startSession ?? null) })
  return <p>shell is alive</p>
}

const uncaught: string[] = []
const onError = (e: ErrorEvent) => { uncaught.push(String(e.error?.message ?? e.message)); e.preventDefault() }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  uncaught.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.addEventListener('error', onError)
})
afterEach(() => {
  window.removeEventListener('error', onError)
  cleanup()
  vi.restoreAllMocks()
})

type SnapshotBody = { results?: { status?: string; statusReason?: string } }
const snapshotWrites = (): SnapshotBody[] =>
  hoisted.setDoc.mock.calls
    .filter((c) => String((c[0] as { path: string }).path).includes('snapshot'))
    .map((c) => (c[1] as { project: SnapshotBody }).project)

async function mountAndStart() {
  let startSession: StartSession | null = null
  render(<AiConnectivityProvider><ErrorBoundary><Shell capture={(start) => { startSession = start }} /></ErrorBoundary></AiConnectivityProvider>)
  await act(async () => { await startSession!(true) })
}
const alive = () => screen.queryByText('shell is alive') !== null
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

describe('U1: a bad stored date never blanks the shell, and the AI is told why', () => {
  it('U1-a immediate: switching to the bad project writes an absent snapshot; the shell stays', async () => {
    seed(BAD, 'good')
    await mountAndStart()
    hoisted.setDoc.mockClear()
    await act(async () => { useProjectStore.setState({ viewingProjectId: 'bad' }) })
    await settle(50)
    expect(alive()).toBe(true)
    const writes = snapshotWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].results?.status).toBe('absent')
    expect(writes[0].results?.statusReason).toContain(REASON)
  })

  it('U1-b session start: a session opened on the bad project writes, naming the sprint', async () => {
    seed(BAD, 'bad')
    await mountAndStart()
    await settle(50)
    expect(alive()).toBe(true)
    expect(uncaught).toEqual([])
    const writes = snapshotWrites()
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.at(-1)?.results?.statusReason).toContain(REASON)
  })

  it('U1-c debounced: a date that goes bad mid-session, with no switch, is written after the debounce', async () => {
    seed(undefined, 'bad')
    await mountAndStart()
    hoisted.setDoc.mockClear()
    await act(async () => { useProjectStore.setState({ sprints: [sprint('good'), sprint('bad', BAD)] }) })
    await settle(2300)
    expect(alive()).toBe(true)
    expect(uncaught).toEqual([])
    const writes = snapshotWrites()
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.at(-1)?.results?.statusReason).toContain(REASON)
  }, 15000)
})
