// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { buildBurnUpLegendPayload } from './burn-up-legend'
import type { BurnUpConfig } from '../types'

const BACKLOG = '#000001'
const DONE = '#000002'

function makeConfig(overrides: Partial<BurnUpConfig> = {}): BurnUpConfig {
  return {
    distribution: 'truncatedNormal',
    lines: [
      { label: 'Optimistic', percentile: 10, color: '#aaa' },
      { label: 'Expected', percentile: 50, color: '#bbb' },
      { label: 'Conservative', percentile: 90, color: '#ccc' },
    ],
    showScopeLine: true,
    ...overrides,
  }
}

describe('buildBurnUpLegendPayload', () => {
  it('produces Scope, Done, then forecast lines ascending by percentile for the defaults', () => {
    const payload = buildBurnUpLegendPayload(makeConfig(), BACKLOG, DONE)
    expect(payload.map((p) => p.value)).toEqual(['Scope', 'Done', 'Optimistic', 'Expected', 'Conservative'])
  })

  it('re-orders into ascending percentile even when config.lines is given in non-ascending order', () => {
    const payload = buildBurnUpLegendPayload(
      makeConfig({
        lines: [
          { label: 'Conservative', percentile: 90, color: '#ccc' },
          { label: 'Expected', percentile: 50, color: '#bbb' },
          { label: 'Optimistic', percentile: 10, color: '#aaa' },
        ],
      }),
      BACKLOG,
      DONE,
    )
    expect(payload.map((p) => p.value)).toEqual(['Scope', 'Done', 'Optimistic', 'Expected', 'Conservative'])
  })

  it('uses the user-supplied labels at the user-supplied percentiles', () => {
    // Custom percentiles P50/P75/P95 with custom labels — labels stay attached to
    // their lines, ordering follows the new percentiles ascending.
    const payload = buildBurnUpLegendPayload(
      makeConfig({
        lines: [
          { label: 'Stretch', percentile: 95, color: '#ccc' },
          { label: 'Plan', percentile: 75, color: '#bbb' },
          { label: 'Aggressive', percentile: 50, color: '#aaa' },
        ],
      }),
      BACKLOG,
      DONE,
    )
    expect(payload.map((p) => p.value)).toEqual(['Scope', 'Done', 'Aggressive', 'Plan', 'Stretch'])
  })

  it('omits Scope when config.showScopeLine === false', () => {
    const payload = buildBurnUpLegendPayload(makeConfig({ showScopeLine: false }), BACKLOG, DONE)
    expect(payload.map((p) => p.value)).toEqual(['Done', 'Optimistic', 'Expected', 'Conservative'])
  })

  it('includes Scope when showScopeLine is undefined (default-on behavior)', () => {
    const config = makeConfig()
    delete config.showScopeLine
    const payload = buildBurnUpLegendPayload(config, BACKLOG, DONE)
    expect(payload[0].value).toBe('Scope')
  })

  it('attaches backlog and done colors to Scope and Done entries', () => {
    const payload = buildBurnUpLegendPayload(makeConfig(), BACKLOG, DONE)
    expect(payload[0]).toMatchObject({ id: 'scope', color: BACKLOG, type: 'line' })
    expect(payload[1]).toMatchObject({ id: 'done', color: DONE, type: 'line' })
  })

  it('marks forecast entries as dashed plainlines with the line color', () => {
    const payload = buildBurnUpLegendPayload(makeConfig(), BACKLOG, DONE)
    const forecastEntries = payload.slice(2)
    forecastEntries.forEach((entry) => {
      expect(entry.type).toBe('plainline')
      expect(entry.payload?.strokeDasharray).toBe('6 4')
    })
    expect(forecastEntries.map((e) => e.color)).toEqual(['#aaa', '#bbb', '#ccc'])
  })

  it('does not mutate the input config.lines array', () => {
    const config = makeConfig({
      lines: [
        { label: 'Conservative', percentile: 90, color: '#ccc' },
        { label: 'Expected', percentile: 50, color: '#bbb' },
        { label: 'Optimistic', percentile: 10, color: '#aaa' },
      ],
    })
    const before = config.lines.map((l) => l.label)
    buildBurnUpLegendPayload(config, BACKLOG, DONE)
    expect(config.lines.map((l) => l.label)).toEqual(before)
  })
})
