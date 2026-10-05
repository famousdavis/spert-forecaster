// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Sprint History with a bad STORED sprint date (Brief 38 PR C). The tab must
 * render, mark every refused date raw, say how to fix it from this screen, and
 * let Edit fix it — never formatting a refused value (V8 prints "Invalid Date
 * NaN", JavaScriptCore a plausible false date, and a year-10000 date formats
 * without its year).
 *
 * ⚠️ Imports only modules that existed before PR C (see the fixture), so these
 * rows also run against the earlier tree and go red there per assertion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { SprintHistoryTab } from './SprintHistoryTab'
import { useProjectStore } from '@/shared/state/project-store'
import { checkExportedFile } from '@/shared/state/export-check'
import type { Project } from '@/shared/types'
import { FIVE_DIGIT, T, seedStores, storedSprint, type SeedName } from '@/shared/state/fixtures/bad-sprint-dates'

const setup = (name: SeedName, project?: Partial<Project>) => {
  seedStores(name, { project })
  render(<TooltipProvider><ErrorBoundary><SprintHistoryTab /></ErrorBoundary></TooltipProvider>)
}
const crashed = () => screen.queryByText('Something went wrong') !== null
const pageText = () => document.body.textContent ?? ''
const rowText = (k: number) =>
  screen.queryByRole('button', { name: `Edit Sprint ${k}` })?.closest('tr')?.querySelectorAll('td')[1]?.textContent ?? null
