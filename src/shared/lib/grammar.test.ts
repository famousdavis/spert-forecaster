// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { indefiniteArticle } from './grammar'

describe('indefiniteArticle', () => {
  it('returns "an" for 8, 11, 18, and the 80–89 range (vowel-sound starts)', () => {
    expect(indefiniteArticle(8)).toBe('an')
    expect(indefiniteArticle(11)).toBe('an')
    expect(indefiniteArticle(18)).toBe('an')
    for (let n = 80; n <= 89; n++) {
      expect(indefiniteArticle(n)).toBe('an')
    }
  })

  it('returns "a" for percentages that start with consonant sounds', () => {
    const consonantPercentages = [1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14, 15, 16, 17, 19, 50, 60, 70, 75, 79, 90, 95, 99]
    for (const n of consonantPercentages) {
      expect(indefiniteArticle(n)).toBe('a')
    }
  })

  it('handles boundary cases at 79/80 and 89/90 correctly', () => {
    expect(indefiniteArticle(79)).toBe('a')
    expect(indefiniteArticle(80)).toBe('an')
    expect(indefiniteArticle(89)).toBe('an')
    expect(indefiniteArticle(90)).toBe('a')
  })

  it('treats fractional inputs by truncation', () => {
    expect(indefiniteArticle(8.7)).toBe('an')
    expect(indefiniteArticle(50.3)).toBe('a')
    expect(indefiniteArticle(80.9)).toBe('an')
  })

  it('falls back to "a" for non-finite inputs', () => {
    expect(indefiniteArticle(NaN)).toBe('a')
    expect(indefiniteArticle(Infinity)).toBe('a')
    expect(indefiniteArticle(-Infinity)).toBe('a')
  })

  it('handles negative numbers by taking absolute value', () => {
    expect(indefiniteArticle(-8)).toBe('an')
    expect(indefiniteArticle(-50)).toBe('a')
  })

  it('returns "a" for zero', () => {
    expect(indefiniteArticle(0)).toBe('a')
  })
})
