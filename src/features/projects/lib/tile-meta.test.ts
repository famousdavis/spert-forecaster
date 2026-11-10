// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The dashboard tile's meta lines (v0.49.0, D14). Expected dates are written out, not computed
// with the resolver here, so a change to how the tile finds its last sprint cannot move the test
// with it. The rule under test: "Last sprint ended" never disagrees with Sprint History's last
// row, so wherever that row carries a warning (a refused date, a date past 9999-12-31) the tile
// says nothing about it, and the tile renders with any stored date.

import { describe, it, expect } from 'vitest'
import type { Project, Sprint } from '@/shared/types'
import { summarizeSprints, tileMetaLines } from './tile-meta'

const T = '2026-01-01T00:00:00.000Z'
const project = (extra: Partial<Project> = {}): Project => ({
  id: 'p',
  name: 'Alpha',
  unitOfMeasure: 'story points',
  createdAt: T,
  updatedAt: T,
  ...extra,
})
const sprint = (n: number, extra: Partial<Sprint> = {}): Sprint => ({
  id: `s${n}`,
  projectId: 'p',
  sprintNumber: n,
  sprintStartDate: '2025-01-06',
  sprintFinishDate: '2025-01-17',
  doneValue: 10,
  includedInForecast: true,
  createdAt: T,
  updatedAt: T,
  ...extra,
})
const lines = (p: Project, sprints: Sprint[]) => tileMetaLines(p, summarizeSprints(p, sprints))

// First sprint Monday 2026-01-05, two-week cadence: sprints 1–3 finish Jan 16, Jan 30 and Feb 13
// (read from `resolveAllSprintDates` once and written down). Their STORED finishes are a year
// earlier on purpose, so a tile reading the stored finish instead of the resolved one fails.
const SCHEDULED = project({ firstSprintStartDate: '2026-01-05', sprintCadenceWeeks: 2 })

describe('line 1: count, cadence, unit', () => {
  it.each([
    ['no sprints', [], 'No sprints yet · 2-week cadence · story points'],
    ['one sprint', [sprint(1)], '1 sprint · 2-week cadence · story points'],
    ['three sprints', [sprint(1), sprint(2), sprint(3)], '3 sprints · 2-week cadence · story points'],
  ])('%s → %s', (_label, sprints, expected) => {
    expect(lines(SCHEDULED, sprints)[0]).toBe(expected)
  })

  it('counts every recorded sprint, included in the forecast or not (known-bad: counting only the included)', () => {
    expect(lines(SCHEDULED, [sprint(1), sprint(2, { includedInForecast: false })])[0]).toBe(
      '2 sprints · 2-week cadence · story points',
    )
  })

  it('leaves the cadence out when it is unset', () => {
    expect(lines(project(), [])).toEqual(['No sprints yet · story points'])
  })
})

describe('line 2: "Last sprint ended", as Sprint History\'s last row shows it', () => {
  it('the resolved finish of the last sprint, not its stored one (known-bad: stored finish)', () => {
    expect(lines(SCHEDULED, [sprint(1), sprint(2), sprint(3)])[1]).toBe('Last sprint ended Feb 13, 2026')
  })

  it('the last sprint is the highest sprintNumber, not the last in the array (known-bad: array order)', () => {
    expect(lines(SCHEDULED, [sprint(3), sprint(1), sprint(2)])[1]).toBe('Last sprint ended Feb 13, 2026')
  })

  it('a custom finish on the last sprint is the one shown', () => {
    expect(lines(SCHEDULED, [sprint(1), sprint(2, { customFinishDate: '2026-02-04' })])[1]).toBe(
      'Last sprint ended Feb 4, 2026',
    )
  })

  it.each([
    ['the cadence unset', project({ firstSprintStartDate: '2026-01-05' })],
    ['the first sprint date missing', project({ sprintCadenceWeeks: 2 })],
    ['the first sprint date refused', project({ firstSprintStartDate: '2026-02-30', sprintCadenceWeeks: 2 })],
  ])('with %s, the row shows the stored finish, and so does the tile', (_label, p) => {
    expect(lines(p, [sprint(1), sprint(2, { sprintFinishDate: '2025-03-14' })])[1]).toBe('Last sprint ended Mar 14, 2025')
  })

  it.each([
    ['a refused stored finish, no schedule', project(), { sprintFinishDate: '2025-02-30' }],
    ['a refused stored start, no schedule', project(), { sprintStartDate: '2025-13-01' }],
    ['a refused stored finish, with a schedule', SCHEDULED, { sprintFinishDate: '2025-02-30' }],
    ['a refused custom finish', SCHEDULED, { customFinishDate: '2026-02-30' }],
  ])('%s: the row carries a warning, so the tile says nothing of it, and still renders', (_label, p, bad) => {
    const out = lines(p, [sprint(1), sprint(2, bad)])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/^2 sprints · /)
    // Control: the same sprints with good dates do get the line.
    expect(lines(p, [sprint(1), sprint(2)])[1]).toMatch(/^Last sprint ended /)
  })

  it('a resolved date past 9999-12-31 is past the limit: no line (the row warns)', () => {
    // From 9999-11-01 at four weeks, sprint 3 finishes in the year 10000.
    const far = project({ firstSprintStartDate: '9999-11-01', sprintCadenceWeeks: 4 })
    expect(lines(far, [sprint(1), sprint(2), sprint(3)])).toEqual(['3 sprints · 4-week cadence · story points'])
    // Control: two sprints still end inside the limit, and the line shows.
    expect(lines(far, [sprint(1), sprint(2)])[1]).toBe('Last sprint ended Dec 24, 9999')
  })

  it('no sprints: no "Last sprint ended"', () => {
    expect(lines(SCHEDULED, [])).toEqual(['No sprints yet · 2-week cadence · story points'])
  })
})

describe('line 2: "Finish:", only for a valid project finish date', () => {
  it.each([
    ['unset', undefined, ['No sprints yet · story points']],
    ['valid', '2026-12-18', ['No sprints yet · story points', 'Finish: Dec 18, 2026']],
    ['refused (V8 rolls it to Mar 2; Safari prints Invalid Date)', '2026-02-30', ['No sprints yet · story points']],
    ['refused (year 10000)', '+010000-01-01', ['No sprints yet · story points']],
  ])('%s', (_label, projectFinishDate, expected) => {
    expect(lines(project({ projectFinishDate }), [])).toEqual(expected)
  })

  it('both parts, joined', () => {
    expect(lines({ ...SCHEDULED, projectFinishDate: '2026-12-18' }, [sprint(1)])[1]).toBe(
      'Last sprint ended Jan 16, 2026 · Finish: Dec 18, 2026',
    )
  })
})
