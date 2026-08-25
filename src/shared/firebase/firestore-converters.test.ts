// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { projectToFirestoreDoc, firestoreDocToProject, firestoreDocToSprints, settingsToFirestoreDoc, firestoreDocToSettings } from './firestore-converters'
import type { Project, Sprint } from '@/shared/types'
import type { FirestoreProjectDoc, FirestoreSettingsDoc } from './types'

const mockProject: Project = {
  id: 'p1',
  name: 'Test Project',
  unitOfMeasure: 'story points',
  sprintCadenceWeeks: 2,
  projectStartDate: '2024-01-01',
  firstSprintStartDate: '2024-01-15',
  productivityAdjustments: [],
  milestones: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const mockSprints: Sprint[] = [
  {
    id: 's1',
    projectId: 'p1',
    sprintNumber: 1,
    sprintStartDate: '2024-01-15',
    sprintFinishDate: '2024-01-26',
    doneValue: 21,
    includedInForecast: true,
    createdAt: '2024-01-26T00:00:00Z',
    updatedAt: '2024-01-26T00:00:00Z',
  },
  {
    id: 's2',
    projectId: 'p2', // Different project
    sprintNumber: 1,
    sprintStartDate: '2024-01-15',
    sprintFinishDate: '2024-01-26',
    doneValue: 15,
    includedInForecast: true,
    createdAt: '2024-01-26T00:00:00Z',
    updatedAt: '2024-01-26T00:00:00Z',
  },
]

describe('projectToFirestoreDoc', () => {
  it('creates a Firestore document with denormalized sprints', () => {
    const doc = projectToFirestoreDoc(mockProject, mockSprints, 'uid123')
    expect(doc.name).toBe('Test Project')
    expect(doc.owner).toBe('uid123')
    expect(doc.members).toEqual({})
    expect(doc.sprints).toHaveLength(1) // Only p1's sprint
    expect(doc.sprints[0].id).toBe('s1')
    expect(doc.schemaVersion).toBe(1)
  })

  it('preserves existing owner/members when provided', () => {
    const existing = { owner: 'original-owner', members: { uid456: 'editor' as const } }
    const doc = projectToFirestoreDoc(mockProject, mockSprints, 'uid123', existing)
    expect(doc.owner).toBe('original-owner')
    expect(doc.members).toEqual({ uid456: 'editor' })
  })

  it('includes originRef and changeLog', () => {
    const doc = projectToFirestoreDoc(mockProject, mockSprints, 'uid123', undefined, 'origin-123', [
      { t: 1000, op: 'add', entity: 'project', id: 'p1' },
    ])
    expect(doc._originRef).toBe('origin-123')
    expect(doc._changeLog).toHaveLength(1)
  })
})

describe('firestoreDocToProject', () => {
  it('converts Firestore document to Project type', () => {
    const doc: FirestoreProjectDoc = {
      name: 'Cloud Project',
      unitOfMeasure: 'hours',
      sprintCadenceWeeks: 1,
      sprints: [],
      productivityAdjustments: [],
      milestones: [],
      createdAt: '2024-06-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
      owner: 'uid123',
      members: {},
      schemaVersion: 1,
    }

    const project = firestoreDocToProject('doc-id', doc)
    expect(project.id).toBe('doc-id')
    expect(project.name).toBe('Cloud Project')
    expect(project.unitOfMeasure).toBe('hours')
    expect((project as unknown as Record<string, unknown>).owner).toBeUndefined()
    expect((project as unknown as Record<string, unknown>).members).toBeUndefined()
  })
})

describe('firestoreDocToSprints', () => {
  it('extracts sprints from Firestore doc', () => {
    const doc: FirestoreProjectDoc = {
      name: 'Test',
      unitOfMeasure: 'sp',
      sprints: mockSprints.slice(0, 1),
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      owner: 'uid',
      members: {},
      schemaVersion: 1,
    }
    expect(firestoreDocToSprints(doc)).toHaveLength(1)
  })

  it('returns empty array when no sprints', () => {
    const doc = { sprints: undefined } as unknown as FirestoreProjectDoc
    expect(firestoreDocToSprints(doc)).toEqual([])
  })
})

describe('settingsToFirestoreDoc / firestoreDocToSettings', () => {
  it('round-trips settings', () => {
    const settings = {
      autoRecalculate: true,
      trialCount: 10000,
      defaultChartFontSize: 'medium',
      defaultCustomPercentile: 85,
      defaultCustomPercentile2: 50,
      defaultResultsPercentiles: [50, 70, 80, 90],
      distributionsEnabled: ['truncatedNormal', 'lognormal'] as const,
    }
    const doc = settingsToFirestoreDoc({
      ...settings,
      distributionsEnabled: [...settings.distributionsEnabled],
    })
    const restored = firestoreDocToSettings(doc)
    expect(restored.autoRecalculate).toBe(true)
    expect(restored.trialCount).toBe(10000)
    expect(restored.defaultChartFontSize).toBe('medium')
    expect(restored.defaultCustomPercentile).toBe(85)
    expect(restored.defaultResultsPercentiles).toEqual([50, 70, 80, 90])
    expect(restored.distributionsEnabled).toEqual(['truncatedNormal', 'lognormal'])
  })

  describe('distributionsEnabled defensive coercion', () => {
    const baseDoc: FirestoreSettingsDoc = {
      autoRecalculate: true,
      trialCount: 10000,
      defaultChartFontSize: 'medium',
      defaultCustomPercentile: 85,
      defaultCustomPercentile2: 50,
      defaultResultsPercentiles: [50, 80],
    }

    it("coerces missing field to ['lognormal']", () => {
      const restored = firestoreDocToSettings(baseDoc)
      expect(restored.distributionsEnabled).toEqual(['lognormal'])
    })

    it("coerces empty array to ['lognormal']", () => {
      const restored = firestoreDocToSettings({ ...baseDoc, distributionsEnabled: [] })
      expect(restored.distributionsEnabled).toEqual(['lognormal'])
    })

    it("coerces non-array values to ['lognormal']", () => {
      const corrupted = { ...baseDoc, distributionsEnabled: 'truncatedNormal' as unknown as string[] }
      const restored = firestoreDocToSettings(corrupted)
      expect(restored.distributionsEnabled).toEqual(['lognormal'])
    })

    it('filters out unknown distribution keys', () => {
      const restored = firestoreDocToSettings({
        ...baseDoc,
        distributionsEnabled: ['truncatedNormal', 'someFutureDist', 'lognormal'],
      })
      expect(restored.distributionsEnabled).toEqual(['truncatedNormal', 'lognormal'])
    })

    it("falls back when filter result is empty after removing invalid entries", () => {
      const restored = firestoreDocToSettings({
        ...baseDoc,
        distributionsEnabled: ['unknownA', 'unknownB'],
      })
      expect(restored.distributionsEnabled).toEqual(['lognormal'])
    })

    it('preserves valid array with all six distributions', () => {
      const restored = firestoreDocToSettings({
        ...baseDoc,
        distributionsEnabled: [
          'truncatedNormal',
          'lognormal',
          'gamma',
          'bootstrap',
          'triangular',
          'uniform',
        ],
      })
      expect(restored.distributionsEnabled).toEqual([
        'truncatedNormal',
        'lognormal',
        'gamma',
        'bootstrap',
        'triangular',
        'uniform',
      ])
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PC-1f (Brief 19) — Forecaster is a PRODUCER of the corrupt shape.
//
// It has no render site, so a read-side assertion proves nothing here. The
// defect is the WRITE-BACK: `projectToFirestoreDoc:40` passes through whatever
// the store holds, and `sanitizeForFirestore` rebuilds a Timestamp via
// Object.entries into a plain {seconds,nanoseconds} map. So the assertion runs
// read -> write and inspects what would reach Firestore.
//
// ⚠️ TWO STEPS, NOT THREE. `sanitizeForFirestore` is called INSIDE
// `projectToFirestoreDoc` (firestore-converters.ts:29) and wraps its whole
// return. Calling it again on the result double-sanitizes and tests nothing.
//
// ⚠️ THE ASSERTION PINS VALUES, NOT A TYPE. "an ISO string in every case" is a
// type predicate and it fails twice: it passes on an implementation that stamps
// `new Date().toISOString()` on read — destroying every real historical instant
// — and it is unreachable for the no-instant shapes, which have no instant to
// encode. Rows 1-5 pin the exact ISO of one fixed instant; rows 6-8 pin the
// FIELD'S ABSENCE from the payload.
//
// ⚠️ ABSENT, NOT NULL. `sanitizeForFirestore` strips `undefined` only (:15);
// `null` passes through with the key present. Normalizing to `null` is the
// tempting choice — the admin-tool reference returns `millis: null` — and it
// would write a null into the document. That is what the `not.toBeNull` and
// `'updatedAt' in payload` assertions below exist to catch.
//
// Downstream of a stripped `updatedAt`, both behaviours are "leave and log":
// the debounced save's mask is `mergeFields.filter(f => f in payload)`, so a
// stripped NON-clearable field simply drops out of the mask and the stored
// value is untouched (`updatedAt` is NOT in CLEARABLE_PROJECT_FIELDS, so it is
// never substituted with deleteField()); only `saveProjectImmediate`, a full
// setDoc, removes it.
// ─────────────────────────────────────────────────────────────────────────────
describe('updatedAt normalisation, read -> write (PC-1f)', () => {
  const EPOCH_MS = Date.UTC(2026, 7, 23, 12, 0, 0)
  const EXPECTED_ISO = '2026-08-23T12:00:00.000Z'

  const baseDoc: FirestoreProjectDoc = {
    name: 'Cloud Project',
    unitOfMeasure: 'hours',
    sprintCadenceWeeks: 1,
    sprints: [],
    productivityAdjustments: [],
    milestones: [],
    createdAt: '2024-06-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    owner: 'uid123',
    members: {},
    schemaVersion: 1,
  }

  function readThenWrite(storedUpdatedAt: unknown): Record<string, unknown> {
    const doc = {
      ...baseDoc,
      updatedAt: storedUpdatedAt,
    } as unknown as FirestoreProjectDoc
    const project = firestoreDocToProject('p1', doc)
    return projectToFirestoreDoc(project, [], 'uid-1') as unknown as Record<string, unknown>
  }

  const RECOVERS_THE_INSTANT: [string, unknown][] = [
    ['1 ISO string Date.parse accepts', EXPECTED_ISO],
    ['2 number millis', EPOCH_MS],
    ['3 client Timestamp (has toDate)', { toDate: () => new Date(EPOCH_MS) }],
    // Row 4 is the shape THIS repo manufactures, via sanitizeForFirestore's
    // Object.entries rebuild of a Timestamp. Discarding it would throw away the
    // true update time of exactly the documents a later migration must fix.
    ['4 {seconds,nanoseconds}', { seconds: EPOCH_MS / 1000, nanoseconds: 0 }],
    ['5 {_seconds,_nanoseconds}', { _seconds: EPOCH_MS / 1000, _nanoseconds: 0 }],
  ]

  const NO_RECOVERABLE_INSTANT: [string, unknown][] = [
    ['6 unresolved serverTimestamp sentinel', { _methodName: 'serverTimestamp' }],
    ['7 undefined', undefined],
    ['8a string Date.parse rejects', 'not-a-date'],
    ['8b empty string', ''],
  ]

  it.each(RECOVERS_THE_INSTANT)('%s -> writes the ISO of THAT instant', (_label, shape) => {
    const payload = readThenWrite(shape)
    expect(payload.updatedAt).toBe(EXPECTED_ISO)
  })

  it.each(NO_RECOVERABLE_INSTANT)('%s -> the field is absent from the payload', (_label, shape) => {
    const payload = readThenWrite(shape)
    expect('updatedAt' in payload).toBe(false)
    expect(payload.updatedAt).toBeUndefined()
    expect(payload.updatedAt).not.toBeNull()
  })

  it.each(NO_RECOVERABLE_INSTANT)('%s -> LOGS the case (leave and log, never stamp)', (_label, shape) => {
    // "Leave and log" is half a ruling if only the leaving is implemented.
    // Forecaster has no render site, so without this the drop is invisible.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      readThenWrite(shape)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('updatedAt')
    } finally {
      warn.mockRestore()
    }
  })

  it.each(RECOVERS_THE_INSTANT)('%s -> does NOT log', (_label, shape) => {
    // The control for the assertion above: a logger that fired unconditionally
    // would satisfy it while telling nobody anything.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      readThenWrite(shape)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('never stamps a fresh date on read — a real instant survives untouched', () => {
    // The failure mode a type predicate cannot see: stamping
    // `new Date().toISOString()` satisfies "it is an ISO string" for every
    // shape while obliterating every historical instant.
    const payload = readThenWrite(EXPECTED_ISO)
    expect(payload.updatedAt).toBe(EXPECTED_ISO)
    expect(payload.updatedAt).not.toBe(new Date().toISOString().slice(0, 10))
    expect(String(payload.updatedAt).startsWith('2026-08-23')).toBe(true)
  })

  it('never falls back to createdAt', () => {
    const doc = {
      ...baseDoc,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: { _methodName: 'serverTimestamp' },
    } as unknown as FirestoreProjectDoc
    const payload = projectToFirestoreDoc(
      firestoreDocToProject('p1', doc), [], 'uid-1',
    ) as unknown as Record<string, unknown>
    expect(payload.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect('updatedAt' in payload).toBe(false)
  })
})
