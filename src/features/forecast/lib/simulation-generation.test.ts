// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { currentSimulationGeneration, bumpSimulationGeneration } from './simulation-generation'

// The counter is module-level state. These tests assert behavior relative to
// the prior reading rather than absolute values, so order-of-execution and
// interleaving with the useForecastState integration test don't matter.

describe('simulation-generation', () => {
  it('bumpSimulationGeneration increments the counter by 1', () => {
    const before = currentSimulationGeneration()
    bumpSimulationGeneration()
    expect(currentSimulationGeneration()).toBe(before + 1)
  })

  it('multiple bumps each increment by 1', () => {
    const before = currentSimulationGeneration()
    bumpSimulationGeneration()
    bumpSimulationGeneration()
    expect(currentSimulationGeneration()).toBe(before + 2)
  })
})
