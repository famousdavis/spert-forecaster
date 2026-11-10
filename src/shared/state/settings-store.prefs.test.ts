// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The settings store's tile colour and archive map (v0.50.0): each setter's return value and the
// per-entry change it emits (never `settings:save`), nothing emitted under `_isCloudUpdate`, the
// clear and the cloud replace emitting nothing, Clone, Delete and the D36 move, and the map
// sanitised when `spert-settings` is rehydrated with every other persisted setting kept.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSettingsStore } from './settings-store'
import { syncBus } from '@/shared/firebase/sync-bus'
import type { SyncEvent } from '@/shared/firebase/types'
import { MAX_PROJECT_PREFS, type ProjectPrefs } from '@/shared/lib/project-prefs'

let emitted: SyncEvent[] = []
const store = () => useSettingsStore.getState()
const seed = (projectPrefs: ProjectPrefs) => useSettingsStore.setState({ projectPrefs, _isCloudUpdate: false })

beforeEach(() => {
  emitted = []
  vi.spyOn(syncBus, 'emit').mockImplementation((ev: SyncEvent) => {
    emitted.push(ev)
  })
  seed({})
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const CLOUD_SETTINGS = {
  autoRecalculate: true,
  trialCount: 10000 as const,
  defaultChartFontSize: 'medium' as const,
  defaultCustomPercentile: 85,
  defaultCustomPercentile2: 50,
  defaultResultsPercentiles: [50, 80],
  distributionsEnabled: ['lognormal' as const],
}

describe('setProjectColor', () => {
  it.each(['blue', 'teal', 'slate', 'purple', 'pink'] as const)('sets %s, returns true, and emits that one field', (color) => {
    expect(store().setProjectColor('p1', color)).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { color } })
    expect(emitted).toEqual([{ type: 'prefs:save', changes: [{ projectId: 'p1', field: 'color' }] }])
  })

  it('changes a colour and keeps the archive; clears it with null, keeping the archive', () => {
    seed({ p1: { color: 'teal', archived: true }, p2: { color: 'pink' } })
    expect(store().setProjectColor('p1', 'purple')).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { color: 'purple', archived: true }, p2: { color: 'pink' } })
    expect(store().setProjectColor('p1', null)).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { archived: true }, p2: { color: 'pink' } })
    expect(emitted.map((e) => e.type)).toEqual(['prefs:save', 'prefs:save'])
  })

  it('removes an entry with nothing left in it', () => {
    seed({ p1: { color: 'teal' } })
    store().setProjectColor('p1', null)
    expect(store().projectPrefs).toEqual({})
  })

  it('the same colour again applies (true) and emits nothing', () => {
    seed({ p1: { color: 'teal' } })
    expect(store().setProjectColor('p1', 'teal')).toBe(true)
    expect(emitted).toEqual([])
  })

  it.each(['__proto__', 'constructor', '__x__', ''])('refuses the key %j: false, nothing written or emitted', (id) => {
    expect(store().setProjectColor(id, 'blue')).toBe(false)
    expect(store().projectPrefs).toEqual({})
    expect(emitted).toEqual([])
  })

  it('refuses a colour it does not know', () => {
    expect(store().setProjectColor('p1', 'red' as never)).toBe(false)
    expect(store().projectPrefs).toEqual({})
  })

  it(`refuses a new entry past ${MAX_PROJECT_PREFS}, and still changes an existing one`, () => {
    seed(Object.fromEntries(Array.from({ length: MAX_PROJECT_PREFS }, (_, i) => [`p${i}`, { color: 'blue' as const }])))
    expect(store().setProjectColor('new', 'teal')).toBe(false)
    expect(store().projectPrefs.new).toBeUndefined()
    expect(store().setProjectColor('p5', 'teal')).toBe(true)
    expect(store().projectPrefs.p5).toEqual({ color: 'teal' })
  })
})

