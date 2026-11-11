// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The per-entry cloud write of tile colours and archives (v0.50.0), against a fake that honours
// `mergeFields` as the real Web SDK does (`__fakes__/mergefields-firestore.ts`): only masked
// fields change, an absent masked field throws, deleteField() is known by identity and only
// inside the mask. Also: the fake's own sentinel rule, the ordinary settings save leaving the map
// alone, and the converter's `{}`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import('./__fakes__/mergefields-firestore').createMergeFieldsFirestore> }))

vi.mock('./config', () => ({ db: { __db: true }, auth: null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('firebase/firestore', async () => {
  const { createMergeFieldsFirestore } = await import('./__fakes__/mergefields-firestore')
  fake.current = createMergeFieldsFirestore()
  return {
    collection: vi.fn(),
    doc: (...args: [unknown, string, string]) => fake.current.doc(...args),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    getDocsFromServer: vi.fn(),
    setDoc: (...args: Parameters<typeof fake.current.setDoc>) => fake.current.setDoc(...args),
    deleteDoc: vi.fn(),
    deleteField: () => fake.current.deleteField(),
    FieldPath: (await import('./__fakes__/mergefields-firestore')).FakeFieldPath,
    onSnapshot: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
  }
})

import {
  SAVE_DEBOUNCE_MS,
  buildProjectPrefsWrite,
  cancelPendingSaves,
  flushPendingSaves,
  saveProjectPrefs,
  saveSettings,
  uploadProjectPrefs,
} from './firestore-driver'
import { firestoreDocToSettings } from './firestore-converters'
import type { FirestoreSettingsDoc } from './types'
import type { ProjectPrefs } from '@/shared/lib/project-prefs'
import { FakeFieldPath } from './__fakes__/mergefields-firestore'

const SETTINGS_PATH = 'spertforecaster_settings/u1'
const stored = () => fake.current.docs.get(SETTINGS_PATH) as Record<string, unknown> | undefined
const storedPrefs = () => (stored()?.projectPrefs ?? {}) as Record<string, Record<string, unknown>>
let prefs: ProjectPrefs = {}
const readPrefs = () => prefs
const tick = () => vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 1)

const SEVEN: FirestoreSettingsDoc = {
  autoRecalculate: true,
  trialCount: 10000,
  defaultChartFontSize: 'medium',
  defaultCustomPercentile: 85,
  defaultCustomPercentile2: 50,
  defaultResultsPercentiles: [50, 80],
  distributionsEnabled: ['lognormal'],
}

beforeEach(() => {
  vi.useFakeTimers()
  cancelPendingSaves()
  fake.current.reset()
  prefs = {}
})
afterEach(() => {
  cancelPendingSaves()
  vi.useRealTimers()
})

describe('the fake itself (so a test against it means what it says)', () => {
  it('throws on a masked field absent from the data', async () => {
    await expect(fake.current.setDoc({ path: 'x/1' }, {}, { mergeFields: [new FakeFieldPath('a', 'b')] })).rejects.toThrow(
      /missing from your input data/,
    )
  })

  it('deletes with the real sentinel inside the mask, and does nothing with one outside it', async () => {
    fake.current.docs.set('x/1', { a: { b: 1, c: 2 }, d: 3 })
    await fake.current.setDoc({ path: 'x/1' }, { a: { b: fake.current.deleteField() }, d: fake.current.deleteField() }, {
      mergeFields: [new FakeFieldPath('a', 'b')],
    })
    expect(fake.current.docs.get('x/1')).toEqual({ a: { c: 2 }, d: 3 })
  })

  it('REFUSES a plain object shaped like the sentinel: it is stored as a map, as the SDK stores it', async () => {
    fake.current.docs.set('x/1', { a: { b: 1 } })
    const lookalike = { ...fake.current.deleteField() }
    await fake.current.setDoc({ path: 'x/1' }, { a: { b: lookalike } }, { mergeFields: [new FakeFieldPath('a', 'b')] })
    expect(fake.current.docs.get('x/1')).toEqual({ a: { b: { _methodName: 'deleteField' } } })
  })

  it('changes only masked fields', async () => {
    fake.current.docs.set('x/1', { a: 1, b: 2 })
    await fake.current.setDoc({ path: 'x/1' }, { a: 10, b: 20 }, { mergeFields: ['a'] })
    expect(fake.current.docs.get('x/1')).toEqual({ a: 10, b: 2 })
  })
})

describe('saveProjectPrefs: one FieldPath per (id, field), deleteField() to clear', () => {
  it('sets a colour, changes it, and clears it, leaving the other field and other entries alone', async () => {
    fake.current.docs.set(SETTINGS_PATH, { ...SEVEN, projectPrefs: { p1: { archived: true }, other: { color: 'pink' } } })
    prefs = { p1: { color: 'blue', archived: true } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'color' }], readPrefs)
    await tick()
    expect(storedPrefs()).toEqual({ p1: { color: 'blue', archived: true }, other: { color: 'pink' } })

    prefs = { p1: { color: 'teal', archived: true } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'color' }], readPrefs)
    await tick()
    expect(storedPrefs().p1).toEqual({ color: 'teal', archived: true })

    prefs = { p1: { archived: true } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'color' }], readPrefs)
    await tick()
    expect(storedPrefs()).toEqual({ p1: { archived: true }, other: { color: 'pink' } })
    // The seven ordinary fields were never touched.
    expect(stored()?.trialCount).toBe(10000)
  })

  it('sets archive and clears it', async () => {
    prefs = { p1: { archived: true } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'archived' }], readPrefs)
    await tick()
    expect(storedPrefs()).toEqual({ p1: { archived: true } })
    prefs = {}
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'archived' }], readPrefs)
    await tick()
    expect(storedPrefs().p1 ?? {}).toEqual({})
  })

  it('coalesces two changes into ONE write, with the values as they are when the timer fires', async () => {
    prefs = { p1: { color: 'blue' } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'color' }], readPrefs)
    prefs = { p1: { color: 'pink' }, p2: { archived: true } }
    saveProjectPrefs('u1', [{ projectId: 'p2', field: 'archived' }], readPrefs)
    await tick()
    expect(fake.current.writes).toHaveLength(1)
    expect(fake.current.writes[0].mask).toEqual([
      ['projectPrefs', 'p1', 'color'],
      ['projectPrefs', 'p2', 'archived'],
    ])
    expect(storedPrefs()).toEqual({ p1: { color: 'pink' }, p2: { archived: true } })
  })

  it('change → cancelPendingSaves → change writes ONLY the second (the buffer is emptied too)', async () => {
    prefs = { a: { color: 'blue' }, b: { color: 'teal' } }
    saveProjectPrefs('u1', [{ projectId: 'a', field: 'color' }], readPrefs)
    cancelPendingSaves()
    saveProjectPrefs('u1', [{ projectId: 'b', field: 'color' }], readPrefs)
    await tick()
    expect(fake.current.writes).toHaveLength(1)
    expect(fake.current.writes[0].mask).toEqual([['projectPrefs', 'b', 'color']])
    expect(storedPrefs()).toEqual({ b: { color: 'teal' } })
  })

  it('MUST-DIFFER: change → change, with no cancel, writes both', async () => {
    prefs = { a: { color: 'blue' }, b: { color: 'teal' } }
    saveProjectPrefs('u1', [{ projectId: 'a', field: 'color' }], readPrefs)
    saveProjectPrefs('u1', [{ projectId: 'b', field: 'color' }], readPrefs)
    await tick()
    expect(storedPrefs()).toEqual({ a: { color: 'blue' }, b: { color: 'teal' } })
  })

  it('flushPendingSaves sends a waiting change at once (the unload flush)', async () => {
    prefs = { p1: { color: 'slate' } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'color' }], readPrefs)
    flushPendingSaves()
    await vi.advanceTimersByTimeAsync(0)
    expect(storedPrefs()).toEqual({ p1: { color: 'slate' } })
  })

  it('does not share the settings debounce key: a settings save and a prefs save in one window both land', async () => {
    fake.current.docs.set(SETTINGS_PATH, { ...SEVEN })
    prefs = { p1: { color: 'blue' } }
    saveProjectPrefs('u1', [{ projectId: 'p1', field: 'color' }], readPrefs)
    saveSettings('u1', { ...SEVEN, trialCount: 25000 })
    await tick()
    expect(stored()?.trialCount).toBe(25000)
    expect(storedPrefs()).toEqual({ p1: { color: 'blue' } })
  })

  it("the payload's clear value is the very object deleteField() returned", () => {
    const spy = vi.spyOn(fake.current, 'deleteField')
    const { payload } = buildProjectPrefsWrite([{ projectId: 'p1', field: 'color' }], {})
    expect(spy).toHaveBeenCalledTimes(1)
    expect(payload.projectPrefs.p1.color).toBe(spy.mock.results[0].value)
  })

  it('a project id such as hasOwnProperty builds its own entry, not an inherited member', () => {
    const { payload, mask } = buildProjectPrefsWrite([{ projectId: 'hasOwnProperty', field: 'color' }], {
      hasOwnProperty: { color: 'teal' },
    } as ProjectPrefs)
    expect(Object.prototype.hasOwnProperty.call(payload.projectPrefs, 'hasOwnProperty')).toBe(true)
    expect(payload.projectPrefs.hasOwnProperty).toEqual({ color: 'teal' })
    expect((mask[0] as unknown as FakeFieldPath).segments).toEqual(['projectPrefs', 'hasOwnProperty', 'color'])
  })

  it('an unsafe key never reaches the payload or the mask', () => {
    const { payload, mask } = buildProjectPrefsWrite([{ projectId: '__x__', field: 'color' }], {})
    expect(payload.projectPrefs).toEqual({})
    expect(mask).toEqual([])
  })
})

