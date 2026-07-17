// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Mocks (hoisted above the vi.mock factories via the `mock` name prefix) ---
const mockSetDoc = vi.fn()
const mockDeleteFieldSentinel = { __deleteField: true } as Record<string, unknown>

vi.mock('./config', () => ({ db: { __db: true }, auth: null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: vi.fn(),
  deleteField: () => mockDeleteFieldSentinel,
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

import {
  PROJECT_MERGE_FIELDS,
  SETTINGS_MERGE_FIELDS,
  CLEARABLE_PROJECT_FIELDS,
  SAVE_DEBOUNCE_MS,
  saveProject,
  saveSettings,
} from './firestore-driver'
import type { FirestoreProjectDoc, FirestoreSettingsDoc } from './types'

// Runtime documentation of the mergeFields contract (C1/C2).
// Compile-time exhaustiveness is enforced inside firestore-driver.ts by the
// _PROJECT_WRITE_KEYS_GUARD and _SETTINGS_WRITE_KEYS_GUARD literals — these
// runtime asserts complement that with a hard pass/fail signal if either
// constant drifts from the documented contract.

describe('PROJECT_MERGE_FIELDS', () => {
  it('covers all writable FirestoreProjectDoc fields (excluding owner/members)', () => {
    expect(new Set(PROJECT_MERGE_FIELDS)).toEqual(new Set([
      'name', 'unitOfMeasure', 'sprintCadenceWeeks',
      'projectStartDate', 'projectFinishDate', 'firstSprintStartDate',
      'productivityAdjustments', 'milestones', 'sprints',
      'createdAt', 'updatedAt', '_originRef', '_changeLog', 'schemaVersion',
    ]))
  })

  it('does NOT contain owner or members (ACL fields must not be touched by debounced saves)', () => {
    expect(PROJECT_MERGE_FIELDS).not.toContain('owner' as never)
    expect(PROJECT_MERGE_FIELDS).not.toContain('members' as never)
  })

  it('every clearable field is also a merge field', () => {
    for (const field of CLEARABLE_PROJECT_FIELDS) {
      expect(PROJECT_MERGE_FIELDS).toContain(field as never)
    }
  })
})

describe('SETTINGS_MERGE_FIELDS', () => {
  it('covers all FirestoreSettingsDoc fields', () => {
    expect(new Set(SETTINGS_MERGE_FIELDS)).toEqual(new Set([
      'autoRecalculate', 'trialCount', 'defaultChartFontSize',
      'defaultCustomPercentile', 'defaultCustomPercentile2',
      'defaultResultsPercentiles', 'distributionsEnabled',
    ]))
  })
})

// --- mergeFields write contract (the production regression) ---
//
// The Firestore Web SDK throws
//   "Field 'X' is specified in your field mask but missing from your input data"
// when a mergeFields path is absent from the data object. A brand-new project
// created without the optional projectStartDate hit exactly this on its first
// debounced update. These tests assert the invariant the SDK enforces so the
// crash cannot regress even though setDoc is mocked here.

function makeProjectDoc(overrides: Partial<FirestoreProjectDoc> = {}): FirestoreProjectDoc {
  return {
    name: 'P',
    unitOfMeasure: 'points',
    productivityAdjustments: [],
    milestones: [],
    sprints: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    owner: 'u1',
    members: {},
    _originRef: 'ws-1',
    _changeLog: [],
    schemaVersion: 1,
    ...overrides,
  } as FirestoreProjectDoc
}

async function flushDebounce() {
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
}

describe('saveProject → setDoc({ mergeFields }) write', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSetDoc.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('never lists a mask field that is absent from the payload (regression: projectStartDate crash)', async () => {
    // New project: optional scalars (projectStartDate/projectFinishDate/…) unset.
    saveProject('p1', makeProjectDoc())
    await flushDebounce()

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, payload, options] = mockSetDoc.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      { mergeFields: string[] },
    ]
    for (const field of options.mergeFields) {
      expect(payload).toHaveProperty(field)
    }
  })

  it('re-adds a cleared optional scalar as deleteField() so it is removed server-side, not resurrected', async () => {
    saveProject('p1', makeProjectDoc()) // projectStartDate + firstSprintStartDate absent
    await flushDebounce()

    const [, payload, options] = mockSetDoc.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      { mergeFields: string[] },
    ]
    expect(payload.projectStartDate).toBe(mockDeleteFieldSentinel)
    expect(payload.firstSprintStartDate).toBe(mockDeleteFieldSentinel)
    expect(payload.sprintCadenceWeeks).toBe(mockDeleteFieldSentinel)
    // Still in the mask so the server-side delete actually happens.
    expect(options.mergeFields).toContain('projectStartDate')
    expect(options.mergeFields).toContain('firstSprintStartDate')
  })

  it('writes present optional scalars as their value, not a delete sentinel', async () => {
    saveProject('p1', makeProjectDoc({
      projectStartDate: '2026-02-01',
      firstSprintStartDate: '2026-02-03',
      sprintCadenceWeeks: 2,
    }))
    await flushDebounce()

    const [, payload] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>, unknown]
    expect(payload.projectStartDate).toBe('2026-02-01')
    expect(payload.firstSprintStartDate).toBe('2026-02-03')
    expect(payload.sprintCadenceWeeks).toBe(2)
  })

  it('never writes owner/members from the debounced save path', async () => {
    saveProject('p1', makeProjectDoc({ owner: 'u1', members: { u2: 'editor' } }))
    await flushDebounce()

    const [, payload, options] = mockSetDoc.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      { mergeFields: string[] },
    ]
    expect(payload).not.toHaveProperty('owner')
    expect(payload).not.toHaveProperty('members')
    expect(options.mergeFields).not.toContain('owner')
    expect(options.mergeFields).not.toContain('members')
  })
})

describe('saveSettings → setDoc({ mergeFields }) write', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSetDoc.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('every mask field is present in the payload', async () => {
    const settings: FirestoreSettingsDoc = {
      autoRecalculate: true,
      trialCount: 10000,
      defaultChartFontSize: 'medium',
      defaultCustomPercentile: 85,
      defaultCustomPercentile2: 50,
      defaultResultsPercentiles: [50, 60, 70, 80, 90],
      distributionsEnabled: ['lognormal'],
    }
    saveSettings('u1', settings)
    await flushDebounce()

    const [, payload, options] = mockSetDoc.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      { mergeFields: string[] },
    ]
    for (const field of options.mergeFields) {
      expect(payload).toHaveProperty(field)
    }
  })
})
