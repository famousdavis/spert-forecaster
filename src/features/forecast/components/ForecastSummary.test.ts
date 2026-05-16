// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { buildSummaryText, buildMilestoneSummaryText, buildCompletedMilestoneText } from './ForecastSummary'

describe('buildSummaryText', () => {
  it('returns correct narrative for simple mode', () => {
    const text = buildSummaryText(
      'Project Alpha',
      150,
      'points',
      80,
      12,
      '2026-03-28',
      5,
      'T-Normal'
    )
    expect(text).toContain('80% chance')
    expect(text).toContain('Project Alpha')
    expect(text).toContain('150')
    expect(text).toContain('points')
    expect(text).toContain('Sprint 17') // 12 + 5
    expect(text).toContain('March 28, 2026')
    expect(text).toContain('T-Normal')
    expect(text).not.toContain('Scope growth')
  })

  it('includes calculated scope growth info when enabled', () => {
    const text = buildSummaryText(
      'Project Beta',
      200,
      'stories',
      90,
      15,
      '2026-06-15',
      3,
      'Lognorm',
      true,
      5.2,
      'calculated'
    )
    expect(text).toContain('90% chance')
    expect(text).toContain('Sprint 18') // 15 + 3
    expect(text).toContain('Scope growth of +5.2 stories/sprint is modeled (calculated)')
  })

  it('includes custom scope growth info when enabled', () => {
    const text = buildSummaryText(
      'Project Beta',
      200,
      'stories',
      90,
      15,
      '2026-06-15',
      3,
      'Lognorm',
      true,
      8.0,
      'custom'
    )
    expect(text).toContain('Scope growth of +8.0 stories/sprint is modeled (custom)')
  })

  it('handles negative scope growth (scope shrinking)', () => {
    const text = buildSummaryText(
      'Project',
      100,
      'pts',
      70,
      8,
      '2026-04-01',
      2,
      'Gamma',
      true,
      -3.5,
      'calculated'
    )
    expect(text).toContain('Scope growth of -3.5 pts/sprint is modeled (calculated)')
  })

  it('does not include scope growth when not enabled', () => {
    const text = buildSummaryText(
      'Project',
      100,
      'pts',
      80,
      10,
      '2026-05-01',
      0,
      'Bootstrap',
      false,
      5.0
    )
    expect(text).not.toContain('Scope growth')
  })

  it('formats large backlog numbers with commas', () => {
    const text = buildSummaryText(
      'Big Project',
      12500,
      'points',
      85,
      50,
      '2027-01-15',
      10,
      'T-Normal'
    )
    expect(text).toContain('12,500')
  })

  it('works with all distribution labels', () => {
    const labels = ['T-Normal', 'Lognorm', 'Gamma', 'Bootstrap', 'Triangular', 'Uniform']
    for (const label of labels) {
      const text = buildSummaryText('P', 100, 'pts', 80, 10, '2026-05-01', 0, label)
      expect(text).toContain(label)
    }
  })

  it('handles completedSprintCount = 0', () => {
    const text = buildSummaryText('P', 50, 'pts', 80, 5, '2026-03-01', 0, 'T-Normal')
    expect(text).toContain('Sprint 5')
  })

  it('handles sprintsRequired = 0', () => {
    const text = buildSummaryText('P', 0, 'pts', 80, 0, '2026-03-01', 3, 'T-Normal')
    expect(text).toContain('Sprint 3')
  })

  it('formats date across year boundary', () => {
    const text = buildSummaryText('P', 100, 'pts', 80, 10, '2027-01-15', 0, 'T-Normal')
    expect(text).toContain('January 15, 2027')
  })

  it('starts with "Using the" distribution phrase', () => {
    const text = buildSummaryText('P', 100, 'pts', 80, 10, '2026-05-01', 0, 'T-Normal')
    expect(text.startsWith('Using the ')).toBe(true)
  })

  it('uses "at least" framing to acknowledge sprint-quantization round-up', () => {
    const text = buildSummaryText('P', 100, 'pts', 80, 10, '2026-05-01', 0, 'T-Normal')
    expect(text).toContain('at least an 80% chance')
  })

  it('picks "a" for consonant-sound percentiles and "an" for vowel-sound percentiles', () => {
    expect(buildSummaryText('P', 100, 'pts', 90, 10, '2026-05-01', 0, 'T-Normal'))
      .toContain('at least a 90% chance')
    expect(buildSummaryText('P', 100, 'pts', 50, 10, '2026-05-01', 0, 'T-Normal'))
      .toContain('at least a 50% chance')
    expect(buildSummaryText('P', 100, 'pts', 85, 10, '2026-05-01', 0, 'T-Normal'))
      .toContain('at least an 85% chance')
    expect(buildSummaryText('P', 100, 'pts', 11, 10, '2026-05-01', 0, 'T-Normal'))
      .toContain('at least an 11% chance')
  })

  it('uses milestone name and incremental backlog when milestoneName is provided', () => {
    const text = buildSummaryText(
      'Sample: Mobile App Launch',
      150,
      'story points',
      80,
      4,
      '2026-03-12',
      0,
      'T-Normal',
      undefined, undefined, undefined,
      'MVP Release',
    )
    expect(text).toContain('Sample: Mobile App Launch will finish the 150 story points MVP Release')
    expect(text).not.toContain('backlog')
  })

  it('uses generic "backlog" subject when milestoneName is omitted', () => {
    const text = buildSummaryText('Project Alpha', 460, 'story points', 80, 10, '2026-06-26', 4, 'T-Normal')
    expect(text).toContain('Project Alpha will finish the 460 story points backlog')
  })
})

describe('buildCompletedMilestoneText', () => {
  it('returns "{name}: completed" — terse past-tense with no sprint or date', () => {
    // The system does not know *when* a milestone was completed; the user marks
    // completion by setting backlogSize to 0. Release-history lives in GanttApp.
    expect(buildCompletedMilestoneText('MVP Release')).toBe('MVP Release: completed')
  })

  it('handles milestone names with special characters', () => {
    expect(buildCompletedMilestoneText('Release v2.0 (GA)')).toBe('Release v2.0 (GA): completed')
  })
})

describe('buildMilestoneSummaryText', () => {
  it('returns correct milestone sentence', () => {
    const text = buildMilestoneSummaryText(
      'MVP',
      8,
      '2026-04-15',
      5
    )
    expect(text).toBe('MVP: Sprint 13 (April 15, 2026)')
  })

  it('handles zero completed sprints', () => {
    const text = buildMilestoneSummaryText(
      'Beta Release',
      12,
      '2026-06-01',
      0
    )
    expect(text).toBe('Beta Release: Sprint 12 (June 1, 2026)')
  })

  it('handles milestone names with special characters', () => {
    const text = buildMilestoneSummaryText(
      'Release v2.0 (GA)',
      10,
      '2026-07-15',
      5
    )
    expect(text).toContain('Release v2.0 (GA)')
    expect(text).toContain('Sprint 15')
  })
})
