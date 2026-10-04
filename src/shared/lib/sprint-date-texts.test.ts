// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The owner-approved texts for a bad stored sprint date, pinned verbatim
 * (Brief 38 PR C: DESIGN v3 §4 and its amendments A5–A8). A change here is a
 * change to approved wording.
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedDateSpill } from './dates'
import {
  ADD_TITLE_FIRST_DATE,
  aiBlockedStatusReason,
  firstDateNotice,
  forecastBlockedNotice,
  forecastBlockedReason,
  formAssumptionNote,
  formCausesSpillNote,
  formInsideSpillNote,
  formSavedCustomNote,
  formSavedFieldsNote,
  groupBySprint,
  sprintSet,
  spillFix,
  spillSentence,
  storedDatesNotice,
  type NoticeContext,
  type SprintProblem,
} from './sprint-date-texts'

const Y = '9999-12-31'
const spill = (sprintNumber: number | null, spilledSprints: number[], causes: Array<[number, string]>): ResolvedDateSpill =>
  ({ sprintNumber, spilledSprints, causes: causes.map(([n, finishDate]) => ({ sprintNumber: n, finishDate })) })

const ctx = (over: Partial<NoticeContext> = {}): NoticeContext => ({
  scheduleUsable: true,
  firstDateRefused: false,
  standardFinish: () => '2026-02-13',
  ownDatesPastMax: () => false,
  spill: null,
  ...over,
})
const custom = (n: number, v = '20276-09-04'): SprintProblem => ({ sprintNumber: n, customValue: v, savedFinish: v })
const savedStart = (n: number, v = '+020276-09-05'): SprintProblem => ({ sprintNumber: n, savedStart: v })

describe('§4.1 Sprint History — one sprint', () => {
  it('A: a refused custom finish date, schedule usable', () => {
    expect(storedDatesNotice([custom(3)], ctx())).toEqual([
      'Sprint 3\'s finish date "20276-09-04" isn\'t a valid date.',
      'Until it\'s fixed, sprint 3 counts as ending on its standard date, February 13, 2026, and this project can\'t be forecast.',
      'If you can edit this project, click Edit sprint at the end of sprint 3\'s row, then choose the right date or click Reset. Otherwise, ask its owner to fix it.',
    ])
  })

  it('A6: a refused custom date on a sprint inside a spill — conditional fix, no standard date', () => {
    const inside = ctx({ ownDatesPastMax: (n) => n === 3, spill: spill(3, [3, 4], [[2, Y]]), standardFinish: () => '+010000-01-14' })
    expect(storedDatesNotice([custom(3)], inside)).toEqual([
      'Sprint 3\'s finish date "20276-09-04" isn\'t a valid date.',
      'If you can edit this project, first make sprint 2\'s finish date earlier, then open sprint 3 and choose the right date or click Reset. Otherwise, ask its owner to fix it.',
    ])
  })

  it('B: refused saved fields, not inside a spill, and its heading variants', () => {
    expect(storedDatesNotice([savedStart(2)], ctx())).toEqual([
      'Sprint 2\'s saved start date "+020276-09-05" isn\'t a valid date.',
      'The app doesn\'t use the saved value.',
      'If you can edit this project, click Edit sprint at the end of sprint 2\'s row, then click Update to save the dates shown. Otherwise, ask its owner to fix it.',
    ])
    expect(storedDatesNotice([{ sprintNumber: 2, savedFinish: 'x' }], ctx())![0]).toBe('Sprint 2\'s saved finish date "x" isn\'t a valid date.')
    expect(storedDatesNotice([{ sprintNumber: 2, savedStart: 'a', savedFinish: 'b' }], ctx())![0])
      .toBe('Sprint 2\'s saved start date "a" and finish date "b" aren\'t valid dates.')
  })

  it('B′: refused saved fields inside a spill — the conditional clause, with its variants', () => {
    const one = ctx({ ownDatesPastMax: () => true, spill: spill(3, [3], [[2, Y], [3, Y]]) })
    expect(storedDatesNotice([savedStart(3, '+010000-01-03')], one)).toEqual([
      'Sprint 3\'s saved start date "+010000-01-03" isn\'t a valid date.',
      'The app doesn\'t use the saved value.',
      'If you can edit this project, first make sprint 2\'s finish date earlier, then open sprint 3 and click Update. Otherwise, ask its owner to fix it.',
    ])
    const two = ctx({ ownDatesPastMax: () => true, spill: spill(4, [4], [[2, Y], [3, Y], [4, Y]]) })
    expect(storedDatesNotice([savedStart(4)], two)![2]).toContain('first make the finish dates of sprints 2 and 3 earlier, then open sprint 4')
    const none = ctx({ ownDatesPastMax: () => true, spill: spill(2, [2], []) })
    expect(storedDatesNotice([savedStart(2)], none)![2]).toContain('first correct the schedule (see below), then open sprint 2 and click Update')
  })

  it('B, not B′, when only the forecast start spills: the sprint\'s own dates are valid', () => {
    const forecastOnly = ctx({ ownDatesPastMax: () => false, spill: spill(null, [], [[3, Y]]) })
    expect(storedDatesNotice([savedStart(3, '+010000-01-03')], forecastOnly)![2]).toContain('then click Update to save the dates shown')
  })
})

