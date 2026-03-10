// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  addDays,
  addWeeks,
  calculateSprintStartDate,
  calculateSprintFinishDate,
  getPrecedingBusinessDay,
  getWorkingDaysInRange,
  countWorkingDays,
  calculateSprintProductivityFactor,
  isWeekend,
  formatDate,
  formatDateLong,
  formatDateRange,
  isValidDateRange,
} from './dates'

describe('addDays', () => {
  it('adds days correctly', () => {
    expect(addDays('2024-01-01', 7)).toBe('2024-01-08')
    expect(addDays('2024-01-01', 14)).toBe('2024-01-15')
  })

  it('handles month boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // 2024 is leap year
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
  })

  it('handles negative days', () => {
    expect(addDays('2024-01-15', -7)).toBe('2024-01-08')
  })

  // This is the critical DST bug test - March 10, 2024 is when DST begins in US
  it('handles DST spring forward transition correctly', () => {
    // DST in US begins March 10, 2024 at 2am
    // Adding days across this boundary should not cause date drift
    expect(addDays('2024-03-09', 1)).toBe('2024-03-10') // Day before DST
    expect(addDays('2024-03-09', 2)).toBe('2024-03-11') // Day after DST
    expect(addDays('2024-03-01', 14)).toBe('2024-03-15') // Two weeks spanning DST
  })

  // DST fall back - November 3, 2024
  it('handles DST fall back transition correctly', () => {
    expect(addDays('2024-11-02', 1)).toBe('2024-11-03') // Day before fall back
    expect(addDays('2024-11-02', 2)).toBe('2024-11-04') // Day after fall back
    expect(addDays('2024-10-28', 14)).toBe('2024-11-11') // Two weeks spanning fall back
  })

  it('handles large day counts across DST', () => {
    // 10 two-week sprints from Jan 1 = 140 days, crosses DST
    expect(addDays('2024-01-01', 140)).toBe('2024-05-20')
  })
})

describe('addWeeks', () => {
  it('adds weeks correctly', () => {
    expect(addWeeks('2024-01-01', 2)).toBe('2024-01-15')
    expect(addWeeks('2024-01-01', 10)).toBe('2024-03-11')
  })

  it('handles DST transition', () => {
    // 10 weeks from Jan 1 crosses March DST
    expect(addWeeks('2024-01-01', 10)).toBe('2024-03-11') // Should be Monday
  })
})

describe('getPrecedingBusinessDay', () => {
  it('returns same day for weekdays', () => {
    expect(getPrecedingBusinessDay('2024-01-08')).toBe('2024-01-08') // Monday
    expect(getPrecedingBusinessDay('2024-01-12')).toBe('2024-01-12') // Friday
  })

  it('returns Friday for Saturday', () => {
    expect(getPrecedingBusinessDay('2024-01-13')).toBe('2024-01-12') // Sat -> Fri
  })

  it('returns Friday for Sunday', () => {
    expect(getPrecedingBusinessDay('2024-01-14')).toBe('2024-01-12') // Sun -> Fri
  })
})

describe('calculateSprintStartDate', () => {
  it('returns first sprint date for sprint 1', () => {
    expect(calculateSprintStartDate('2024-01-01', 1, 2)).toBe('2024-01-01')
  })

  it('calculates correct start for subsequent sprints', () => {
    // Sprint 2 starts 2 weeks after sprint 1
    expect(calculateSprintStartDate('2024-01-01', 2, 2)).toBe('2024-01-15')
    // Sprint 5 starts 8 weeks after sprint 1
    expect(calculateSprintStartDate('2024-01-01', 5, 2)).toBe('2024-02-26')
  })

  it('handles sprints across DST transition', () => {
    // Sprint 6 starts 10 weeks after Jan 1 = March 11 (Monday after DST)
    expect(calculateSprintStartDate('2024-01-01', 6, 2)).toBe('2024-03-11')
  })
})

describe('calculateSprintFinishDate', () => {
  it('returns Friday for 2-week sprint starting Monday', () => {
    // Sprint starts Jan 1 (Mon), next sprint would start Jan 15 (Mon)
    // Finish should be Jan 12 (Fri)
    expect(calculateSprintFinishDate('2024-01-01', 2)).toBe('2024-01-12')
  })

  it('handles sprint finishing before weekend', () => {
    // Sprint starts Jan 15 (Mon), next starts Jan 29 (Mon)
    // Day before is Jan 28 (Sun), preceding business day is Jan 26 (Fri)
    expect(calculateSprintFinishDate('2024-01-15', 2)).toBe('2024-01-26')
  })

  it('handles 1-week sprint cadence', () => {
    // Sprint starts Jan 1 (Mon), next starts Jan 8 (Mon)
    // Day before is Jan 7 (Sun), preceding business day is Jan 5 (Fri)
    expect(calculateSprintFinishDate('2024-01-01', 1)).toBe('2024-01-05')
  })

  it('handles finish date across DST transition', () => {
    // Sprint 5 starts Feb 26, sprint 6 starts Mar 11
    // Day before Mar 11 is Mar 10 (Sun), preceding business day is Mar 8 (Fri)
    expect(calculateSprintFinishDate('2024-02-26', 2)).toBe('2024-03-08')
  })

  it('never returns a weekend date', () => {
    // Test several sprints to ensure none finish on weekends
    const startDate = '2024-01-01'
    for (let sprint = 1; sprint <= 20; sprint++) {
      const sprintStart = calculateSprintStartDate(startDate, sprint, 2)
      const finishDate = calculateSprintFinishDate(sprintStart, 2)
      expect(isWeekend(finishDate)).toBe(false)
    }
  })
})

