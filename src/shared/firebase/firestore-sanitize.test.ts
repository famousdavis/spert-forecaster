// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { sanitizeForFirestore, stripFirestoreFields } from './firestore-sanitize'

describe('sanitizeForFirestore', () => {
  it('removes undefined values from objects', () => {
    const input = { a: 1, b: undefined, c: 'hello' }
    expect(sanitizeForFirestore(input)).toEqual({ a: 1, c: 'hello' })
  })

  it('handles nested objects', () => {
    const input = { a: { b: undefined, c: 1 }, d: 'ok' }
    expect(sanitizeForFirestore(input)).toEqual({ a: { c: 1 }, d: 'ok' })
  })

  it('handles arrays', () => {
    const input = [{ a: 1, b: undefined }, { c: undefined, d: 2 }]
    expect(sanitizeForFirestore(input)).toEqual([{ a: 1 }, { d: 2 }])
  })

  it('preserves null values', () => {
    const input = { a: null, b: 1 }
    expect(sanitizeForFirestore(input)).toEqual({ a: null, b: 1 })
  })

  it('preserves primitives', () => {
    expect(sanitizeForFirestore(42)).toBe(42)
    expect(sanitizeForFirestore('hello')).toBe('hello')
    expect(sanitizeForFirestore(true)).toBe(true)
  })

  it('handles deeply nested undefined', () => {
    const input = { a: { b: { c: undefined, d: { e: undefined, f: 1 } } } }
    expect(sanitizeForFirestore(input)).toEqual({ a: { b: { d: { f: 1 } } } })
  })
})

describe('stripFirestoreFields', () => {
  it('removes owner, members, and schemaVersion', () => {
    const input = {
      name: 'Test Project',
      owner: 'uid123',
      members: { uid456: 'editor' },
      schemaVersion: 1,
      unitOfMeasure: 'points',
    }
    const result = stripFirestoreFields(input)
    expect(result).toEqual({ name: 'Test Project', unitOfMeasure: 'points' })
    expect('owner' in result).toBe(false)
    expect('members' in result).toBe(false)
    expect('schemaVersion' in result).toBe(false)
  })

  it('preserves all other fields', () => {
    const input = {
      name: 'Test',
      owner: 'uid',
      members: {},
      schemaVersion: 1,
      sprints: [],
      _originRef: 'abc',
      createdAt: '2024-01-01',
    }
    const result = stripFirestoreFields(input)
    expect(result).toHaveProperty('name', 'Test')
    expect(result).toHaveProperty('sprints')
    expect(result).toHaveProperty('_originRef', 'abc')
    expect(result).toHaveProperty('createdAt', '2024-01-01')
  })
})
