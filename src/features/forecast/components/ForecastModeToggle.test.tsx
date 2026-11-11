// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The History button is enabled exactly where History may be chosen (historyModeAvailable),
// the predicate that also decides whether a project starts in History (v0.50.7). Before this
// file nothing pinned the button's disabled states.
//
// ⚠️ TooltipProvider is required: HelpTooltip throws without it.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ForecastModeToggle } from './ForecastModeToggle'

afterEach(cleanup)

function historyButton(includedSprintCount: number, calculatedStdDev: number) {
  render(
    <TooltipProvider>
      <ForecastModeToggle
        mode="subjective"
        onModeChange={() => {}}
        includedSprintCount={includedSprintCount}
        calculatedStdDev={calculatedStdDev}
      />
    </TooltipProvider>,
  )
  const b = screen.getByRole('button', { name: 'History' }) as HTMLButtonElement
  return [b.disabled, b.title]
}

describe('the History button', () => {
  it.each([
    [1, 5, [true, 'Need 2+ sprints for history mode']],
    [2, 5, [false, 'Forecast from sprint history']],
    [2, 0, [true, 'Sprints have identical velocity — use Subjective mode to express uncertainty']],
    [5, 0, [true, 'Sprints have identical velocity — use Subjective mode to express uncertainty']],
    [5, 0.01, [false, 'Forecast from sprint history']],
  ] as const)('%i included sprints, SD %d → [disabled, title] %j', (count, sd, expected) => {
    expect(historyButton(count, sd)).toEqual(expected)
  })
})