describe('isWeekend', () => {
  it('identifies Saturday as weekend', () => {
    expect(isWeekend('2025-01-04')).toBe(true) // Saturday
  })

  it('identifies Sunday as weekend', () => {
    expect(isWeekend('2025-01-05')).toBe(true) // Sunday
  })

  it('identifies Monday as not weekend', () => {
    expect(isWeekend('2025-01-06')).toBe(false) // Monday
  })

  it('identifies Friday as not weekend', () => {
    expect(isWeekend('2025-01-03')).toBe(false) // Friday
  })
})

describe('getWorkingDaysInRange', () => {
  it('returns working days excluding weekends', () => {
    // Mon Jan 6 to Fri Jan 10, 2025 - all 5 days are weekdays
    const days = getWorkingDaysInRange('2025-01-06', '2025-01-10')
    expect(days).toEqual([
      '2025-01-06',
      '2025-01-07',
      '2025-01-08',
      '2025-01-09',
      '2025-01-10',
    ])
  })

  it('excludes Saturday and Sunday', () => {
    // Fri Jan 3 to Mon Jan 6, 2025 - should exclude Sat and Sun
    const days = getWorkingDaysInRange('2025-01-03', '2025-01-06')
    expect(days).toEqual(['2025-01-03', '2025-01-06'])
  })

  it('returns empty array for weekend-only range', () => {
    // Sat Jan 4 to Sun Jan 5, 2025
    const days = getWorkingDaysInRange('2025-01-04', '2025-01-05')
    expect(days).toEqual([])
  })

  it('handles single day that is a weekday', () => {
    const days = getWorkingDaysInRange('2025-01-06', '2025-01-06')
    expect(days).toEqual(['2025-01-06'])
  })

  it('handles single day that is a weekend', () => {
    const days = getWorkingDaysInRange('2025-01-04', '2025-01-04')
    expect(days).toEqual([])
  })

  it('handles two-week sprint period', () => {
    // Mon Jan 6 to Fri Jan 17, 2025 - two full work weeks = 10 days
    const days = getWorkingDaysInRange('2025-01-06', '2025-01-17')
    expect(days.length).toBe(10)
    // Verify no weekend days included
    days.forEach((day) => {
      expect(isWeekend(day)).toBe(false)
    })
  })
})

describe('countWorkingDays', () => {
  it('counts working days in a week', () => {
    // Mon Jan 6 to Fri Jan 10, 2025
    expect(countWorkingDays('2025-01-06', '2025-01-10')).toBe(5)
  })

  it('counts working days across weekend', () => {
    // Fri Jan 3 to Mon Jan 6, 2025
    expect(countWorkingDays('2025-01-03', '2025-01-06')).toBe(2)
  })

  it('returns 0 for weekend-only range', () => {
    expect(countWorkingDays('2025-01-04', '2025-01-05')).toBe(0)
  })

  it('counts working days in two-week sprint', () => {
    // Mon Jan 6 to Fri Jan 17, 2025
    expect(countWorkingDays('2025-01-06', '2025-01-17')).toBe(10)
  })
})

