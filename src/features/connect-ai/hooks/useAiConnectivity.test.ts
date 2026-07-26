// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Two things this hook must get exactly right, neither of which the compiler
// can see:
//
//   1. THE SESSION DOCUMENT SHAPE. The Firestore create rule requires nine
//      named keys via hasAll and permits only those nine plus appId via
//      hasOnly. One extra key — aiLastSeenAt is the tempting one, since the
//      server owns it — and the create is rejected with an opaque permission
//      error at pairing time, in production only.
//
//   2. EFFECT B'S CONSENT GATE (RK20, High). firestore.rules grants
//      `allow write: if true` on the snapshot subcollection, because the
//      browser is unauthenticated and the session id IS the capability, so
//      there is nothing to key a tighter rule on. The browser is therefore
//      the ONLY enforcement point: without the gate, turning Read Mode off
//      deletes the snapshot and the next digest change silently re-creates
//      it, serving data whose consent was withdrawn.

import { vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  onSnapshot: vi.fn(() => () => undefined),
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

vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({ data: {} }),
}))

vi.mock('@/shared/firebase/config', () => ({
  db: { __fake: true },
  functionsInstance: { __fake: true },
  isFirebaseAvailable: true,
  auth: null,
}))

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'
import { useAiConnectivity } from './useAiConnectivity'
import { AI_SESSION_ID_KEY, AI_CONSENT_KEY } from '../constants'

const PROJECT_ID = 'p1'

function seedProject() {
  useProjectStore.setState({
    projects: [{
      id: PROJECT_ID,
      name: 'Test',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2 as const,
      firstSprintStartDate: '2026-01-05',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    sprints: [],
    viewingProjectId: PROJECT_ID,
    forecastInputs: { [PROJECT_ID]: { remainingBacklog: '100', velocityMean: '20', velocityStdDev: '4' } },
    burnUpConfigs: {},
  })
  useForecastResultsStore.setState({ record: null, isSimulating: null, viewState: {} })
}

/** The setDoc call that creates the session document, if one was made. */
function sessionCreate() {
  return hoisted.setDoc.mock.calls.find(
    (c) => !String((c[0] as { path: string }).path).includes('snapshot')
  )
}

/** Every setDoc call that writes a snapshot. */
function snapshotWrites() {
  return hoisted.setDoc.mock.calls.filter(
    (c) => String((c[0] as { path: string }).path).includes('snapshot')
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  seedProject()
})

afterEach(() => {
  localStorage.clear()
})

describe('the session document (§6.2)', () => {
  it('carries EXACTLY the ten keys the create rule permits', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(true) })

    const create = sessionCreate()
    expect(create).toBeDefined()
    const keys = Object.keys(create![1] as object).sort()
    expect(keys).toEqual([
      'appId',
      'appVersion',
      'browserConnectedAt',
      'consentRead',
      'consentWrite',
      'createdAt',
      'expiresAt',
      'lastActiveAt',
      'lastSeq',
      'openProductId',
    ])
  })

  it('omits aiLastSeenAt — hasOnly() rejects it', async () => {
    // The MCP server owns that field. Including it here fails the create rule
    // at pairing time, in production only, with a permission error that names
    // nothing useful. It is the single likeliest key to add by mistake,
    // because the session listener READS it to drive the connected indicator.
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(true) })
    const payload = sessionCreate()![1] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('aiLastSeenAt')
  })

  it('creates the session with consentWrite: false, always', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    // Even the Read-Mode-ON path writes consentWrite: false. There is no
    // write consent to grant: the server's assertWriteAllowed refuses every
    // write against such a session regardless of what this client believes.
    await act(async () => { await result.current.startSession(true) })
    const create = sessionCreate()!
    expect((create[1] as Record<string, unknown>).consentWrite).toBe(false)
    expect((create[1] as Record<string, unknown>).appId).toBe('forecaster')
    expect((create[1] as Record<string, unknown>).lastSeq).toBe(0)
  })

  it('never updates consentWrite afterwards', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(true) })
    await act(async () => { await result.current.changePermissions(false) })
    await act(async () => { await result.current.changePermissions(true) })
    for (const call of hoisted.updateDoc.mock.calls) {
      expect(Object.keys(call[1] as object)).not.toContain('consentWrite')
    }
  })
})

describe('Effect B — the browser is the only consent enforcement point', () => {
  it('writes a snapshot when Read Mode is granted', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(true) })
    await waitFor(() => expect(snapshotWrites().length).toBeGreaterThan(0))
  })

  it('writes NO snapshot when Read Mode is declined', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(false) })
    // Let any debounce elapse.
    await act(async () => { await new Promise((r) => setTimeout(r, 2_200)) })
    expect(snapshotWrites()).toHaveLength(0)
  })

  it('deletes the snapshot and stops writing when Read Mode is withdrawn', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(true) })
    await waitFor(() => expect(snapshotWrites().length).toBeGreaterThan(0))

    await act(async () => { await result.current.changePermissions(false) })
    expect(hoisted.deleteDoc).toHaveBeenCalled()
    expect(String((hoisted.deleteDoc.mock.calls[0][0] as { path: string }).path))
      .toContain('snapshot')

    // The session itself SURVIVES: Read Mode off preserves the pairing, so
    // gating the heartbeat on it would reproduce the exact "browser looks
    // disconnected" symptom the heartbeat exists to prevent.
    expect(result.current.sessionState.sessionActive).toBe(true)
    expect(result.current.sessionState.consentRead).toBe(false)

    // A subsequent edit must NOT re-create what consent just withdrew.
    const before = snapshotWrites().length
    act(() => {
      useProjectStore.setState({
        forecastInputs: { [PROJECT_ID]: { remainingBacklog: '250', velocityMean: '20', velocityStdDev: '4' } },
      })
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 2_200)) })
    expect(snapshotWrites().length).toBe(before)
  }, 10_000)
})

describe('teardown', () => {
  it('deletes the snapshot before ending the session, and clears local keys', async () => {
    const { result } = renderHook(() => useAiConnectivity())
    await act(async () => { await result.current.startSession(true) })
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeTruthy()

    await act(async () => { await result.current.stopSession() })

    // deleteDoc runs FIRST and is load-bearing: the snapshot subcollection is
    // `allow write: if true`, so the delete succeeds even after sign-out
    // revokes credentials.
    expect(hoisted.deleteDoc).toHaveBeenCalled()
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeNull()
    expect(localStorage.getItem(AI_CONSENT_KEY)).toBeNull()
    expect(result.current.sessionState.sessionActive).toBe(false)
  })
})