describe('setProjectArchived', () => {
  it('archives and unarchives, keeping the colour, emitting the archived field each time', () => {
    seed({ p1: { color: 'teal' } })
    expect(store().setProjectArchived('p1', true)).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { color: 'teal', archived: true } })
    expect(store().setProjectArchived('p1', false)).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { color: 'teal' } })
    expect(emitted).toEqual([
      { type: 'prefs:save', changes: [{ projectId: 'p1', field: 'archived' }] },
      { type: 'prefs:save', changes: [{ projectId: 'p1', field: 'archived' }] },
    ])
  })

  it('never emits settings:save, whichever setter runs', () => {
    store().setProjectArchived('p1', true)
    store().setProjectColor('p1', 'pink')
    store().copyProjectColor('p1', 'p2')
    store().moveProjectPref('p2', 'p3')
    store().dropProjectPref('p1')
    expect(emitted.length).toBeGreaterThan(0)
    expect(emitted.filter((e) => e.type !== 'prefs:save')).toEqual([])
  })

  it('refuses an unsafe key', () => {
    expect(store().setProjectArchived('constructor', true)).toBe(false)
    expect(emitted).toEqual([])
  })
})

describe('under a cloud replace (_isCloudUpdate)', () => {
  it('a setter still applies and returns true, but emits nothing', () => {
    useSettingsStore.setState({ _isCloudUpdate: true })
    expect(store().setProjectArchived('p1', true)).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { archived: true } })
    expect(emitted).toEqual([])
  })
})

describe('Clone (copyProjectColor)', () => {
  it('copies the colour to the new id, never the archive', () => {
    seed({ src: { color: 'purple', archived: true } })
    expect(store().copyProjectColor('src', 'copy')).toBe(true)
    expect(store().projectPrefs).toEqual({ src: { color: 'purple', archived: true }, copy: { color: 'purple' } })
    expect(emitted).toEqual([{ type: 'prefs:save', changes: [{ projectId: 'copy', field: 'color' }] }])
  })

  it('an uncoloured source gives the copy nothing, and emits nothing', () => {
    seed({ src: { archived: true } })
    store().copyProjectColor('src', 'copy')
    expect(store().projectPrefs).toEqual({ src: { archived: true } })
    expect(emitted).toEqual([])
  })
})

describe('Delete (dropProjectPref)', () => {
  it('drops the entry and emits both fields it held', () => {
    seed({ p1: { color: 'teal', archived: true }, p2: { color: 'pink' } })
    expect(store().dropProjectPref('p1')).toBe(true)
    expect(store().projectPrefs).toEqual({ p2: { color: 'pink' } })
    expect(emitted).toEqual([
      { type: 'prefs:save', changes: [{ projectId: 'p1', field: 'color' }, { projectId: 'p1', field: 'archived' }] },
    ])
  })
})

describe('D36: moveProjectPref is exact', () => {
  it('the target becomes the source entry, and the source goes', () => {
    seed({ old: { color: 'slate', archived: true } })
    expect(store().moveProjectPref('old', 'new')).toBe(true)
    expect(store().projectPrefs).toEqual({ new: { color: 'slate', archived: true } })
    expect(emitted).toEqual([
      {
        type: 'prefs:save',
        changes: [
          { projectId: 'old', field: 'color' },
          { projectId: 'old', field: 'archived' },
          { projectId: 'new', field: 'color' },
          { projectId: 'new', field: 'archived' },
        ],
      },
    ])
  })

  it('replaces whatever the target held (an orphan entry on the file id does not survive)', () => {
    seed({ old: { color: 'slate' }, new: { color: 'pink', archived: true } })
    store().moveProjectPref('old', 'new')
    expect(store().projectPrefs).toEqual({ new: { color: 'slate' } })
  })

  it('removes the target entry when the source has none (C-4)', () => {
    seed({ new: { color: 'pink', archived: true } })
    expect(store().moveProjectPref('old', 'new')).toBe(true)
    expect(store().projectPrefs).toEqual({})
    expect(emitted).toEqual([
      { type: 'prefs:save', changes: [{ projectId: 'new', field: 'color' }, { projectId: 'new', field: 'archived' }] },
    ])
  })

  it('a move onto itself changes nothing', () => {
    seed({ a: { color: 'teal' } })
    expect(store().moveProjectPref('a', 'a')).toBe(true)
    expect(store().projectPrefs).toEqual({ a: { color: 'teal' } })
    expect(emitted).toEqual([])
  })

  it('refuses an unsafe source or target', () => {
    seed({ a: { color: 'teal' } })
    expect(store().moveProjectPref('a', '__proto__')).toBe(false)
    expect(store().moveProjectPref('constructor', 'a')).toBe(false)
    expect(store().projectPrefs).toEqual({ a: { color: 'teal' } })
  })
})

