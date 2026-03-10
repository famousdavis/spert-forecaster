// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { safeParseNumber, isFinitePositive, isInRange } from './validation'

describe('safeParseNumber', () => {
  it('parses valid numbers', () => {
    expect(safeParseNumber('42')).toBe(42)
    expect(safeParseNumber('3.14')).toBe(3.14)
    expect(safeParseNumber('-7')).toBe(-7)
    expect(safeParseNumber('0')).toBe(0)
  })

  it('returns null for empty/whitespace strings', () => {
    expect(safeParseNumber('')).toBeNull()
    expect(safeParseNumber('   ')).toBeNull()
  })

  it('returns null for NaN values', () => {
    expect(safeParseNumber('abc')).toBeNull()
    expect(safeParseNumber('NaN')).toBeNull()
  })

  it('returns null for Infinity', () => {
    expect(safeParseNumber('Infinity')).toBeNull()
    expect(safeParseNumber('-Infinity')).toBeNull()
  })
})

describe('isFinitePositive', () => {
  it('returns true for positive numbers', () => {
    expect(isFinitePositive('1')).toBe(true)
    expect(isFinitePositive('0.001')).toBe(true)
    expect(isFinitePositive('999999')).toBe(true)
  })

  it('returns false for zero', () => {
    expect(isFinitePositive('0')).toBe(false)
  })

  it('returns false for negative numbers', () => {
    expect(isFinitePositive('-1')).toBe(false)
  })

  it('returns false for non-numeric strings', () => {
    expect(isFinitePositive('')).toBe(false)
    expect(isFinitePositive('abc')).toBe(false)
    expect(isFinitePositive('Infinity')).toBe(false)
  })
})

describe('isInRange', () => {
  it('returns true when value is within range', () => {
    expect(isInRange('5', 1, 10)).toBe(true)
    expect(isInRange('1', 1, 10)).toBe(true)
    expect(isInRange('10', 1, 10)).toBe(true)
  })

  it('returns false when value is outside range', () => {
    expect(isInRange('0', 1, 10)).toBe(false)
    expect(isInRange('11', 1, 10)).toBe(false)
    expect(isInRange('-5', 0, 100)).toBe(false)
  })

  it('returns false for non-numeric strings', () => {
    expect(isInRange('abc', 0, 100)).toBe(false)
    expect(isInRange('', 0, 100)).toBe(false)
  })

  it('returns false for Infinity', () => {
    expect(isInRange('Infinity', 0, 999999)).toBe(false)
  })
})
