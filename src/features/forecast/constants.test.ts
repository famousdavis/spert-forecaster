// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { getRoundingIncrement, roundToNearest, roundRange, VOLATILITY_OPTIONS, DEFAULT_VOLATILITY_MULTIPLIER, CV_OPTIONS, DEFAULT_CV } from './constants'
import { getVisibleDistributions } from './types'

describe('getRoundingIncrement', () => {
  it('returns 2 for velocity < 50', () => {
    expect(getRoundingIncrement(5)).toBe(2)
    expect(getRoundingIncrement(15)).toBe(2)
    expect(getRoundingIncrement(30)).toBe(2)
    expect(getRoundingIncrement(49)).toBe(2)
  })

  it('returns 5 for velocity 50–99', () => {
    expect(getRoundingIncrement(50)).toBe(5)
    expect(getRoundingIncrement(70)).toBe(5)
    expect(getRoundingIncrement(99)).toBe(5)
  })

  it('returns 10 for velocity >= 100', () => {
    expect(getRoundingIncrement(100)).toBe(10)
    expect(getRoundingIncrement(200)).toBe(10)
    expect(getRoundingIncrement(10000)).toBe(10)
  })
})

describe('roundToNearest', () => {
  it('rounds to nearest 5', () => {
    expect(roundToNearest(45.5, 5)).toBe(45)
    expect(roundToNearest(47.5, 5)).toBe(50)
    expect(roundToNearest(94.5, 5)).toBe(95)
  })

  it('rounds to nearest 10', () => {
    expect(roundToNearest(145, 10)).toBe(150)
    expect(roundToNearest(254, 10)).toBe(250)
  })

  it('rounds to nearest 2', () => {
    expect(roundToNearest(9.75, 2)).toBe(10)
    expect(roundToNearest(5.25, 2)).toBe(6)
  })
})

describe('roundRange', () => {
  it('V=70, CV=0.35 → (45, 95)', () => {
    const result = roundRange(70, 0.35)
    expect(result.displayLower).toBe(45)
    expect(result.displayUpper).toBe(95)
  })

  it('V=70, CV=0.15 → (60, 80)', () => {
    const result = roundRange(70, 0.15)
    expect(result.displayLower).toBe(60)
    expect(result.displayUpper).toBe(80)
  })

  it('V=70, CV=0.65 → (25, 115)', () => {
    const result = roundRange(70, 0.65)
    expect(result.displayLower).toBe(25)
    expect(result.displayUpper).toBe(115)
  })

  it('V=200, CV=0.25 → (150, 250)', () => {
    const result = roundRange(200, 0.25)
    expect(result.displayLower).toBe(150)
    expect(result.displayUpper).toBe(250)
  })

  it('V=15, CV=0.35 → (10, 20)', () => {
    const result = roundRange(15, 0.35)
    expect(result.displayLower).toBe(10)
    expect(result.displayUpper).toBe(20)
  })

  it('floors lower bound at 0 for high CV with small velocity', () => {
    // V=10, CV=0.65: raw lower = 3.5, round to nearest 2 = 4
    const result = roundRange(10, 0.65)
    expect(result.displayLower).toBe(4)
    expect(result.displayUpper).toBeGreaterThan(0)
  })

  it('lower bound never goes negative', () => {
    // V=3, CV=0.65: raw lower = max(0, 3 - 1.95) = 1.05, round to nearest 2 = 2
    const result = roundRange(3, 0.65)
    expect(result.displayLower).toBeGreaterThanOrEqual(0)
  })

  it('floors at 0 when raw lower is truly negative', () => {
    // V=2, CV=0.65: raw lower = max(0, 2 - 1.3) = 0.7, round to nearest 2 = 0
    const result = roundRange(2, 0.65)
    expect(result.displayLower).toBe(0)
  })
})

