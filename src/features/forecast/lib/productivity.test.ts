// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { preCalculateSprintFactors, hasActiveAdjustments } from './productivity'
import type { ProductivityAdjustment } from '@/shared/types'

describe('preCalculateSprintFactors', () => {
  const makeAdjustment = (
    startDate: string,
    endDate: string,
    factor: number
  ): ProductivityAdjustment => ({
    id: 'test-id',
    name: 'Test Adjustment',
    startDate,
    endDate,
    factor,
    enabled: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  })

  it('returns all 1.0 factors when no adjustments provided', () => {
    const result = preCalculateSprintFactors(
      '2025-01-06', // Monday
      2, // 2-week sprints
      1, // Start at sprint 1
      [], // No adjustments
      10 // Calculate 10 sprints
    )

    expect(result.factors.length).toBe(10)
    expect(result.factors.every((f) => f === 1.0)).toBe(true)
  })

  it('returns all 1.0 factors when adjustments are before forecast period', () => {
    const result = preCalculateSprintFactors(
      '2025-01-06',
      2,
      5, // Start at sprint 5 (4 sprints completed)
      [makeAdjustment('2025-01-01', '2025-01-05', 0.5)], // Before sprint 5
      10
    )

    expect(result.factors.every((f) => f === 1.0)).toBe(true)
  })

  it('applies adjustment to affected sprints', () => {
    // Sprint 1: Jan 6 - Jan 17 (2 weeks)
    // Sprint 2: Jan 20 - Jan 31
    // Sprint 3: Feb 3 - Feb 14
    // Adjustment covers all of Sprint 2
    const result = preCalculateSprintFactors(
      '2025-01-06',
      2,
      1,
      [makeAdjustment('2025-01-20', '2025-01-31', 0.5)],
      5
    )

    expect(result.factors[0]).toBe(1.0) // Sprint 1 unaffected
    expect(result.factors[1]).toBe(0.5) // Sprint 2 fully covered
    expect(result.factors[2]).toBe(1.0) // Sprint 3 unaffected
  })

  it('calculates partial sprint coverage correctly', () => {
    // Sprint 1: Jan 6-10 (1-week sprint, 5 working days)
    // Adjustment covers Mon-Wed (3 days) at 0.5
    // Expected: (3*0.5 + 2*1.0) / 5 = 0.7
    const result = preCalculateSprintFactors(
      '2025-01-06',
      1,
      1,
      [makeAdjustment('2025-01-06', '2025-01-08', 0.5)],
      3
    )

    expect(result.factors[0]).toBeCloseTo(0.7, 5)
    expect(result.factors[1]).toBe(1.0)
  })

  it('handles zero factor (team vacation)', () => {
    const result = preCalculateSprintFactors(
      '2025-01-06',
      1,
      1,
      [makeAdjustment('2025-01-06', '2025-01-10', 0.0)],
      3
    )

    expect(result.factors[0]).toBe(0.0)
    expect(result.factors[1]).toBe(1.0)
  })

  it('handles multiple adjustment periods', () => {
    // Two separate holiday periods
    const result = preCalculateSprintFactors(
      '2025-01-06',
      1,
      1,
      [
        makeAdjustment('2025-01-06', '2025-01-10', 0.5), // Sprint 1
        makeAdjustment('2025-01-20', '2025-01-24', 0.3), // Sprint 3
      ],
      5
    )

    expect(result.factors[0]).toBe(0.5) // Sprint 1
    expect(result.factors[1]).toBe(1.0) // Sprint 2
    expect(result.factors[2]).toBe(0.3) // Sprint 3
    expect(result.factors[3]).toBe(1.0) // Sprint 4
  })

  it('starts from correct sprint number when sprints are completed', () => {
    // 10 sprints completed, forecast starts at sprint 11
    // Sprint 11: Jan 6 + 10*2 weeks = starting May 26, 2025
    // (10 * 2 * 7 = 140 days from Jan 6)
    const result = preCalculateSprintFactors(
      '2025-01-06',
      2,
      11, // Start at sprint 11
      [makeAdjustment('2025-05-26', '2025-06-06', 0.5)], // Covers sprint 11
      5
    )

    expect(result.factors[0]).toBe(0.5) // First forecast sprint (sprint 11)
    expect(result.factors[1]).toBe(1.0) // Sprint 12
  })

  it('respects maxSprintsToCalculate parameter', () => {
    const result = preCalculateSprintFactors('2025-01-06', 2, 1, [], 50)

    expect(result.factors.length).toBe(50)
  })

  it('uses default maxSprintsToCalculate of 200 (checking length only)', () => {
    // Only test that the default creates an array of 1.0s without actually
    // calculating working days for each (which would be slow)
    const result = preCalculateSprintFactors('2025-01-06', 2, 1, [], 200)

    expect(result.factors.length).toBe(200)
    expect(result.factors[0]).toBe(1.0)
    expect(result.factors[199]).toBe(1.0)
  })
})

describe('hasActiveAdjustments', () => {
  it('returns false when all factors are 1.0', () => {
    expect(hasActiveAdjustments([1.0, 1.0, 1.0, 1.0])).toBe(false)
  })

  it('returns true when any factor is not 1.0', () => {
    expect(hasActiveAdjustments([1.0, 0.5, 1.0, 1.0])).toBe(true)
    expect(hasActiveAdjustments([0.0, 1.0, 1.0])).toBe(true)
    expect(hasActiveAdjustments([1.0, 1.0, 0.9])).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(hasActiveAdjustments([])).toBe(false)
  })
})
