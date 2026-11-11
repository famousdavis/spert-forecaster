// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The forecast mode and the inputs each mode reads (v0.50.7).
//
// 1. Velocity and Variability overrides are History inputs. Until v0.50.7 they won in Subjective
//    too, ahead of the estimate and its CV, while Reset overrides is offered in History only.
// 2. A project with no stored mode starts in History only where History may be chosen: 5+
//    included sprints AND a standard deviation above 0. Until v0.50.7 five identical velocities
//    started in History at SD 0, which the History button refuses.
//
// ⚠️ Every number is distinct, so a value names the input it came from: calculated mean 30 /
// SD 6, override 50 / 2, estimate 20, CV 0.25.

import { describe, it, expect } from 'vitest'
import {
  deriveForecastInputs,
  historyModeAvailable,
  resolveForecastMode,
} from './forecast-derivations'
import type { ForecastInputs, VelocityStats } from '@/shared/types'

const STATS: VelocityStats = { count: 6, mean: 30, standardDeviation: 6 }
const OVERRIDES: ForecastInputs = { velocityMean: '50', velocityStdDev: '2' } as ForecastInputs

const derive = (stored: Partial<ForecastInputs> | undefined, stats: VelocityStats = STATS) =>
  deriveForecastInputs(undefined, stored as ForecastInputs | undefined, stats, stats.count, [])
const meanSd = (d: ReturnType<typeof derive>) => [d.resolvedMode, d.effectiveMean, d.effectiveStdDev]

describe('overrides typed in History do not apply in Subjective', () => {
  it('Subjective with an estimate: the estimate and its CV, not the overrides (known-bad: [subjective, 50, 2])', () => {
    expect(meanSd(derive({ ...OVERRIDES, forecastMode: 'subjective', velocityEstimate: '20', selectedCV: 0.25 })))
      .toEqual(['subjective', 20, 5])
  })

  it('Subjective with no estimate: seeded from the calculated mean, not the override (known-bad: [subjective, 50, 2])', () => {
    expect(meanSd(derive({ ...OVERRIDES, forecastMode: 'subjective', selectedCV: 0.25 })))
      .toEqual(['subjective', 30, 7.5])
  })

  it('only one override set: still ignored in Subjective (known-bads: mean override kept; SD override kept)', () => {
    expect([
      meanSd(derive({ velocityMean: '50', forecastMode: 'subjective', velocityEstimate: '20', selectedCV: 0.25 })),
      meanSd(derive({ velocityStdDev: '2', forecastMode: 'subjective', velocityEstimate: '20', selectedCV: 0.25 })),
    ]).toEqual([['subjective', 20, 5], ['subjective', 20, 5]])
  })

  it('the overrides stay stored, and apply again in History (control)', () => {
    const d = derive({ ...OVERRIDES, forecastMode: 'history', velocityEstimate: '20', selectedCV: 0.25 })
    expect([...meanSd(d), d.velocityMean, d.velocityStdDev]).toEqual(['history', 50, 2, '50', '2'])
  })

  it('History with no override: the calculated values and the multiplier (control)', () => {
    expect(meanSd(derive({ forecastMode: 'history', volatilityMultiplier: 1.5 }))).toEqual(['history', 30, 9])
  })

  it('auto-detected Subjective ignores them too (known-bad: [subjective, 50, 2])', () => {
    const fewSprints: VelocityStats = { count: 3, mean: 30, standardDeviation: 6 }
    expect(meanSd(derive({ ...OVERRIDES, velocityEstimate: '20', selectedCV: 0.25 }, fewSprints)))
      .toEqual(['subjective', 20, 5])
  })
})

describe('the starting mode follows the History button', () => {
  it('5 included sprints, all the same velocity: starts in Subjective, at the sprint mean × the default CV (known-bad: [history, 20, 0])', () => {
    expect(meanSd(derive(undefined, { count: 5, mean: 20, standardDeviation: 0 }))).toEqual(['subjective', 20, 7])
  })

  it('5 included sprints that vary: starts in History (control)', () => {
    expect(meanSd(derive(undefined, { count: 5, mean: 20, standardDeviation: 4 }))).toEqual(['history', 20, 4])
  })

  it.each([
    // [stored, count, sd, resolved]
    [undefined, 5, 0, 'subjective'],
    [undefined, 12, 0, 'subjective'],
    [undefined, 5, 0.01, 'history'],
    [undefined, 4, 3, 'subjective'],
    [undefined, 0, 0, 'subjective'],
    // A choice the user made is kept, even where History is no longer available.
    ['history', 5, 0, 'history'],
    ['history', 1, 0, 'history'],
    ['subjective', 9, 3, 'subjective'],
  ] as const)('stored %s, %i sprints, SD %d → %s', (stored, count, sd, resolved) => {
    expect(resolveForecastMode(stored, count, sd)).toBe(resolved)
  })

  it.each([
    [1, 5, false],
    [2, 5, true],
    [2, 0, false],
    [5, 0, false],
    [5, 0.01, true],
  ] as const)('History may be chosen: %i sprints, SD %d → %s', (count, sd, available) => {
    expect(historyModeAvailable(count, sd)).toBe(available)
  })
})