describe('§4.1C Sprint History — several sprints', () => {
  it('schedule usable: the forecast line, one line per sprint, then the closing', () => {
    expect(storedDatesNotice([custom(3), savedStart(5)], ctx())).toEqual([
      'Some sprint dates aren\'t valid dates.',
      'Until sprint 3\'s finish date is fixed, this project can\'t be forecast.',
      'Sprint 3 — finish date "20276-09-04" isn\'t a valid date: choose the right date or click Reset.',
      'Sprint 5 — saved start date "+020276-09-05" isn\'t a valid date: click Update to save the dates shown.',
      'If you can edit this project, use Edit sprint at the end of each row. Otherwise, ask its owner to fix it.',
    ])
  })

  it('the plural forecast line, and the inside-spill lines (B′ and A6)', () => {
    const inside = ctx({ ownDatesPastMax: (n) => n >= 5, spill: spill(5, [5, 6], [[4, Y]]) })
    const lines = storedDatesNotice([custom(3), custom(5), savedStart(6)], inside)!
    expect(lines[1]).toBe('Until the finish dates of sprints 3 and 5 are fixed, this project can\'t be forecast.')
    expect(lines[3]).toBe('Sprint 5 — finish date "20276-09-04" isn\'t a valid date: first make sprint 4\'s finish date earlier, then open sprint 5 and choose the right date or click Reset.')
    expect(lines[4]).toBe('Sprint 6 — saved start date "+020276-09-05" isn\'t a valid date: first make sprint 4\'s finish date earlier, then open sprint 6 and click Update.')
  })

  it('counts distinct sprints, however many of a sprint\'s fields are refused', () => {
    const problems = groupBySprint([
      { sprintId: 's3', sprintNumber: 3, field: 'sprintFinishDate', value: 'a' },
      { sprintId: 's3', sprintNumber: 3, field: 'customFinishDate', value: 'a' },
    ])
    expect(problems).toEqual([{ sprintNumber: 3, savedFinish: 'a', customValue: 'a' }])
    expect(storedDatesNotice(problems, ctx())![0]).toBe('Sprint 3\'s finish date "a" isn\'t a valid date.')
  })
})

describe('§4.1E no-schedule mode, §4.1F–G the first date', () => {
  const noSchedule = ctx({ scheduleUsable: false })

  it('E, one sprint (with N5\'s "delete them, latest first")', () => {
    expect(storedDatesNotice([custom(3)], noSchedule)).toEqual([
      'Sprint 3\'s finish date "20276-09-04" isn\'t a valid date.',
      'Sprint dates can\'t be worked out or edited until this project has a sprint cadence and a valid first sprint start date.',
      'If you can edit this project, set them in Sprint Configuration above; they can be changed only while the project has no sprints (delete them, latest first). Otherwise, ask its owner to fix it.',
    ])
  })

  it('E, several sprints', () => {
    expect(storedDatesNotice([{ sprintNumber: 2, customValue: '20276-09-04' }, savedStart(4)], noSchedule)!.slice(0, 3)).toEqual([
      'Some sprint dates aren\'t valid dates.',
      'Sprint 2 — finish date "20276-09-04" isn\'t a valid date.',
      'Sprint 4 — saved start date "+020276-09-05" isn\'t a valid date.',
    ])
  })

  it('E, with a refused first date: the one-line variants', () => {
    const refused = ctx({ scheduleUsable: false, firstDateRefused: true })
    expect(storedDatesNotice([custom(3)], refused)![1]).toBe('It can be corrected once the first sprint start date is valid.')
    expect(storedDatesNotice([custom(3), custom(5)], refused)!.at(-1)).toBe('They can be corrected once the first sprint start date is valid.')
  })

  it('F, with sprints and without; G, the Add Sprint title', () => {
    expect(firstDateNotice('20276-01-05', true)).toEqual([
      'This project\'s first sprint start date, "20276-01-05", isn\'t a valid date.',
      'Until it\'s corrected, sprint dates can\'t be worked out, sprints can\'t be added or edited, and this project can\'t be forecast.',
      'If you can edit this project, it can be changed in Sprint Configuration above only while the project has no sprints (delete them, latest first). Otherwise, ask its owner to fix it.',
    ])
    expect(firstDateNotice('20276-01-05', false)).toEqual([
      'This project\'s first sprint start date, "20276-01-05", isn\'t a valid date.',
      'If you can edit this project, choose a valid date in Sprint Configuration above. Otherwise, ask its owner to fix it.',
    ])
    expect(ADD_TITLE_FIRST_DATE).toBe('The first sprint start date isn\'t a valid date')
  })
})

