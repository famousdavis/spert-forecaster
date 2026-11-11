// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Where focus goes when a row leaves a list (v0.50.4): its own control if still there, else the
// row that moved into its place, else the row above, else the fallbacks; never a disabled or
// detached control. The callers' own tests drive this through real deletes; these pin the order.
import { describe, it, expect, afterEach } from 'vitest'
import { focusTargetAfterRemoval, rowKeysInOrder, ROW_KEY_ATTR } from './row-focus'

afterEach(() => {
  document.body.innerHTML = ''
})

/** A list of Delete buttons keyed a, b, c… inside a root, plus an Add button outside it. */
function page(keys: string[]) {
  const root = document.createElement('div')
  for (const k of keys) {
    const b = document.createElement('button')
    b.setAttribute(ROW_KEY_ATTR, k)
    b.textContent = `Delete ${k}`
    root.append(b)
  }
  const add = document.createElement('button')
  add.textContent = 'Add'
  document.body.append(root, add)
  const remove = (k: string) => control(k)?.remove()
  const control = (k: string) => Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute(ROW_KEY_ATTR) === k) ?? null
  return { root, add, remove, control }
}
const label = (el: Element | null) => el?.textContent ?? null

describe('rowKeysInOrder', () => {
  it('reads the keys in page order, and nothing without a root', () => {
    const { root } = page(['c', 'a', 'b'])
    expect([rowKeysInOrder(root), rowKeysInOrder(null)]).toEqual([['c', 'a', 'b'], []])
  })
})

describe('focusTargetAfterRemoval', () => {
  it('the row still there (cancelled, or refused): its own control', () => {
    const p = page(['a', 'b', 'c'])
    const keys = rowKeysInOrder(p.root)
    expect(label(focusTargetAfterRemoval(p.root, keys, 'b', [p.add]))).toBe('Delete b')
  })

  it('a middle row gone: the row that moved into its place', () => {
    const p = page(['a', 'b', 'c'])
    const keys = rowKeysInOrder(p.root)
    p.remove('b')
    expect(label(focusTargetAfterRemoval(p.root, keys, 'b', [p.add]))).toBe('Delete c')
  })

  it('the last row gone: the row above it', () => {
    const p = page(['a', 'b', 'c'])
    const keys = rowKeysInOrder(p.root)
    p.remove('c')
    expect(label(focusTargetAfterRemoval(p.root, keys, 'c', [p.add]))).toBe('Delete b')
  })

  it('the first row gone: the row below it, never the fallback', () => {
    const p = page(['a', 'b'])
    const keys = rowKeysInOrder(p.root)
    p.remove('a')
    expect(label(focusTargetAfterRemoval(p.root, keys, 'a', [p.add]))).toBe('Delete b')
  })

  it('the only row gone: the first fallback that can take focus', () => {
    const p = page(['a'])
    const keys = rowKeysInOrder(p.root)
    p.remove('a')
    const disabled = document.createElement('button')
    disabled.disabled = true
    expect(label(focusTargetAfterRemoval(p.root, keys, 'a', [null, undefined, disabled, p.add]))).toBe('Add')
  })

  it('skips a disabled neighbour, and a fallback no longer on the page', () => {
    const p = page(['a', 'b', 'c'])
    const keys = rowKeysInOrder(p.root)
    p.remove('b')
    ;(p.control('c') as HTMLButtonElement).disabled = true
    expect(label(focusTargetAfterRemoval(p.root, keys, 'b', [p.add]))).toBe('Delete a')
    p.remove('a')
    p.add.remove()
    expect(focusTargetAfterRemoval(p.root, keys, 'b', [p.add])).toBeNull()
  })

  it('looks only inside its root: a same-key control elsewhere is not a neighbour', () => {
    const p = page(['a', 'b'])
    const elsewhere = page(['b', 'z'])
    const keys = rowKeysInOrder(p.root)
    p.remove('a')
    p.remove('b')
    expect(focusTargetAfterRemoval(p.root, keys, 'a', [])).toBeNull()
    expect(elsewhere.control('b')).not.toBeNull()
  })

  it('compares keys as text, so an id with quotes or brackets still matches', () => {
    const odd = 'x"] , [y'
    const p = page(['a', odd])
    const keys = rowKeysInOrder(p.root)
    p.remove('a')
    expect(label(focusTargetAfterRemoval(p.root, keys, 'a', []))).toBe(`Delete ${odd}`)
  })
})