describe('the clear and the cloud replace emit nothing', () => {
  it('clearSettingsOnSignOut empties a map that holds entries, with no event at all', () => {
    seed({ p1: { color: 'teal', archived: true }, p2: { archived: true } })
    store().clearSettingsOnSignOut()
    expect(store().projectPrefs).toEqual({})
    expect(emitted).toEqual([])
  })

  it('MUST-DIFFER: dropping the same entries one by one with the setter does emit', () => {
    seed({ p1: { color: 'teal', archived: true }, p2: { archived: true } })
    store().dropProjectPref('p1')
    store().dropProjectPref('p2')
    expect(emitted).toHaveLength(2)
  })

  it("replaceSettingsFromCloud sets the cloud's map over a local one and emits nothing", async () => {
    seed({ stale: { color: 'blue' } })
    store().replaceSettingsFromCloud({ ...CLOUD_SETTINGS, projectPrefs: { p9: { archived: true } } })
    expect(store().projectPrefs).toEqual({ p9: { archived: true } })
    expect(emitted).toEqual([])
    await Promise.resolve()
    expect(store()._isCloudUpdate).toBe(false)
  })
})

describe('nothing prunes on load', () => {
  it('an entry whose project is not held survives a rehydrate', async () => {
    localStorage.setItem('spert-settings', JSON.stringify({ state: { projectPrefs: { gone: { archived: true } } }, version: 0 }))
    await useSettingsStore.persist.rehydrate()
    expect(store().projectPrefs).toEqual({ gone: { archived: true } })
  })
})

describe('rehydrating spert-settings', () => {
  const OTHERS = {
    autoRecalculate: false,
    trialCount: 25000,
    defaultChartFontSize: 'large',
    defaultCustomPercentile: 70,
    defaultCustomPercentile2: 30,
    defaultResultsPercentiles: [10, 90],
    distributionsEnabled: ['gamma', 'triangular'],
    exportName: 'Jane Smith',
    exportId: 'js-1',
    suppressLocalStorageWarning: true,
  }

  it('sanitises a bad map, and keeps every other persisted setting', async () => {
    const raw = `{"state":{"autoRecalculate":false,"trialCount":25000,"defaultChartFontSize":"large","defaultCustomPercentile":70,"defaultCustomPercentile2":30,"defaultResultsPercentiles":[10,90],"distributionsEnabled":["gamma","triangular"],"exportName":"Jane Smith","exportId":"js-1","suppressLocalStorageWarning":true,"projectPrefs":{"ok":{"color":"teal"},"__proto__":{"archived":true},"constructor":{"color":"blue"},"__x__":{"color":"pink"},"bad":{"color":"red","archived":true},"junk":7}},"version":0}`
    localStorage.setItem('spert-settings', raw)
    await useSettingsStore.persist.rehydrate()
    expect(store().projectPrefs).toEqual({ ok: { color: 'teal' }, bad: { archived: true } })
    expect(Object.getPrototypeOf(store().projectPrefs)).toBe(Object.prototype)
    for (const [key, value] of Object.entries(OTHERS)) {
      expect(store()[key as keyof typeof OTHERS], key).toEqual(value)
    }
  })

  it('a map that is not an object becomes empty', async () => {
    localStorage.setItem('spert-settings', JSON.stringify({ state: { trialCount: 5000, projectPrefs: ['blue'] }, version: 0 }))
    await useSettingsStore.persist.rehydrate()
    expect(store().projectPrefs).toEqual({})
    expect(store().trialCount).toBe(5000)
  })

  it('setters keep working on a rehydrated map (the actions survive the merge)', async () => {
    localStorage.setItem('spert-settings', JSON.stringify({ state: { projectPrefs: { p1: { color: 'teal' } } }, version: 0 }))
    await useSettingsStore.persist.rehydrate()
    expect(store().setProjectArchived('p1', true)).toBe(true)
    expect(store().projectPrefs).toEqual({ p1: { color: 'teal', archived: true } })
  })

  it('a reload keeps colours and archive: what a setter writes is what rehydrates', async () => {
    store().setProjectColor('p1', 'pink')
    store().setProjectArchived('p2', true)
    const saved = localStorage.getItem('spert-settings')!
    expect(JSON.parse(saved).state.projectPrefs).toEqual({ p1: { color: 'pink' }, p2: { archived: true } })
    seed({}) // the store forgets (and persist writes that) …
    localStorage.setItem('spert-settings', saved) // … and the page reloads with what was saved
    await useSettingsStore.persist.rehydrate()
    expect(store().projectPrefs).toEqual({ p1: { color: 'pink' }, p2: { archived: true } })
  })
})
