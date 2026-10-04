// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  today,
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
  getNextBusinessDay,
  resolveAllSprintDates,
  resolveAnchorDate,
  DATE_REGEX,
  MAX_ISO_DATE,
  isValidIsoDate,
  findInvalidSprintDates,
  findResolvedDateSpill,
  spillRank,
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

  // ───────────────────────────────────────────────────────────────────────────
  // Exact-boundary coverage for the overlap filter
  //
  //     adj.endDate >= sprintStart && adj.startDate <= sprintEnd
  //
  // Both comparisons had NO fixture sitting on the boundary, so `>=` -> `>` and
  // `<=` -> `<` both survived mutation. An adjustment that ends on the sprint's
  // first day, or begins on its last, is an ordinary calendar case — a holiday
  // that runs up to the sprint start, or one that begins as the sprint closes.
  //
  // ⚠️ These two are the ONLY killable mutants on that line. Every mutant that
  // makes the filter MORE permissive — `&&` -> `||`, and each operand forced to
  // `true` — is equivalent, because the day loop below re-applies the same
  // constraint per day. Measured over 325 systematic windows: zero
  // distinguishing inputs. Do not write tests for those; they cannot fail.
  // ───────────────────────────────────────────────────────────────────────────

  it('includes an adjustment that ends exactly on the sprint start date', () => {
    // Sprint: Mon 5 Jan - Fri 16 Jan 2026, 10 working days.
    // Adjustment ends ON the first day, so it contributes exactly that one day.
    // Expected: (9*1.0 + 1*0.5) / 10 = 0.95
    const factor = calculateSprintProductivityFactor('2026-01-05', '2026-01-16', [
      { startDate: '2026-01-01', endDate: '2026-01-05', factor: 0.5 },
    ])
    expect(factor).toBeCloseTo(0.95, 10)
  })

  it('includes an adjustment that starts exactly on the sprint end date', () => {
    // Same sprint. Adjustment starts ON the last day and runs past it.
    // Expected: (9*1.0 + 1*0.5) / 10 = 0.95
    const factor = calculateSprintProductivityFactor('2026-01-05', '2026-01-16', [
      { startDate: '2026-01-16', endDate: '2026-01-31', factor: 0.5 },
    ])
    expect(factor).toBeCloseTo(0.95, 10)
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

describe('getNextBusinessDay', () => {
  it('returns Tuesday when given Monday', () => {
    expect(getNextBusinessDay('2026-01-05')).toBe('2026-01-06') // Mon -> Tue
  })

  it('returns Monday when given Friday', () => {
    expect(getNextBusinessDay('2026-01-09')).toBe('2026-01-12') // Fri -> Mon
  })

  it('returns Monday when given Saturday', () => {
    expect(getNextBusinessDay('2026-01-10')).toBe('2026-01-12') // Sat -> Mon
  })

  it('returns Monday when given Sunday', () => {
    expect(getNextBusinessDay('2026-01-11')).toBe('2026-01-12') // Sun -> Mon
  })
})

describe('resolveAllSprintDates', () => {
  // 2-week cadence, starting Monday Jan 5, 2026
  const firstStart = '2026-01-05'
  const cadence = 2

  it('returns empty map for no sprints', () => {
    const result = resolveAllSprintDates(firstStart, cadence, [])
    expect(result.size).toBe(0)
  })

  it('computes standard dates when no custom finish dates', () => {
    const sprints = [
      { sprintNumber: 1 },
      { sprintNumber: 2 },
      { sprintNumber: 3 },
    ]
    const result = resolveAllSprintDates(firstStart, cadence, sprints)

    expect(result.get(1)?.startDate).toBe('2026-01-05')
    expect(result.get(1)?.finishDate).toBe(calculateSprintFinishDate('2026-01-05', cadence))
    expect(result.get(2)?.startDate).toBe(calculateSprintStartDate(firstStart, 2, cadence))
    expect(result.get(3)?.startDate).toBe(calculateSprintStartDate(firstStart, 3, cadence))
  })

  it('cascades forward when a sprint has a custom finish date', () => {
    const standardFinish1 = calculateSprintFinishDate('2026-01-05', cadence)
    // Extend sprint 1 by one week
    const customFinish1 = addDays(standardFinish1, 7)

    const sprints = [
      { sprintNumber: 1, customFinishDate: customFinish1 },
      { sprintNumber: 2 },
      { sprintNumber: 3 },
    ]
    const result = resolveAllSprintDates(firstStart, cadence, sprints)

    // Sprint 1: starts normally, finishes at custom date
    expect(result.get(1)?.startDate).toBe('2026-01-05')
    expect(result.get(1)?.finishDate).toBe(customFinish1)

    // Sprint 2: starts on next business day after sprint 1's custom finish
    const sprint2Start = getNextBusinessDay(customFinish1)
    expect(result.get(2)?.startDate).toBe(sprint2Start)

    // Sprint 3: starts on next business day after sprint 2's computed finish
    const sprint2Finish = calculateSprintFinishDate(sprint2Start, cadence)
    const sprint3Start = getNextBusinessDay(sprint2Finish)
    expect(result.get(3)?.startDate).toBe(sprint3Start)
  })

  it('sorts sprints by number before walking', () => {
    // Pass sprints out of order
    const sprints = [
      { sprintNumber: 3 },
      { sprintNumber: 1 },
      { sprintNumber: 2 },
    ]
    const result = resolveAllSprintDates(firstStart, cadence, sprints)

    // Should resolve correctly regardless of input order
    expect(result.get(1)?.startDate).toBe('2026-01-05')
    expect(result.get(2)?.startDate).toBe(calculateSprintStartDate(firstStart, 2, cadence))
  })
})

describe('resolveAnchorDate', () => {
  const firstStart = '2026-01-05'
  const cadence = 2

  it('returns firstSprintStartDate when no sprints', () => {
    expect(resolveAnchorDate(firstStart, cadence, [])).toBe(firstStart)
  })

  it('returns next business day after last sprint finish with standard cadence', () => {
    const sprints = [
      { sprintNumber: 1 },
      { sprintNumber: 2 },
    ]
    const result = resolveAnchorDate(firstStart, cadence, sprints)

    // Should equal what calculateSprintStartDate gives for sprint 3
    expect(result).toBe(calculateSprintStartDate(firstStart, 3, cadence))
  })

  it('shifts anchor when last sprint has custom finish date', () => {
    const sprint2Start = calculateSprintStartDate(firstStart, 2, cadence)
    const sprint2StandardFinish = calculateSprintFinishDate(sprint2Start, cadence)
    const customFinish2 = addDays(sprint2StandardFinish, 7) // Extend by a week

    const sprints = [
      { sprintNumber: 1 },
      { sprintNumber: 2, customFinishDate: customFinish2 },
    ]
    const result = resolveAnchorDate(firstStart, cadence, sprints)

    // Anchor should be next business day after the custom finish
    expect(result).toBe(getNextBusinessDay(customFinish2))
    // And should NOT equal the standard sprint 3 start
    expect(result).not.toBe(calculateSprintStartDate(firstStart, 3, cadence))
  })

  it('cascades through intermediate custom dates', () => {
    const standardFinish1 = calculateSprintFinishDate('2026-01-05', cadence)
    const customFinish1 = addDays(standardFinish1, 7)

    const sprints = [
      { sprintNumber: 1, customFinishDate: customFinish1 },
      { sprintNumber: 2 },
    ]
    const result = resolveAnchorDate(firstStart, cadence, sprints)

    // Sprint 2 starts after custom sprint 1, finishes at standard cadence from there
    const sprint2Start = getNextBusinessDay(customFinish1)
    const sprint2Finish = calculateSprintFinishDate(sprint2Start, cadence)
    expect(result).toBe(getNextBusinessDay(sprint2Finish))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// today()
//
// Added 2026-08-05 to close a mutation survivor: `now.getMonth() + 1` mutated to
// `- 1` SURVIVED the whole suite, because nothing anywhere pinned today() to an
// actual date. It feeds export filenames and default form values, so a wrong
// month is user-visible.
//
// ⚠️ The clock is set with LOCAL date components — `new Date(2026, 2, 7, 12)` —
// not an ISO/UTC string. today() reads getFullYear/getMonth/getDate, which are
// local, so a UTC instant would make the expected value depend on the machine's
// timezone. Constructing locally makes the assertion timezone-independent
// without computing the expectation from the same getters, which would pass
// under the mutation too.
// ─────────────────────────────────────────────────────────────────────────────

describe('today', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (y: number, monthIndex: number, d: number) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(y, monthIndex, d, 12, 0, 0))
  }

  it('returns the current local date as YYYY-MM-DD', () => {
    at(2026, 2, 7) // 7 March 2026
    expect(today()).toBe('2026-03-07')
  })

  it('zero-pads a single-digit month and day', () => {
    at(2026, 0, 5) // 5 January 2026 — month index 0, the +1 offset's worst case
    expect(today()).toBe('2026-01-05')
  })

  it('handles December without rolling the year', () => {
    at(2026, 11, 31) // 31 December 2026
    expect(today()).toBe('2026-12-31')
  })
})

// ── Brief 38 PR C: the date rule, the guard, the finder and the spill ────────
// Every case below runs on INVALID inputs too: the guard exists for them.

describe('isValidIsoDate (the import validator\'s rule, moved here verbatim)', () => {
  it.each(['2026-09-04', '2028-02-29', '2026-12-31', MAX_ISO_DATE, '0000-01-01'])('accepts %s', (d) => {
    expect(isValidIsoDate(d)).toBe(true)
  })

  it.each([
    '20276-09-04', '202760-09-04', '2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10',
    '2026-09-00', '2026-02-32', '202-09-04', '2026-9-4', ' 2026-09-04', '2026-09-04 ', 'x2026-09-04',
    '2026-09-04x', '', '+010000-01-03',
  ])('refuses %s', (d) => {
    expect(isValidIsoDate(d)).toBe(false)
  })

  it.each([null, undefined, 20260904, {}, ['2026-09-04']])('refuses a non-string (%s)', (v) => {
    expect(isValidIsoDate(v)).toBe(false)
  })

  it('refuses a String object even when its text is a valid date (the typeof check)', () => {
    expect(isValidIsoDate(new String('2026-09-04'))).toBe(false)
  })

  it('MAX_ISO_DATE is the last date DATE_REGEX can spell', () => {
    expect(MAX_ISO_DATE).toBe('9999-12-31')
    expect(DATE_REGEX.test(MAX_ISO_DATE)).toBe(true)
    expect(DATE_REGEX.test('10000-01-01')).toBe(false)
  })
})

describe('resolveAllSprintDates — the guard', () => {
  const two = (custom: unknown) =>
    resolveAllSprintDates('2026-08-10', 2, [{ sprintNumber: 1, customFinishDate: custom as string }, { sprintNumber: 2 }])

  it.each(['20276-09-04', '2026-02-30', '2026-13-01', null])(
    'a refused custom date (%s) resolves to the computed finish and carries the raw value',
    (bad) => {
      const r = two(bad)
      expect(r.get(1)).toEqual({ startDate: '2026-08-10', finishDate: '2026-08-21', invalidFinishDate: bad })
      expect(r.get(2)).toEqual({ startDate: '2026-08-24', finishDate: '2026-09-04' })
    }
  )

  it('a valid custom date is used, with no invalidFinishDate key', () => {
    const r = two('2026-08-28')
    expect(r.get(1)).toEqual({ startDate: '2026-08-10', finishDate: '2026-08-28' })
    expect('invalidFinishDate' in r.get(1)!).toBe(false)
    expect(r.get(2)!.startDate).toBe('2026-08-31')
  })

  it('an absent custom date is the computed one, with no invalidFinishDate key', () => {
    const r = two(undefined)
    expect(r.get(1)).toEqual({ startDate: '2026-08-10', finishDate: '2026-08-21' })
    expect('invalidFinishDate' in r.get(1)!).toBe(false)
  })

  it('resolveAnchorDate on a refused last custom date returns the computed next start', () => {
    expect(resolveAnchorDate('2026-08-10', 2, [{ sprintNumber: 1 }, { sprintNumber: 2, customFinishDate: '20276-09-04' }]))
      .toBe('2026-09-07')
  })
})

describe('findInvalidSprintDates', () => {
  const s = (n: number, extra: Record<string, unknown> = {}) =>
    ({ id: `s${n}`, sprintNumber: n, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16', ...extra })
  const keys = (found: ReturnType<typeof findInvalidSprintDates>) =>
    found.map((d) => `${d.sprintNumber}:${d.field}:${String(d.value)}`)

  it('counts a field only when it is not undefined: an own undefined key is absent', () => {
    expect(findInvalidSprintDates([s(1, { customFinishDate: undefined })])).toEqual([])
  })

  it('flags null and non-strings, as the validator does', () => {
    expect(keys(findInvalidSprintDates([s(1, { customFinishDate: null }), s(2, { sprintStartDate: 20260105 })])))
      .toEqual(['1:customFinishDate:null', '2:sprintStartDate:20260105'])
  })

  it('lists every refused field, in sprint order, then the validator\'s field order', () => {
    const found = findInvalidSprintDates([
      s(5, { sprintStartDate: '+020276-09-05' }),
      s(3, { sprintStartDate: 'x', sprintFinishDate: '20276-09-04', customFinishDate: '2026-02-30' }),
    ])
    expect(keys(found)).toEqual([
      '3:sprintStartDate:x', '3:sprintFinishDate:20276-09-04', '3:customFinishDate:2026-02-30', '5:sprintStartDate:+020276-09-05',
    ])
    expect(found.map((d) => d.sprintId)).toEqual(['s3', 's3', 's3', 's5'])
  })

  it('a sprint whose dates all pass is not listed', () => {
    expect(findInvalidSprintDates([s(1, { customFinishDate: '2026-01-14' })])).toEqual([])
  })
})

describe('findResolvedDateSpill — exactly the spilled sprints, and every contributing custom date', () => {
  type H = Array<{ sprintNumber: number; customFinishDate?: string }>
  const run = (hs: H, first = '2026-08-10') =>
    findResolvedDateSpill(hs, resolveAllSprintDates(first, 2, hs), resolveAnchorDate(first, 2, hs))
  const n = (k: number, custom?: string) => (custom ? { sprintNumber: k, customFinishDate: custom } : { sprintNumber: k })
  const Y = MAX_ISO_DATE
  const cause = (k: number, finishDate = Y) => ({ sprintNumber: k, finishDate })

  it('a valid 9999-12-31 mid-history spills the next sprint, and is its one cause', () => {
    expect(run([n(1), n(2, Y), n(3)])).toEqual({ sprintNumber: 3, spilledSprints: [3], causes: [cause(2)] })
  })

  it('on the last sprint it spills only the forecast start', () => {
    expect(run([n(1), n(2, Y)])).toEqual({ sprintNumber: null, spilledSprints: [], causes: [cause(2)] })
  })

  it('two custom dates that each push the calendar past 9999 are both causes (the stuck shape)', () => {
    expect(run([n(1), n(2, Y), n(3, Y)])).toEqual({ sprintNumber: 3, spilledSprints: [3], causes: [cause(2), cause(3)] })
  })

  it('an earlier custom date whose computed successors run past 9999 is the one cause', () => {
    expect(run([n(1, '9999-11-26'), n(2), n(3), n(4)]))
      .toEqual({ sprintNumber: 4, spilledSprints: [4], causes: [cause(1, '9999-11-26')] })
  })

  it('reports the first spilled sprint exactly, and every spilled sprint after it', () => {
    expect(run([n(1), n(2, Y), n(3), n(4)])).toEqual({ sprintNumber: 3, spilledSprints: [3, 4], causes: [cause(2)] })
  })

  it('an earlier custom date that pushes nothing is not a cause; only the latest before the spill is', () => {
    expect(run([n(1, '2026-08-20'), n(2, Y), n(3)])?.causes).toEqual([cause(2)])
  })

  it('a custom date after the spill that pulls the schedule back is not a cause, and ends the spill', () => {
    expect(run([n(1), n(2, Y), n(3), n(4, '9999-12-28')])).toEqual({ sprintNumber: 3, spilledSprints: [3, 4], causes: [cause(2)] })
  })

  it('a spill need not run to the last sprint (NM1: only sprints 4–6)', () => {
    const hs = [n(1), n(2), n(3, Y), n(4), n(5), n(6, '2026-03-25'), n(7), n(8)]
    expect(run(hs, '2026-01-05')).toEqual({ sprintNumber: 4, spilledSprints: [4, 5, 6], causes: [cause(3)] })
  })

  it('a later custom date can end a spill at once (NM2: only sprint 3)', () => {
    const hs = [n(1), n(2, Y), n(3, '2026-02-12'), n(4), n(5), n(6), n(7), n(8)]
    expect(run(hs, '2026-01-05')).toEqual({ sprintNumber: 3, spilledSprints: [3], causes: [cause(2)] })
  })

  it('9999-12-30 (a Thursday) on the last sprint keeps the forecast start in range', () => {
    expect(run([n(1), n(2, '9999-12-30')])).toBeNull()
  })

  it('a schedule that runs out by itself has no cause', () => {
    expect(run([n(1), n(2)], '9999-12-13')).toEqual({ sprintNumber: 2, spilledSprints: [2], causes: [] })
  })

  it('an ordinary history does not spill', () => {
    expect(run([n(1), n(2, '2026-09-11'), n(3)])).toBeNull()
  })

  it('unsorted input is sorted first', () => {
    const hs = [n(3), n(2, Y), n(1)]
    expect(findResolvedDateSpill(hs, resolveAllSprintDates('2026-08-10', 2, hs), resolveAnchorDate('2026-08-10', 2, hs)))
      .toEqual({ sprintNumber: 3, spilledSprints: [3], causes: [cause(2)] })
  })

  it('spillRank orders an earlier spill as worse, and no spill as best', () => {
    const at = (sprintNumber: number | null) => ({ sprintNumber, spilledSprints: [], causes: [] })
    expect(spillRank(at(3))).toBeLessThan(spillRank(at(5)))
    expect(spillRank(at(5))).toBeLessThan(spillRank(at(null)))
    expect(spillRank(at(null))).toBeLessThan(spillRank(null))
    expect(spillRank(at(null))).toBe(Number.MAX_SAFE_INTEGER)
    expect(spillRank(null)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('P14 — valid histories resolve exactly as before the guard (differential against f973ae4)', () => {
  type H = Array<{ sprintNumber: number; customFinishDate?: string }>

  // The oracle: f973ae4's resolveAllSprintDates and resolveAnchorDate, frozen verbatim apart from names.
  function oracleAll(first: string, cadence: number, hs: H) {
    const result = new Map<number, { startDate: string; finishDate: string }>()
    if (hs.length === 0) return result
    const sorted = [...hs].sort((a, b) => a.sprintNumber - b.sprintNumber)
    let currentStart = first
    for (const sprint of sorted) {
      const prev = result.size > 0 ? sorted[sorted.indexOf(sprint) - 1] : null
      currentStart = prev ? getNextBusinessDay(result.get(prev.sprintNumber)!.finishDate) : first
      const computed = calculateSprintFinishDate(currentStart, cadence)
      result.set(sprint.sprintNumber, { startDate: currentStart, finishDate: sprint.customFinishDate ?? computed })
    }
    return result
  }
  function oracleAnchor(first: string, cadence: number, hs: H) {
    if (hs.length === 0) return first
    const last = oracleAll(first, cadence, hs).get(Math.max(...hs.map((s) => s.sprintNumber)))
    return last ? getNextBusinessDay(last.finishDate) : first
  }

  let seed = 20261004
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
  const genCustom = (first: string): string | undefined => {
    if (rand() < 0.4) return addDays(first, Math.floor(rand() * 400))
    return rand() < 0.1 ? pick(['2028-02-29', MAX_ISO_DATE, '0000-01-01']) : undefined
  }
  const genHistory = (first: string): H => {
    const hs: H = []
    let k = 0
    for (let j = 0, count = 1 + Math.floor(rand() * 10); j < count; j++) {
      k += pick([1, 1, 1, 2])
      const custom = genCustom(first)
      hs.push(custom === undefined ? { sprintNumber: k } : { sprintNumber: k, customFinishDate: custom })
    }
    return hs
  }
  const sameAsOracle = (first: string, cadence: number, hs: H) => {
    const reversed = [...hs].reverse()
    const got = resolveAllSprintDates(first, cadence, reversed)
    expect([...got.entries()]).toEqual([...oracleAll(first, cadence, reversed).entries()])
    for (const entry of got.values()) expect('invalidFinishDate' in entry).toBe(false)
    expect(resolveAnchorDate(first, cadence, hs)).toBe(oracleAnchor(first, cadence, hs))
  }

  it('600 generated histories with valid inputs: identical maps, identical anchors, no invalidFinishDate key', () => {
    let compared = 0
    for (let i = 0; i < 600; i++) {
      const first = pick(['2000-01-03', '2024-02-26', '2026-01-05', '2028-02-28', '2050-12-26', '9999-11-01'])
      const hs = genHistory(first)
      if (!hs.every((h) => h.customFinishDate === undefined || isValidIsoDate(h.customFinishDate))) continue
      sameAsOracle(first, pick([1, 2, 3, 4]), hs)
      compared++
    }
    // The filter must not silently empty the run: most generated histories are valid.
    expect(compared).toBeGreaterThan(500)
  })
})
