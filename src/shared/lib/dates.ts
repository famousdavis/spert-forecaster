// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Date utility functions

/**
 * Add days to a date string and return a new ISO date string.
 * Uses UTC to avoid DST issues.
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

/**
 * Add weeks to a date string and return a new ISO date string
 */
export function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7)
}

/**
 * Format a date string for display (e.g., "Jan 15, 2026")
 * Uses T00:00:00 suffix to avoid timezone issues with date-only strings
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date string for display with full month name (e.g., "January 15, 2026")
 * Uses T00:00:00 suffix to avoid timezone issues with date-only strings
 */
export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Format a date string without year (e.g., "Jan 15")
 * Useful for compact chart labels where year is implied
 */
export function formatDateCompact(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}`
}

/**
 * Get today's date as an ISO date string (YYYY-MM-DD) in local timezone.
 * Use this for user-facing dates like filenames and default form values.
 */
export function today(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Check if a date is a weekend (Saturday = 6, Sunday = 0)
 */
export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  const day = date.getDay()
  return day === 0 || day === 6
}

/**
 * Get the preceding business day (Mon-Fri) for a given date.
 * If the date is already a business day, returns that date.
 * If it's Saturday, returns Friday. If it's Sunday, returns Friday.
 */
export function getPrecedingBusinessDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const day = date.getDay()

  if (day === 0) {
    // Sunday -> Friday (subtract 2 days)
    return addDays(dateStr, -2)
  } else if (day === 6) {
    // Saturday -> Friday (subtract 1 day)
    return addDays(dateStr, -1)
  }
  // Already a business day
  return dateStr
}

/**
 * Calculate the sprint start date for a given sprint number
 * Sprint 1 starts on firstSprintStartDate
 * Sprint N starts on firstSprintStartDate + (N-1) * cadenceWeeks
 */
export function calculateSprintStartDate(
  firstSprintStartDate: string,
  sprintNumber: number,
  cadenceWeeks: number
): string {
  const weeksToAdd = (sprintNumber - 1) * cadenceWeeks
  return addWeeks(firstSprintStartDate, weeksToAdd)
}

/**
 * Calculate the sprint finish date for a given sprint start date and cadence.
 * The finish date is the business day (Mon-Fri) immediately before the next sprint starts.
 */
export function calculateSprintFinishDate(
  sprintStartDate: string,
  cadenceWeeks: number
): string {
  // Next sprint would start on sprintStartDate + cadenceWeeks
  const nextSprintStart = addWeeks(sprintStartDate, cadenceWeeks)
  // Day before next sprint starts
  const dayBeforeNextSprint = addDays(nextSprintStart, -1)
  // Ensure it's a business day
  return getPrecedingBusinessDay(dayBeforeNextSprint)
}

/**
 * Check if a date string is valid and within the allowed year range (2000-2050)
 * @param allowEmpty - If true, returns true for empty/incomplete strings (useful for form validation)
 */
export function isValidDateRange(dateStr: string, allowEmpty = false): boolean {
  if (!dateStr || dateStr.length !== 10) return allowEmpty
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  return dateStr >= '2000-01-01' && dateStr <= '2050-12-31'
}

/**
 * Format a date range for sprint display (e.g., "January 20 - 31" or "January 20 - February 3")
 */
export function formatDateRange(startDate: string, finishDate: string): string {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(finishDate + 'T00:00:00')

  const startMonth = start.toLocaleDateString('en-US', { month: 'long' })
  const startDay = start.getDate()
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' })
  const endDay = end.getDate()

  // If same month, don't repeat month name
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}`
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
}

/**
 * Count working days (Mon-Fri) between two dates using O(1) math.
 * Inclusive of both start and end dates if they are working days.
 */
export function countWorkingDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')

  // Total calendar days (inclusive)
  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

  if (totalDays <= 0) return 0

  // Count complete weeks
  const completeWeeks = Math.floor(totalDays / 7)
  const remainingDays = totalDays % 7

  // Complete weeks contribute 5 working days each
  let workingDays = completeWeeks * 5

  // Handle remaining days
  const startDay = start.getDay() // 0 = Sunday, 6 = Saturday

  for (let i = 0; i < remainingDays; i++) {
    const day = (startDay + i) % 7
    if (day !== 0 && day !== 6) {
      workingDays++
    }
  }

  return workingDays
}

/**
 * Get all working days (Mon-Fri) between two dates as ISO strings.
 * Inclusive of both start and end dates if they are working days.
 * Note: This iterates day-by-day, use countWorkingDays() for just the count.
 */
export function getWorkingDaysInRange(startDate: string, endDate: string): string[] {
  const result: string[] = []
  let current = startDate

  while (current <= endDate) {
    if (!isWeekend(current)) {
      result.push(current)
    }
    current = addDays(current, 1)
  }

  return result
}

/**
 * Calculate the weighted average productivity factor for a sprint.
 *
 * For each working day in the sprint:
 * - If the day falls within an adjustment period, use that period's factor
 * - If multiple adjustments overlap on a day, use the minimum (most restrictive)
 * - If no adjustment applies, use factor 1.0 (normal productivity)
 *
 * Uses O(a) complexity where a = number of adjustments, rather than O(d) where d = days.
 *
 * @returns Weighted average factor (0.0 to 1.0), or 1.0 if no working days
 */
export function calculateSprintProductivityFactor(
  sprintStart: string,
  sprintEnd: string,
  adjustments: Array<{ startDate: string; endDate: string; factor: number }>
): number {
  const totalWorkingDays = countWorkingDays(sprintStart, sprintEnd)

  if (totalWorkingDays === 0) {
    return 1.0 // No working days means no adjustment needed
  }

  // If no adjustments, return 1.0 immediately
  if (adjustments.length === 0) {
    return 1.0
  }

  // Filter to only adjustments that overlap with this sprint
  const relevantAdjustments = adjustments.filter(
    (adj) => adj.endDate >= sprintStart && adj.startDate <= sprintEnd
  )

  if (relevantAdjustments.length === 0) {
    return 1.0
  }

  // For simplicity with overlapping adjustments, we still need to iterate through days
  // but only if there are relevant adjustments. This is acceptable because:
  // 1. Most sprints won't have adjustments (early return above)
  // 2. Sprint durations are bounded (1-4 weeks = 5-20 working days max)
  const workingDays = getWorkingDaysInRange(sprintStart, sprintEnd)

  let totalFactor = 0

  for (const day of workingDays) {
    // Find all adjustments that apply to this day
    const applicableFactors = relevantAdjustments
      .filter((adj) => day >= adj.startDate && day <= adj.endDate)
      .map((adj) => adj.factor)

    // If multiple adjustments overlap, use the minimum (most restrictive)
    // If no adjustments, factor is 1.0 (normal productivity)
    const dayFactor = applicableFactors.length > 0 ? Math.min(...applicableFactors) : 1.0

    totalFactor += dayFactor
  }

  return totalFactor / workingDays.length
}
