// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Finding a tile's controls (v0.50.0): by name compared as TEXT, never by a selector built from a
// name. A selector holding `"` throws inside the focus effect; one holding `\` finds nothing
// (R2 consequence review C-5, measured in jsdom). Every lookup is run with such names.

import { describe, it, expect, beforeEach } from 'vitest'
import { findTileControl, findTileControlNamed, focusAfterTileLeaves, resolveFocusTarget } from './tile-focus'

/** A tile as ProjectTile renders it: the open button first, then Delete, the row, Unarchive. */
function tile(id: string, name: string, archived = false): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const open = `${archived ? 'Unarchive and view' : 'View'} history for ${name} (View only)`
  return `<li data-tile="true" data-project-id="${esc(id)}">
    <h3><button aria-label="${esc(open)}">${esc(name)}</button></h3>
    <button aria-label="${esc(`Delete ${name}`)}"></button>
    <div><button aria-label="${esc(`Edit ${name}`)}"></button>${archived ? '' : `<button aria-label="${esc(`Archive ${name}`)}"></button>`}</div>
    ${archived ? `<div><button aria-label="${esc(`Unarchive ${name}`)}"></button></div>` : ''}
  </li>`
}

const NAMES = ['Plain', 'Q"uote', 'Back\\slash', 'Both "\\" kinds', 'and view history for X']
let root: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.appendChild(root)
})

describe.each(NAMES)('a project named %j', (name) => {
  beforeEach(() => {
    root.innerHTML = tile('id"1\\', name) + tile('id2', name, true)
  })

  it('finds the open button by either name, on a tile at rest and an archived one', () => {
    expect(findTileControl(root, 'id"1\\', 'open')?.getAttribute('aria-label')).toBe(`View history for ${name} (View only)`)
    expect(findTileControl(root, 'id2', 'open')?.getAttribute('aria-label')).toBe(`Unarchive and view history for ${name} (View only)`)
  })

  it('finds Edit and Delete', () => {
    expect(findTileControl(root, 'id"1\\', 'edit')?.getAttribute('aria-label')).toBe(`Edit ${name}`)
    expect(findTileControl(root, 'id2', 'delete')?.getAttribute('aria-label')).toBe(`Delete ${name}`)
  })

  it('finds Archive and Unarchive by their whole names, never the open button', () => {
    expect(findTileControlNamed(root, 'id"1\\', `Archive ${name}`)?.getAttribute('aria-label')).toBe(`Archive ${name}`)
    const unarchive = findTileControlNamed(root, 'id2', `Unarchive ${name}`)
    expect(unarchive?.getAttribute('aria-label')).toBe(`Unarchive ${name}`)
    expect(unarchive).not.toBe(findTileControl(root, 'id2', 'open'))
  })

  it('finds nothing on another tile, or for a name that is not there', () => {
    expect(findTileControlNamed(root, 'id2', `Archive ${name}`)).toBeNull()
    expect(findTileControlNamed(root, 'missing', `Archive ${name}`)).toBeNull()
  })
})

describe('focusAfterTileLeaves (fed the SHOWN list)', () => {
  const shown = [{ id: 'a' }, { id: 'c' }, { id: 'e' }]
  it.each([
    ['a', { kind: 'open', projectId: 'c' }],
    ['c', { kind: 'open', projectId: 'e' }],
    ['e', { kind: 'open', projectId: 'c' }],
  ])('%s leaving: the next shown tile, else the previous', (id, target) => {
    expect(focusAfterTileLeaves(shown, id)).toEqual(target)
  })

  it('the only tile leaving: New Project; an id not shown: New Project', () => {
    expect(focusAfterTileLeaves([{ id: 'a' }], 'a')).toEqual({ kind: 'new' })
    expect(focusAfterTileLeaves(shown, 'zz')).toEqual({ kind: 'new' })
  })
})

describe('resolveFocusTarget', () => {
  it('resolves each kind, and New Project', () => {
    root.innerHTML = tile('p', 'Alpha') + tile('q', 'Beta', true)
    const newProject = document.createElement('button')
    expect(resolveFocusTarget(root, { kind: 'new' }, newProject)).toBe(newProject)
    expect(resolveFocusTarget(root, { kind: 'named', projectId: 'q', name: 'Unarchive Beta' }, null)?.getAttribute('aria-label')).toBe('Unarchive Beta')
    expect(resolveFocusTarget(root, { kind: 'open', projectId: 'p' }, null)?.getAttribute('aria-label')).toBe('View history for Alpha (View only)')
  })
})
