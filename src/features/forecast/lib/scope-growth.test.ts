// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { resolveScopeGrowthPerSprint } from './scope-growth'

describe('resolveScopeGrowthPerSprint', () => {
  it('returns undefined when scope growth is disabled', () => {
    expect(resolveScopeGrowthPerSprint(false, 'calculated', '', 5.0)).toBeUndefined()
    expect(resolveScopeGrowthPerSprint(false, 'custom', '10', 5.0)).toBeUndefined()
  })

  it('returns calculated value in calculated mode', () => {
    expect(resolveScopeGrowthPerSprint(true, 'calculated', '', 5.0)).toBe(5.0)
  })

  it('returns undefined when calculated value is unavailable', () => {
    expect(resolveScopeGrowthPerSprint(true, 'calculated', '', undefined)).toBeUndefined()
  })

  it('returns parsed custom value in custom mode', () => {
    expect(resolveScopeGrowthPerSprint(true, 'custom', '10', 5.0)).toBe(10)
    expect(resolveScopeGrowthPerSprint(true, 'custom', '-3.5', 5.0)).toBe(-3.5)
    expect(resolveScopeGrowthPerSprint(true, 'custom', '0', 5.0)).toBe(0)
  })

  it('returns undefined for invalid custom input', () => {
    expect(resolveScopeGrowthPerSprint(true, 'custom', '', 5.0)).toBeUndefined()
    expect(resolveScopeGrowthPerSprint(true, 'custom', 'abc', 5.0)).toBeUndefined()
  })

  it('ignores calculated value in custom mode', () => {
    expect(resolveScopeGrowthPerSprint(true, 'custom', '10', 99.9)).toBe(10)
  })

  it('handles float edge cases in custom mode', () => {
    expect(resolveScopeGrowthPerSprint(true, 'custom', '3.', 5.0)).toBe(3)
    expect(resolveScopeGrowthPerSprint(true, 'custom', '.5', 5.0)).toBe(0.5)
  })
})
