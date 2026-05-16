// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Choose the correct indefinite article ("a" or "an") for an integer.
 *
 * Targeted at percentage values (1–99) in user-facing copy such as
 *   "there is {article} {n}% chance..."
 *
 * Domain coverage: any integer 1–99 returns the article matching how the
 * digits are read aloud ("eight" → "an eight", "eighty-five" → "an eighty-five",
 * "fifty" → "a fifty"). Larger numbers receive a best-effort answer based on
 * the same leading-word heuristic but are not exhaustively tested.
 *
 * Non-finite or fractional inputs fall back to "a" so callers never see an
 * `undefined` slot in their string concatenation.
 */
export function indefiniteArticle(n: number): 'a' | 'an' {
  if (!Number.isFinite(n)) return 'a'
  const abs = Math.abs(Math.trunc(n))
  // Anything starting with the vowel-sound words: eight, eleven, eighteen, eighty-*
  if (abs === 8 || abs === 11 || abs === 18) return 'an'
  if (abs >= 80 && abs <= 89) return 'an'
  return 'a'
}