describe('calculateSprintProductivityFactor', () => {
  it('returns 1.0 when no adjustments are provided', () => {
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [])
    expect(factor).toBe(1.0)
  })

  it('returns 1.0 when sprint has no working days', () => {
    // Weekend only
    const factor = calculateSprintProductivityFactor('2025-01-04', '2025-01-05', [
      { startDate: '2025-01-01', endDate: '2025-01-31', factor: 0.5 },
    ])
    expect(factor).toBe(1.0)
  })

  it('applies full adjustment when entire sprint is covered', () => {
    // Mon-Fri fully covered by 0.5 adjustment
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-01', endDate: '2025-01-31', factor: 0.5 },
    ])
    expect(factor).toBe(0.5)
  })

  it('applies zero factor when entire sprint is covered', () => {
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-01', endDate: '2025-01-31', factor: 0.0 },
    ])
    expect(factor).toBe(0.0)
  })

  it('calculates weighted average for partial coverage', () => {
    // 5 working days: Mon-Fri Jan 6-10
    // Adjustment covers only Mon-Wed (3 days) at 0.5
    // Thu-Fri (2 days) at 1.0
    // Expected: (3*0.5 + 2*1.0) / 5 = (1.5 + 2) / 5 = 0.7
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-06', endDate: '2025-01-08', factor: 0.5 },
    ])
    expect(factor).toBeCloseTo(0.7, 5)
  })

  it('uses minimum factor when adjustments overlap', () => {
    // Two overlapping adjustments: 0.5 and 0.3
    // Should use 0.3 (most restrictive)
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-01', endDate: '2025-01-31', factor: 0.5 },
      { startDate: '2025-01-01', endDate: '2025-01-31', factor: 0.3 },
    ])
    expect(factor).toBe(0.3)
  })

  it('handles multiple non-overlapping adjustments', () => {
    // 5 working days: Mon-Fri Jan 6-10
    // Mon-Tue (2 days) at 0.5
    // Wed (1 day) at 1.0 (no adjustment)
    // Thu-Fri (2 days) at 0.0
    // Expected: (2*0.5 + 1*1.0 + 2*0.0) / 5 = (1 + 1 + 0) / 5 = 0.4
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-06', endDate: '2025-01-07', factor: 0.5 },
      { startDate: '2025-01-09', endDate: '2025-01-10', factor: 0.0 },
    ])
    expect(factor).toBeCloseTo(0.4, 5)
  })

  it('ignores adjustments that do not overlap with sprint', () => {
    // Adjustment is in February, sprint is in January
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-02-01', endDate: '2025-02-28', factor: 0.0 },
    ])
    expect(factor).toBe(1.0)
  })

  it('handles adjustment starting mid-sprint', () => {
    // 5 working days: Mon-Fri Jan 6-10
    // Adjustment starts Wed Jan 8, covers Wed-Fri (3 days) at 0.5
    // Mon-Tue (2 days) at 1.0
    // Expected: (2*1.0 + 3*0.5) / 5 = (2 + 1.5) / 5 = 0.7
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-08', endDate: '2025-01-31', factor: 0.5 },
    ])
    expect(factor).toBeCloseTo(0.7, 5)
  })

  it('handles adjustment ending mid-sprint', () => {
    // 5 working days: Mon-Fri Jan 6-10
    // Adjustment ends Tue Jan 7, covers Mon-Tue (2 days) at 0.5
    // Wed-Fri (3 days) at 1.0
    // Expected: (2*0.5 + 3*1.0) / 5 = (1 + 3) / 5 = 0.8
    const factor = calculateSprintProductivityFactor('2025-01-06', '2025-01-10', [
      { startDate: '2025-01-01', endDate: '2025-01-07', factor: 0.5 },
    ])
    expect(factor).toBeCloseTo(0.8, 5)
  })

  it('handles real-world December holiday scenario', () => {
    // Two-week sprint: Mon Dec 15 to Fri Dec 26, 2025
    // Working days: Dec 15-19 (5 days), Dec 22-26 (5 days) = 10 days total
    // But Dec 25 (Thu) and Dec 26 (Fri) have 0.0 factor (Christmas)
    // Dec 24 (Wed) has 0.5 factor (Christmas Eve)
    // Days at 1.0: Dec 15-19 (5) + Dec 22-23 (2) = 7 days
    // Days at 0.5: Dec 24 (1 day)
    // Days at 0.0: Dec 25-26 (2 days)
    // Expected: (7*1.0 + 1*0.5 + 2*0.0) / 10 = 7.5 / 10 = 0.75
    const factor = calculateSprintProductivityFactor('2025-12-15', '2025-12-26', [
      { startDate: '2025-12-24', endDate: '2025-12-24', factor: 0.5 },
      { startDate: '2025-12-25', endDate: '2025-12-26', factor: 0.0 },
    ])
    expect(factor).toBeCloseTo(0.75, 5)
  })
})

describe('formatDate', () => {
  it('formats date with short month', () => {
    const result = formatDate('2026-01-15')
    expect(result).toContain('Jan')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })
})

describe('formatDateLong', () => {
  it('formats date with long month name', () => {
    const result = formatDateLong('2026-01-15')
    expect(result).toContain('January')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })
})

describe('formatDateRange', () => {
  it('omits repeated month when start and end are same month', () => {
    const result = formatDateRange('2026-01-06', '2026-01-17')
    expect(result).toBe('January 6 - 17')
  })

  it('includes both months when they differ', () => {
    const result = formatDateRange('2026-01-27', '2026-02-07')
    expect(result).toBe('January 27 - February 7')
  })
})

describe('isValidDateRange', () => {
  it('returns true for valid date in range', () => {
    expect(isValidDateRange('2026-01-15')).toBe(true)
  })

  it('returns false for date before 2000', () => {
    expect(isValidDateRange('1999-12-31')).toBe(false)
  })

  it('returns false for date after 2050', () => {
    expect(isValidDateRange('2051-01-01')).toBe(false)
  })

  it('returns false for invalid format', () => {
    expect(isValidDateRange('2026/01/15')).toBe(false)
  })

  it('returns true for empty string with allowEmpty', () => {
    expect(isValidDateRange('', true)).toBe(true)
  })

  it('returns false for empty string without allowEmpty', () => {
    expect(isValidDateRange('')).toBe(false)
  })
})

describe('countWorkingDays edge cases', () => {
  it('returns 0 for reversed range (end before start)', () => {
    expect(countWorkingDays('2026-01-10', '2026-01-06')).toBe(0)
  })

  it('returns 1 for single working day', () => {
    expect(countWorkingDays('2026-01-05', '2026-01-05')).toBe(1) // Monday
  })
})
