// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Reusable form validation utilities.
 * Guards against NaN, Infinity, and out-of-range numeric inputs.
 */

/** Parse a string to a finite number, or return null for empty/NaN/Infinity */
export function safeParseNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

/** Returns true if value parses to a finite number > 0 */
export function isFinitePositive(value: string): boolean {
  const n = safeParseNumber(value)
  return n !== null && n > 0
}

/** Returns true if value parses to a finite number in [min, max] (inclusive) */
export function isInRange(value: string, min: number, max: number): boolean {
  const n = safeParseNumber(value)
  return n !== null && n >= min && n <= max
}
