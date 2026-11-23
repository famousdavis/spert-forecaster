// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { projectViewHeading } from './screen-heading'

// The h1 of Sprint History and Forecast (FRAME26 OP2, v0.52.0): the viewed project's name, else the tab's own name.
describe('projectViewHeading', () => {
  it('is the viewed project’s name, whole (the row ellipsises it; the full name also goes in title)', () => {
    expect(projectViewHeading('forecast', 'Sample: Mobile App Launch')).toBe('Sample: Mobile App Launch')
    expect(projectViewHeading('sprint-history', 'A very long project name '.repeat(8))).toBe('A very long project name '.repeat(8))
  })

  it('falls back to the tab’s own name with no project to name, or a blank one', () => {
    expect([projectViewHeading('sprint-history', undefined), projectViewHeading('forecast', undefined)]).toEqual(['Sprint History', 'Forecast'])
    expect([projectViewHeading('sprint-history', ''), projectViewHeading('forecast', '   ')]).toEqual(['Sprint History', 'Forecast'])
  })
})