describe('VOLATILITY_OPTIONS', () => {
  it('has 4 options', () => {
    expect(VOLATILITY_OPTIONS).toHaveLength(4)
  })

  it('multipliers are in ascending order', () => {
    const multipliers = VOLATILITY_OPTIONS.map((o) => o.multiplier)
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeGreaterThan(multipliers[i - 1])
    }
  })

  it('includes a 1.0 multiplier (match history)', () => {
    const matchHistory = VOLATILITY_OPTIONS.find((o) => o.multiplier === 1.0)
    expect(matchHistory).toBeDefined()
    expect(matchHistory!.label).toBe('Match history')
  })

  it('all multipliers are positive', () => {
    for (const opt of VOLATILITY_OPTIONS) {
      expect(opt.multiplier).toBeGreaterThan(0)
    }
  })

  it('all labels are non-empty', () => {
    for (const opt of VOLATILITY_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_VOLATILITY_MULTIPLIER', () => {
  it('equals 1.0', () => {
    expect(DEFAULT_VOLATILITY_MULTIPLIER).toBe(1.0)
  })
})

describe('CV_OPTIONS', () => {
  it('has 6 options', () => {
    expect(CV_OPTIONS).toHaveLength(6)
  })

  it('CVs are in ascending order', () => {
    for (let i = 1; i < CV_OPTIONS.length; i++) {
      expect(CV_OPTIONS[i].cv).toBeGreaterThan(CV_OPTIONS[i - 1].cv)
    }
  })

  it('has correct boundary CV values', () => {
    expect(CV_OPTIONS[0].cv).toBe(0.15)
    expect(CV_OPTIONS[CV_OPTIONS.length - 1].cv).toBe(0.65)
  })

  it('all labels are non-empty', () => {
    for (const opt of CV_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })

  it('includes steady and uncertain extremes', () => {
    const labels = CV_OPTIONS.map((o) => o.label)
    expect(labels[0]).toBe('Very steady')
    expect(labels[labels.length - 1]).toBe('Wildly uncertain')
  })
})

describe('DEFAULT_CV', () => {
  it('equals 0.35 (Somewhat variable)', () => {
    expect(DEFAULT_CV).toBe(0.35)
  })

  it('matches a valid CV_OPTIONS entry', () => {
    const match = CV_OPTIONS.find((o) => o.cv === DEFAULT_CV)
    expect(match).toBeDefined()
    expect(match!.label).toBe('Somewhat variable')
  })
})

describe('getVisibleDistributions', () => {
  it('returns 5 distributions in subjective mode', () => {
    const dists = getVisibleDistributions('subjective', false)
    expect(dists).toHaveLength(5)
    expect(dists).toEqual(['truncatedNormal', 'lognormal', 'gamma', 'triangular', 'uniform'])
  })

  it('subjective mode never includes bootstrap regardless of hasBootstrap', () => {
    const dists = getVisibleDistributions('subjective', true)
    expect(dists).not.toContain('bootstrap')
    expect(dists).toHaveLength(5)
  })

  it('returns 4 distributions in history mode without bootstrap', () => {
    const dists = getVisibleDistributions('history', false)
    expect(dists).toHaveLength(4)
    expect(dists).toEqual(['truncatedNormal', 'lognormal', 'gamma', 'triangular'])
  })

  it('returns 5 distributions in history mode with bootstrap', () => {
    const dists = getVisibleDistributions('history', true)
    expect(dists).toHaveLength(5)
    expect(dists).toEqual(['truncatedNormal', 'lognormal', 'gamma', 'triangular', 'bootstrap'])
  })

  it('history mode never includes uniform', () => {
    const dists = getVisibleDistributions('history', true)
    expect(dists).toContain('triangular')
    expect(dists).not.toContain('uniform')
  })

  it('both modes always include T-Normal, Lognormal, Gamma, and Triangular', () => {
    for (const mode of ['history', 'subjective'] as const) {
      const dists = getVisibleDistributions(mode, false)
      expect(dists).toContain('truncatedNormal')
      expect(dists).toContain('lognormal')
      expect(dists).toContain('gamma')
      expect(dists).toContain('triangular')
    }
  })
})