describe('the ordinary settings save never touches the map', () => {
  it('saveSettings writes the seven fields and leaves projectPrefs as stored, even when its data carries a map', async () => {
    fake.current.docs.set(SETTINGS_PATH, { ...SEVEN, projectPrefs: { p1: { color: 'teal', archived: true } } })
    // settingsToFirestoreDoc never puts the map in; a data object that did must still not reach
    // the document, because projectPrefs is not in SETTINGS_MERGE_FIELDS.
    saveSettings('u1', { ...SEVEN, trialCount: 5000, projectPrefs: { p1: {}, p9: { color: 'blue' } } })
    await tick()
    expect(stored()?.trialCount).toBe(5000)
    expect(storedPrefs()).toEqual({ p1: { color: 'teal', archived: true } })
  })
})

describe('uploadProjectPrefs: immediate, both fields masked per entry', () => {
  it('writes each entry, clears a field the entry lacks, and leaves every other cloud entry alone', async () => {
    fake.current.docs.set(SETTINGS_PATH, {
      ...SEVEN,
      projectPrefs: { up1: { color: 'pink', archived: true }, up2: { archived: true }, cloudOnly: { color: 'slate' } },
    })
    await uploadProjectPrefs('u1', [
      { projectId: 'up1', pref: { color: 'teal' } },
      { projectId: 'up2', pref: {} },
    ])
    expect(fake.current.writes).toHaveLength(1)
    expect(storedPrefs()).toEqual({ up1: { color: 'teal' }, up2: {}, cloudOnly: { color: 'slate' } })
  })

  it('throws when the write is refused', async () => {
    fake.current.refuseWhen(() => new Error('permission-denied'))
    await expect(uploadProjectPrefs('u1', [{ projectId: 'p', pref: { color: 'blue' } }])).rejects.toThrow('permission-denied')
  })

  it('writes nothing for no entries', async () => {
    await uploadProjectPrefs('u1', [])
    expect(fake.current.writes).toHaveLength(0)
  })
})

describe('firestoreDocToSettings: projectPrefs is always a sanitised map', () => {
  it.each([
    ['absent', undefined],
    ['not an object', 'blue'],
    ['a list', [{ color: 'blue' }]],
    ['only bad entries', { p1: { color: 'red' }, __x__: { archived: true } }],
  ])('%s → {}', (_label, raw) => {
    expect(firestoreDocToSettings({ ...SEVEN, projectPrefs: raw as never }).projectPrefs).toEqual({})
  })

  it('keeps good entries and drops the rest', () => {
    const projectPrefs = { p1: { color: 'teal' }, p2: {}, p3: { archived: true, color: 'red' } } as never
    expect(firestoreDocToSettings({ ...SEVEN, projectPrefs }).projectPrefs).toEqual({ p1: { color: 'teal' }, p3: { archived: true } })
  })
})