describe('§4.2 year 9999 — the spill (A5: exactly the spilled sprints; A7: a spilled cause)', () => {
  it('A: one cause, with the subject naming exactly the spilled sprints', () => {
    expect(spillSentence(spill(4, [4, 5, 6, 7, 8], [[3, Y]]), 8, '2026-01-05'))
      .toBe('Sprints 4–8 would run past December 31, 9999, the latest date this app accepts, because sprint 3 finishes on December 31, 9999.')
    expect(spillSentence(spill(4, [4, 5, 6], [[3, Y]]), 8, '2026-01-05'))
      .toBe('Sprints 4–6 would run past December 31, 9999, the latest date this app accepts, because sprint 3 finishes on December 31, 9999.')
    expect(spillSentence(spill(3, [3, 5, 6], [[2, Y]]), 8, '2026-01-05')).toMatch(/^Sprints 3 and 5–6 would run past/)
    expect(spillSentence(spill(3, [3], [[2, Y]]), 8, '2026-01-05')).toMatch(/^Sprint 3 would run past/)
    expect(spillSentence(spill(null, [], [[8, Y]]), 8, '2026-01-05'))
      .toBe('The sprint after sprint 8 would start after December 31, 9999, the latest date this app accepts, because sprint 8 finishes on December 31, 9999.')
    expect(spillFix(spill(4, [4], [[3, Y]])))
      .toBe('If you can edit this project, choose an earlier finish date for sprint 3 (Edit sprint at the end of its row). Otherwise, ask its owner to fix it.')
  })

  it('A7: the stuck shape — a cause is itself a spilled sprint', () => {
    const stuck = spill(3, [3], [[2, Y], [3, Y]])
    expect(spillSentence(stuck, 3, '2026-01-05')).toBe(
      'Sprint 3 would start after December 31, 9999, the latest date this app accepts, because sprint 2 finishes on that date, and the sprint after it would too, because sprint 3 does.'
    )
    expect(spillFix(stuck))
      .toBe('If you can edit this project, choose an earlier finish date for sprints 2 and 3 (Edit sprint at the end of each row). Otherwise, ask its owner to fix it.')
  })

  it('B: several causes, none spilled — the general form, with per-cause dates when they differ', () => {
    expect(spillSentence(spill(4, [4, 5], [[2, '9999-11-26'], [3, Y]]), 5, '2026-01-05'))
      .toBe('Sprints 4–5 would run past December 31, 9999, the latest date this app accepts, because sprint 2 finishes on November 26, 9999 and sprint 3 on December 31, 9999.')
  })

  it('C: no cause — the schedule itself runs past 9999', () => {
    const causeless = spill(null, [], [])
    expect(spillSentence(causeless, 2, '9999-12-06'))
      .toBe('The sprint after sprint 2 would start after December 31, 9999, the latest date this app accepts, because the first sprint starts on December 6, 9999.')
    expect(spillFix(causeless)).toBe(
      'If you can edit this project, delete its sprints (latest first), then choose an earlier first sprint start date in Sprint Configuration above: it can be changed only while the project has no sprints. Otherwise, ask its owner to fix it.'
    )
  })

  it('sprintSet: runs as ranges, runs joined with "and"', () => {
    expect([sprintSet([4]), sprintSet([4, 5, 6]), sprintSet([3, 5, 6]), sprintSet([1, 3, 5, 6, 8])])
      .toEqual(['4', '4–6', '3 and 5–6', '1, 3, 5–6 and 8'])
  })
})

