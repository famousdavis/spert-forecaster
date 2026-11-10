// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The pure tile colour and archive module (v0.50.0), with GanttApp's `projectPrefs.test.ts` cases
// at d437e84 where they apply. Not ported: sanitizeId (Forecaster has none), the AppData helpers
// (withProjectPref and friends live in the settings store here) and moveAmongShown (Move, out by D4).

import { describe, it, expect } from 'vitest'
import {
  MAX_PROJECT_PREFS,
  PROJECT_COLORS,
  isProjectArchived,
  isUnsafePrefKey,
  projectPrefOf,
  reorderShown,
  sanitizeProjectPrefs,
  shownProjects,
  type ProjectPrefs,
} from './project-prefs'
import type { Project } from '@/shared/types'

const projects = (...ids: string[]): Project[] =>
  ids.map((id) => ({ id, name: `Project ${id}`, unitOfMeasure: 'pts', createdAt: 't', updatedAt: 't' }))
const idsOf = (list: Project[]) => list.map((p) => p.id)

describe('sanitizeProjectPrefs', () => {
  it.each([
    ['nothing', undefined],
    ['null', null],
    ['text', 'blue'],
    ['a number', 7],
    ['a list', [{ color: 'blue' }]],
  ])('reads %s as an empty map, never throwing', (_label, raw) => {
    expect(sanitizeProjectPrefs(raw)).toEqual({})
  })

  it('keeps a good map as it is', () => {
    const raw = { p1: { color: 'teal' }, p2: { archived: true }, p3: { color: 'pink', archived: true } }
    expect(sanitizeProjectPrefs(raw)).toEqual(raw)
  })

  it.each(PROJECT_COLORS)('keeps the colour %s', (color) => {
    expect(sanitizeProjectPrefs({ p1: { color } })).toEqual({ p1: { color } })
  })

  it.each(['red', 'green', 'none', 'Blue', '', 3, null, ['blue'], { blue: true }])(
    'drops the colour %j and, with nothing else, the entry',
    (color) => {
      expect(sanitizeProjectPrefs({ keep: { archived: true }, p1: { color } })).toEqual({ keep: { archived: true } })
    },
  )

  it('per field, then per entry: a refused colour keeps a valid archive', () => {
    expect(sanitizeProjectPrefs({ p1: { color: 'red', archived: true } })).toEqual({ p1: { archived: true } })
  })

  it('per field, then per entry: a refused archive keeps a valid colour', () => {
    expect(sanitizeProjectPrefs({ p1: { color: 'teal', archived: 'yes' } })).toEqual({ p1: { color: 'teal' } })
  })

  it.each(['true', 1, false, 0, null, {}])('takes only true as archived, not %j', (archived) => {
    expect(sanitizeProjectPrefs({ keep: { color: 'blue' }, p1: { archived } })).toEqual({ keep: { color: 'blue' } })
  })

  it.each(['yes', 3, null, ['blue'], true])('drops the entry %j, which is not an object', (entry) => {
    expect(sanitizeProjectPrefs({ keep: { color: 'blue' }, p1: entry })).toEqual({ keep: { color: 'blue' } })
  })

  it('drops any field but the two', () => {
    expect(sanitizeProjectPrefs({ p1: { color: 'blue', role: 'owner' } })).toEqual({ p1: { color: 'blue' } })
  })

  it('keeps a key as it is: no id rewriting (Forecaster has no sanitizeId)', () => {
    expect(sanitizeProjectPrefs({ 'p.1': { color: 'blue' }, 'a/b c': { color: 'teal' } })).toEqual({
      'p.1': { color: 'blue' },
      'a/b c': { color: 'teal' },
    })
  })

  it('is empty when no entry survives', () => {
    expect(sanitizeProjectPrefs({ p1: { color: 'red' } })).toEqual({})
    expect(sanitizeProjectPrefs({})).toEqual({})
  })

  describe('a key that could reach the prototype, that Firestore would refuse, or that is empty', () => {
    // JSON.parse makes `__proto__` an own key, as a tampered store or document would.
    const tampered = (key: string) => JSON.parse(`{"keep":{"color":"blue"},"${key}":{"archived":true}}`)

    it.each(['__proto__', 'constructor', '__reserved__', '__p.roto__', '____', ''])('refuses %j, and keeps the rest', (key) => {
      const prefs = sanitizeProjectPrefs(tampered(key))
      expect(prefs).toEqual({ keep: { color: 'blue' } })
      expect(Object.keys(prefs)).toEqual(['keep'])
    })

    it.each(['__a__b', 'a__b__', '__a', 'con.structor'])('keeps %s, which is neither reserved nor on the prototype', (key) => {
      expect(sanitizeProjectPrefs(tampered(key))).toEqual({ keep: { color: 'blue' }, [key]: { archived: true } })
    })

    it('does not touch any prototype', () => {
      const prefs = sanitizeProjectPrefs(tampered('__proto__'))
      expect(Object.getPrototypeOf(prefs)).toBe(Object.prototype)
      expect(({} as { archived?: boolean }).archived).toBeUndefined()
    })
  })

  it(`caps the map at ${MAX_PROJECT_PREFS} entries`, () => {
    const raw = Object.fromEntries(Array.from({ length: MAX_PROJECT_PREFS + 1 }, (_, i) => [`p${i}`, { color: 'blue' }]))
    const prefs = sanitizeProjectPrefs(raw)
    expect(Object.keys(prefs)).toHaveLength(MAX_PROJECT_PREFS)
    expect(prefs.p999).toEqual({ color: 'blue' })
    expect(prefs.p1000).toBeUndefined()
  })

  it('counts only kept entries towards the cap: refused ones ahead of it do not use a place', () => {
    const raw: Record<string, unknown> = { bad1: { color: 'red' }, bad2: 'x' }
    for (let i = 0; i < MAX_PROJECT_PREFS; i++) raw[`p${i}`] = { archived: true }
    expect(Object.keys(sanitizeProjectPrefs(raw))).toHaveLength(MAX_PROJECT_PREFS)
  })
})