const noticeText = () => screen.queryByRole('status')?.textContent ?? ''
const formText = () => document.querySelector('form')?.textContent ?? ''
const openEdit = (k: number) => fireEvent.click(screen.getByRole('button', { name: `Edit Sprint ${k}` }))
const openAdd = () => fireEvent.click(screen.getByRole('button', { name: 'Add Sprint' }))
const submit = (name: 'Update' | 'Add') => screen.getByRole('button', { name }) as HTMLButtonElement
const setDone = (v: string) => fireEvent.change(document.getElementById('doneValue')!, { target: { value: v } })
const setFinish = (v: string) => fireEvent.change(document.getElementById('customFinishDate')!, { target: { value: v } })
/** What this app's own export check refuses, per refusal: the sprint it names (null when none). */
const exportRefusals = (): Array<number | null> => {
  const { projects, sprints } = useProjectStore.getState()
  const result = checkExportedFile(JSON.stringify({ version: '1.0', exportedAt: T, projects, sprints, _originRef: 'o', _storageRef: 'w' }))
  return result.ok ? [] : result.items.map((item) => ('sprintNumber' in item ? item.sprintNumber ?? null : null))
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('P13 (i) Sprint History renders, and marks every bad stored date raw', () => {
  it.each([
    ['a3', 3, FIVE_DIGIT], ['b3', 3, FIVE_DIGIT], ['c3', 3, '2026-02-30'], ['a8', 8, FIVE_DIGIT], ['f31_5', 5, '+020276-09-05'],
  ] as const)('%s: no boundary; sprint %s\'s row holds the raw value; nothing prints Invalid Date', (name, k, raw) => {
    setup(name)
    expect(crashed()).toBe(false)
    expect(rowText(k)).toContain(`"${raw}"`)
    expect(pageText()).not.toMatch(/Invalid Date|NaN/)
  })

  it('c3: sprint 3 never shows the rolled-over "March 2", and sprints 4–8 read as in the valid control', () => {
    setup('control')
    const control = [4, 5, 6, 7, 8].map(rowText)
    cleanup()
    setup('c3')
    expect(rowText(3)).not.toContain('March 2')
    expect([4, 5, 6, 7, 8].map(rowText)).toEqual(control)
  })

  it('no schedule (no first sprint date): the row is marked from the stored fields, raw', () => {
    setup('a3', { firstSprintStartDate: undefined })
    expect(rowText(3)).toContain(`"${FIVE_DIGIT}"`)
    expect(pageText()).not.toMatch(/Invalid Date|NaN/)
  })

  it('a state the Update merge produced (own undefined keys) marks nothing', () => {
    setup('merge')
    expect(screen.queryByRole('status')).toBeNull()
    expect(pageText()).not.toContain('⚠')
  })

  it('two bad sprints: exactly one notice line each, by distinct sprint', () => {
    setup('two_bad')
    expect(noticeText().match(/Sprint 3 —/g)).toHaveLength(1)
    expect(noticeText().match(/Sprint 5 —/g)).toHaveLength(1)
  })
})

describe('P13 (ii) Edit opens a bad sprint, and saving fixes it', () => {
  it.each(['a3', 'b3', 'c3'] as const)('%s: Edit sprint 3; the note quotes the value; Update disabled on open; a valid date fixes both fields', (name) => {
    setup(name)
    openEdit(3)
    expect(screen.getByText(/The saved finish date, ".+", isn't a valid date\. Choose a date, or click Reset to use the standard date, February 13, 2026\./)).toBeTruthy()
    expect(submit('Update').disabled).toBe(true)
    // The open form formats no refused value either.
    expect(formText()).not.toMatch(/Invalid Date|NaN|March 2/)
    setFinish('2026-02-16')
    expect(submit('Update').disabled).toBe(false)
    fireEvent.click(submit('Update'))
    expect([storedSprint(3).sprintFinishDate, storedSprint(3).customFinishDate]).toEqual(['2026-02-16', '2026-02-16'])
    expect(exportRefusals()).toEqual([])
  })

  it('f31_5: Edit sprint 5 says to click Update; Update, untouched, re-saves the dates shown', () => {
    setup('f31_5')
    openEdit(5)
    expect(screen.getByText(/Click Update to save the dates shown above/)).toBeTruthy()
    fireEvent.click(submit('Update'))
    expect([storedSprint(5).sprintStartDate, storedSprint(5).sprintFinishDate]).toEqual(['2026-03-02', '2026-03-13'])
    expect(exportRefusals()).toEqual([])
  })
})

describe('P13 (iii) Add, and year 9999 on Add and Edit (D15, D16)', () => {
  it('a8: Add opens, states its assumption, and stores valid dates', () => {
    setup('a8')
    openAdd()
    expect(crashed()).toBe(false)
    expect(screen.getByText('These dates assume sprint 8 ended on its standard date, April 24, 2026, because its saved finish date isn\'t valid.')).toBeTruthy()
    setDone('7')
    fireEvent.click(submit('Add'))
    expect([storedSprint(9).sprintStartDate, storedSprint(9).sprintFinishDate]).toEqual(['2026-04-27', '2026-05-08'])
  })

  it('y9999_last: Add is blocked, the text points at sprint 8, and the label quotes the year-10000 dates', () => {
    setup('y9999_last')
    openAdd()
    setDone('7')
    expect(submit('Add').disabled).toBe(true)
    expect(formText()).toContain('because sprint 8 finishes on December 31, 9999. Edit sprint 8 and choose an earlier finish date first.')
    expect(formText()).toContain('Sprint 9: "+010000-01-03" - "+010000-01-14" ⚠ past December 31, 9999')
  })

  it('y9999_mid: the Add label quotes the year-10000 dates, never a yearless range', () => {
    setup('y9999_mid')
    openAdd()
    expect(formText()).toContain('Sprint 9: "+010000-03-13" - "+010000-03-24" ⚠ past December 31, 9999')
    expect(formText()).not.toContain('March 13 - 24')
  })

  it('control: Edit sprint 3 to 9999-12-31 is blocked, naming exactly what it would spill', () => {
    setup('control')
    openEdit(3)
    setFinish('9999-12-31')
    expect(submit('Update').disabled).toBe(true)
    expect(formText()).toContain('With that finish date, sprints 4–8 would run past December 31, 9999, the latest date this app accepts. Choose an earlier date.')
  })
})

describe('D16: during a spill, an edit is blocked only when it causes or worsens it', () => {
  it('D16-1 y9999_mid: Edit sprint 1, change Done only: Update enabled, and it saves', () => {
    setup('y9999_mid')
    openEdit(1)
    setDone('99')
    expect(submit('Update').disabled).toBe(false)
    fireEvent.click(submit('Update'))
    expect(storedSprint(1).doneValue).toBe(99)
  })

  it('D16-2 y9999_last: Edit sprint 2, change Done only: Update enabled, and it saves', () => {
    setup('y9999_last')
    openEdit(2)
    setDone('77')
    expect(submit('Update').disabled).toBe(false)
    fireEvent.click(submit('Update'))
    expect(storedSprint(2).doneValue).toBe(77)
  })

  it('D16-3 y9999_mid: Edit sprint 2 to 9999-12-31 moves the spill earlier: blocked, naming sprints 3–8', () => {
    setup('y9999_mid')
    openEdit(2)
    setFinish('9999-12-31')
    expect(submit('Update').disabled).toBe(true)
    expect(formText()).toContain('With that finish date, sprints 3–8 would run past December 31, 9999')
  })

  it('D16-4 y9999_mid: Edit the cause (sprint 3) to 2026-02-16: it saves, and no notice remains', () => {
    setup('y9999_mid')
    openEdit(3)
    setFinish('2026-02-16')
    expect(submit('Update').disabled).toBe(false)
    fireEvent.click(submit('Update'))
    expect(storedSprint(3).customFinishDate).toBe('2026-02-16')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('the stuck shape: sprint 2 custom 9999-12-31; sprint 3 stored start +010000-01-03, custom 9999-12-31', () => {
  it('STUCK-1: the notice names both causes, and sprint 3\'s Update line is conditional', () => {
    setup('stuck')
    expect(noticeText()).toContain(
      'Sprint 3 would start after December 31, 9999, the latest date this app accepts, because sprint 2 finishes on that date, and the sprint after it would too, because sprint 3 does.'
    )
    expect(noticeText()).toContain('first make sprint 2\'s finish date earlier, then open sprint 3 and click Update')
    expect(noticeText()).not.toContain('click Update to save the dates shown')
  })

  it('STUCK-1: Edit sprint 3 is blocked until sprint 2 moves, and its label quotes the past-9999 start', () => {
    setup('stuck')
    openEdit(3)
    expect(submit('Update').disabled).toBe(true)
    expect(formText()).toContain('because sprint 2 finishes on December 31, 9999. Edit sprint 2 and choose an earlier finish date first.')
    expect(formText()).toContain('Sprint 3: "+010000-01-03" - December 31 ⚠ past December 31, 9999; saved start date "+010000-01-03" isn\'t a valid date')
  })

  it('STUCK-2: repairable by Edit — sprint 2, then sprint 3 (Update untouched), then sprint 3\'s date', () => {
    setup('stuck')
    openEdit(2)
    setFinish('2026-02-13')
    expect(submit('Update').disabled).toBe(false)
    fireEvent.click(submit('Update'))
    // Only the forecast start spills now: sprint 3's own dates are valid, so its line is the plain one.
    expect(noticeText()).toContain('click Edit sprint at the end of sprint 3\'s row, then click Update to save the dates shown')
    openEdit(3)
    expect(formText()).not.toContain('Edit sprint 2')
    expect(submit('Update').disabled).toBe(false)
    fireEvent.click(submit('Update'))
    expect(storedSprint(3).sprintStartDate).toBe('2026-02-16')
    openEdit(3)
    setFinish('2026-02-26')
    fireEvent.click(submit('Update'))
    expect([storedSprint(3).sprintFinishDate, storedSprint(3).customFinishDate]).toEqual(['2026-02-26', '2026-02-26'])
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('a spill names exactly the sprints that run past 9999 (A5)', () => {
  it('NM1: sprint 6\'s earlier date pulls the schedule back, so only sprints 4–6 run past', () => {
    setup('nm1')
    expect(noticeText()).toContain('Sprints 4–6 would run past December 31, 9999, the latest date this app accepts, because sprint 3 finishes on December 31, 9999.')
  })

  it('NM1: a sprint after the spill whose own dates are valid gets the plain Update line', () => {
    seedStores('nm1')
    useProjectStore.setState({ sprints: useProjectStore.getState().sprints.map((s) => (s.sprintNumber === 7 ? { ...s, sprintStartDate: '+010000-02-14' } : s)) })
    render(<TooltipProvider><ErrorBoundary><SprintHistoryTab /></ErrorBoundary></TooltipProvider>)
    expect(noticeText()).toContain('click Edit sprint at the end of sprint 7\'s row, then click Update to save the dates shown')
    expect(noticeText()).not.toContain('then open sprint 7')
  })

  it('NM2: sprint 3\'s earlier date ends the spill at once, so only sprint 3 runs past', () => {
    setup('nm2')
    expect(noticeText()).toContain('Sprint 3 would run past December 31, 9999, the latest date this app accepts, because sprint 2 finishes on December 31, 9999.')
  })

  it('a refused custom date inside a spill: the fix is conditional, and no standard date is offered (A6)', () => {
    setup('insideBad')
    expect(noticeText()).toContain('first make sprint 3\'s finish date earlier, then open sprint 5 and choose the right date or click Reset')
    expect(noticeText()).not.toContain('counts as ending')
  })
})

describe('no schedule, and the first sprint date (D14)', () => {
  it('NS-1: no first date — the notice names only what this screen can do, and Edit adds no date note', () => {
    setup('a3', { firstSprintStartDate: undefined })
    expect(noticeText()).toContain('can\'t be worked out or edited until this project has a sprint cadence and a valid first sprint start date')
    expect(noticeText()).not.toMatch(/Reset|click Update|counts as ending/)
    openEdit(3)
    expect(formText()).not.toMatch(/Reset to use the standard date|Click Update to save/)
  })

  it('FD-1: a refused first date with sprints — its own text, and the Add title names it', () => {
    setup('control', { firstSprintStartDate: '20276-01-05' })
    expect(crashed()).toBe(false)
    expect(noticeText()).toContain('This project\'s first sprint start date, "20276-01-05", isn\'t a valid date.')
    expect(noticeText()).toContain('only while the project has no sprints')
    expect(screen.getByRole('button', { name: 'Add Sprint' }).getAttribute('title')).toBe('The first sprint start date isn\'t a valid date')
  })

  it('FD-2: a refused first date with no sprints — choose a valid date above', () => {
    seedStores('control', { project: { firstSprintStartDate: '20276-01-05' } })
    useProjectStore.setState({ sprints: [] })
    render(<TooltipProvider><ErrorBoundary><SprintHistoryTab /></ErrorBoundary></TooltipProvider>)
    expect(noticeText()).toContain('choose a valid date in Sprint Configuration above')
  })

  it('CL-1: a valid first date late in 9999 (no cause) — the real remedy is given', () => {
    setup('two', { firstSprintStartDate: '9999-12-06' })
    expect(noticeText()).toContain('delete its sprints (latest first), then choose an earlier first sprint start date')
  })
})