describe('§4.3 the Forecast tab', () => {
  const customBlock = (ns: Array<[number, string]>) => ({ kind: 'custom-finish' as const, sprints: ns.map(([sprintNumber, value]) => ({ sprintNumber, value })) })
  const pastMax = (s: ResolvedDateSpill, first = '2026-01-05') => ({ kind: 'past-max' as const, spill: s, firstSprintStartDate: first })

  it('the reasons under Run Forecast', () => {
    expect(forecastBlockedReason(customBlock([[3, 'a']]))).toBe('Sprint 3\'s finish date needs fixing first.')
    expect(forecastBlockedReason(customBlock([[3, 'a'], [5, 'b']]))).toBe('Sprints 3 and 5 need their finish dates fixed first.')
    expect(forecastBlockedReason(pastMax(spill(4, [4], [[3, Y]])))).toBe('Sprint 3\'s finish date needs to be earlier first.')
    expect(forecastBlockedReason(pastMax(spill(3, [3], [[2, Y], [3, Y]])))).toBe('Sprints 2 and 3 need earlier finish dates first.')
    expect(forecastBlockedReason(pastMax(spill(null, [], [])))).toBe('The sprint schedule runs past the year 9999.')
    expect(forecastBlockedReason({ kind: 'first-date', value: '20276-01-05' })).toBe('The first sprint start date isn\'t a valid date.')
  })

  it('the notice in place of results, and its fix line', () => {
    expect(forecastBlockedNotice(customBlock([[3, '20276-09-04']]), 8)).toEqual([
      'This project can\'t be forecast until sprint 3\'s finish date is fixed. It\'s saved as "20276-09-04", which isn\'t a valid date.',
      'If you can edit this project, fix it on the Sprint History tab. Otherwise, ask its owner to fix it.',
    ])
    expect(forecastBlockedNotice(customBlock([[3, '20276-09-04'], [5, '2026-02-30']]), 8)).toEqual([
      'This project can\'t be forecast until the finish dates of sprints 3 and 5 are fixed. They\'re saved as "20276-09-04" and "2026-02-30", which aren\'t valid dates.',
      'If you can edit this project, fix them on the Sprint History tab. Otherwise, ask its owner to fix it.',
    ])
    expect(forecastBlockedNotice(pastMax(spill(4, [4, 5, 6, 7, 8], [[3, Y]])), 8)).toEqual([
      'This project can\'t be forecast. Sprints 4–8 would run past December 31, 9999, the latest date this app accepts, because sprint 3 finishes on December 31, 9999.',
      'If you can edit this project, choose an earlier finish date for sprint 3 on the Sprint History tab. Otherwise, ask its owner to fix it.',
    ])
    expect(forecastBlockedNotice(pastMax(spill(null, [], []), '9999-12-06'), 2)[1])
      .toBe('If you can edit this project, the Sprint History tab says how to correct the schedule. Otherwise, ask its owner to fix it.')
    expect(forecastBlockedNotice({ kind: 'first-date', value: '20276-01-05' }, 8)).toEqual([
      'This project can\'t be forecast because its first sprint start date, "20276-01-05", isn\'t a valid date, so its sprint dates can\'t be worked out.',
      'If you can edit this project, the Sprint History tab says how to correct it. Otherwise, ask its owner to fix it.',
    ])
  })
})