describe('isUnsafePrefKey', () => {
  it.each([['__proto__'], ['constructor'], ['__x__'], [''], [7], [null], [undefined]])('refuses %j', (key) => {
    expect(isUnsafePrefKey(key)).toBe(true)
  })
  it.each([['p1'], ['toString'], ['__a'], ['a__'], ['hasOwnProperty']])('accepts %j', (key) => {
    expect(isUnsafePrefKey(key)).toBe(false)
  })
})

describe('reading an entry', () => {
  it('finds a project entry, and nothing with no map or no entry', () => {
    expect(projectPrefOf({ p1: { color: 'teal' } }, 'p1')).toEqual({ color: 'teal' })
    expect(projectPrefOf(undefined, 'p1')).toEqual({})
    expect(projectPrefOf({ p2: { color: 'teal' } }, 'p1')).toEqual({})
  })

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'finds no entry on the prototype for a project with the id %s, which is not archived',
    (id) => {
      expect(Object.getOwnPropertyNames(projectPrefOf({ p1: { color: 'teal' } }, id))).toEqual([])
      expect(isProjectArchived({ p1: { archived: true } }, id)).toBe(false)
    },
  )

  it('reads archived from the entry alone', () => {
    const prefs: ProjectPrefs = { p1: { archived: true }, p2: { color: 'blue' } }
    expect([isProjectArchived(prefs, 'p1'), isProjectArchived(prefs, 'p2'), isProjectArchived(prefs, 'p3')]).toEqual([true, false, false])
    expect(isProjectArchived(undefined, 'p1')).toBe(false)
  })
})

describe('shownProjects', () => {
  const list = projects('a', 'b', 'c')
  const prefs: ProjectPrefs = { b: { archived: true }, c: { color: 'teal' } }

  it('leaves out the archived, keeping the order; a colour alone is not archived', () => {
    expect(idsOf(shownProjects(list, prefs, false))).toEqual(['a', 'c'])
  })

  it('shows everything when asked', () => {
    expect(shownProjects(list, prefs, true)).toBe(list)
  })

  it('shows everything with no map, and nothing when all are archived', () => {
    expect(idsOf(shownProjects(list, undefined, false))).toEqual(['a', 'b', 'c'])
    expect(shownProjects(list, { a: { archived: true }, b: { archived: true }, c: { archived: true } }, false)).toEqual([])
  })

  it('ignores an entry whose project is not in the list (nothing prunes; counts come from the projects)', () => {
    expect(idsOf(shownProjects(list, { gone: { archived: true } }, false))).toEqual(['a', 'b', 'c'])
  })
})

describe('reorderShown', () => {
  it('with nothing hidden, is the new order', () => {
    expect(idsOf(reorderShown(projects('a', 'b', 'c'), ['c', 'a', 'b']))).toEqual(['c', 'a', 'b'])
  })

  it.each([
    ['first', ['x', 'a', 'b', 'c'], ['c', 'b', 'a'], ['x', 'c', 'b', 'a']],
    ['in the middle', ['a', 'x', 'b', 'c'], ['b', 'a', 'c'], ['b', 'x', 'a', 'c']],
    ['last', ['a', 'b', 'c', 'x'], ['b', 'a', 'c'], ['b', 'a', 'c', 'x']],
    ['twice, apart', ['x', 'a', 'y', 'b'], ['b', 'a'], ['x', 'b', 'y', 'a']],
    ['twice, together', ['a', 'x', 'y', 'b'], ['b', 'a'], ['b', 'x', 'y', 'a']],
    ['at both ends', ['x', 'a', 'b', 'y'], ['b', 'a'], ['x', 'b', 'a', 'y']],
  ])("keeps a hidden project's slot, hidden %s", (_label, full, shown, expected) => {
    expect(idsOf(reorderShown(projects(...full), shown))).toEqual(expected)
  })

  it('always returns every project', () => {
    const full = projects('a', 'x', 'b', 'y', 'c')
    expect(idsOf(reorderShown(full, ['c', 'b', 'a'])).sort()).toEqual(['a', 'b', 'c', 'x', 'y'])
  })
})
