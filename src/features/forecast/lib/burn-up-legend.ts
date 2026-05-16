// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Burn-up chart legend payload builder.
//
// Recharts' default <Legend> auto-collects entries from rendered children and
// orders them alphabetically — which reads as random to users scanning the
// chart left-to-right. This builder produces an explicit payload in the order
// users actually scan:
//
//   1. Scope    (omitted if showScopeLine === false)
//   2. Done
//   3..5. Forecast lines, sorted by ASCENDING percentile
//
// The ascending-percentile order matches the chart's left-to-right line order:
// lower percentile = earlier projected completion date = leftmost dashed line.
// The user's chosen labels stay attached to their lines — only the *order* of
// the legend entries is normalized.

import type { BurnUpConfig } from '../types'

export interface LegendPayloadItem {
  id: string
  value: string
  type: 'line' | 'plainline'
  color: string
  payload?: { strokeDasharray?: string }
}

export function buildBurnUpLegendPayload(
  config: BurnUpConfig,
  backlogColor: string,
  doneColor: string,
): LegendPayloadItem[] {
  const items: LegendPayloadItem[] = []

  if (config.showScopeLine !== false) {
    items.push({ id: 'scope', value: 'Scope', type: 'line', color: backlogColor })
  }

  items.push({ id: 'done', value: 'Done', type: 'line', color: doneColor })

  const sortedLines = [...config.lines].sort((a, b) => a.percentile - b.percentile)
  sortedLines.forEach((line, idx) => {
    items.push({
      id: `forecast-${idx}`,
      value: line.label,
      type: 'plainline',
      color: line.color,
      payload: { strokeDasharray: '6 4' },
    })
  })

  return items
}