describe('§4.4 the AI snapshot statusReason', () => {
  const tail = ' No forecast results are carried while this lasts, even if an earlier forecast exists.'
  it('every variant, ending with the same sentence', () => {
    expect(aiBlockedStatusReason({ kind: 'custom-finish', sprints: [{ sprintNumber: 3, value: '20276-09-04' }] }, 8)).toBe(
      'Sprint 3\'s saved finish date, "20276-09-04", isn\'t a valid date, so the project can\'t be forecast until the user fixes it on the Sprint History tab, or asks the project\'s owner to.' + tail
    )
    expect(aiBlockedStatusReason({ kind: 'custom-finish', sprints: [{ sprintNumber: 3, value: '20276-09-04' }, { sprintNumber: 5, value: '2026-02-30' }] }, 8)).toBe(
      'The saved finish dates of sprints 3 and 5 ("20276-09-04", "2026-02-30") aren\'t valid dates, so the project can\'t be forecast until the user fixes them on the Sprint History tab, or asks the project\'s owner to.' + tail
    )
    expect(aiBlockedStatusReason({ kind: 'past-max', spill: spill(4, [4], [[3, Y]]), firstSprintStartDate: '2026-01-05' }, 4)).toBe(
      'Sprint 4 would run past December 31, 9999, the latest date this app accepts, because sprint 3 finishes on December 31, 9999. The project can\'t be forecast until the user chooses an earlier finish date for sprint 3 on the Sprint History tab.' + tail
    )
    expect(aiBlockedStatusReason({ kind: 'past-max', spill: spill(null, [], []), firstSprintStartDate: '9999-12-06' }, 2)).toBe(
      'The sprint after sprint 2 would start after December 31, 9999, the latest date this app accepts, because the first sprint starts on December 6, 9999. The project can\'t be forecast until its first sprint start date is moved earlier, which the app allows only while the project has no sprints.' + tail
    )
    expect(aiBlockedStatusReason({ kind: 'first-date', value: '20276-01-05' }, 8)).toBe(
      'The project\'s first sprint start date, "20276-01-05", isn\'t a valid date, so its sprint dates can\'t be worked out and it can\'t be forecast.' + tail
    )
  })
})

describe('§4.5 the Edit / Add form', () => {
  it('the saved-value notes and the assumption line', () => {
    expect(formSavedCustomNote('20276-09-04', '2026-02-13'))
      .toBe('The saved finish date, "20276-09-04", isn\'t a valid date. Choose a date, or click Reset to use the standard date, February 13, 2026.')
    expect(formSavedFieldsNote('+020276-09-05', undefined))
      .toBe('This sprint\'s saved start date, "+020276-09-05", isn\'t a valid date. Click Update to save the dates shown above.')
    expect(formSavedFieldsNote(undefined, 'x')).toBe('This sprint\'s saved finish date, "x", isn\'t a valid date. Click Update to save the dates shown above.')
    expect(formSavedFieldsNote('a', 'b')).toBe('This sprint\'s saved start date, "a", and finish date, "b", aren\'t valid dates. Click Update to save the dates shown above.')
    expect(formAssumptionNote(8, '2026-04-24'))
      .toBe('These dates assume sprint 8 ended on its standard date, April 24, 2026, because its saved finish date isn\'t valid.')
  })

  it('inside a spill: name the causes before this sprint, or say how the schedule is corrected', () => {
    expect(formInsideSpillNote(3, [{ sprintNumber: 2, finishDate: Y }], '2026-01-05'))
      .toBe('Sprint 3 would run past December 31, 9999, the latest date this app accepts, because sprint 2 finishes on December 31, 9999. Edit sprint 2 and choose an earlier finish date first.')
    expect(formInsideSpillNote(4, [{ sprintNumber: 2, finishDate: Y }, { sprintNumber: 3, finishDate: Y }], '2026-01-05'))
      .toBe('Sprint 4 would run past December 31, 9999, the latest date this app accepts, because sprints 2 and 3 finish on December 31, 9999. Edit sprints 2 and 3 and choose earlier finish dates first.')
    expect(formInsideSpillNote(3, [], '9999-12-06'))
      .toBe('Sprint 3 would run past December 31, 9999, the latest date this app accepts, because the first sprint starts on December 6, 9999. The note at the top of this tab says how to correct the schedule.')
  })

  it('an edit that causes or worsens a spill names exactly what it would spill', () => {
    expect(formCausesSpillNote(spill(4, [4, 5, 6, 7, 8], [[3, Y]]), 8))
      .toBe('With that finish date, sprints 4–8 would run past December 31, 9999, the latest date this app accepts. Choose an earlier date.')
    expect(formCausesSpillNote(spill(8, [8], [[7, Y]]), 8)).toBe('With that finish date, sprint 8 would run past December 31, 9999, the latest date this app accepts. Choose an earlier date.')
    expect(formCausesSpillNote(spill(null, [], [[4, Y]]), 4))
      .toBe('With that finish date, the sprint after sprint 4 would start after December 31, 9999, the latest date this app accepts. Choose an earlier date.')
  })
})
