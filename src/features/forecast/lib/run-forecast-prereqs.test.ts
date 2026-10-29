// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { canRunForecast, getRunForecastBlockedReason } from './run-forecast-prereqs'
import { MAX_FORECAST_MILESTONES } from '../constants'

describe('getRunForecastBlockedReason', () => {
  const fullyValid = {
    sprintCadenceWeeks: 2,
    firstSprintStartDate: '2026-05-16',
    remainingBacklog: '1000',
    effectiveMean: 100,
    dateBlock: null,
    milestoneCount: 0,
  }

  it('returns null when all prereqs satisfied', () => {
    expect(getRunForecastBlockedReason(fullyValid)).toBeNull()
  })

  it('returns null on empty form (project ready, user mid-fill) — no premature error', () => {
    // Cadence + start date are set, but user hasn't entered any inputs yet.
    // Form-level errors must not fire until the user has started filling.
    expect(
      getRunForecastBlockedReason({
        ...fullyValid,
        remainingBacklog: '',
        effectiveMean: 0,
      })
    ).toBeNull()
  })

  it('flags missing sprint cadence with the Sprint-History instruction', () => {
    const reason = getRunForecastBlockedReason({ ...fullyValid, sprintCadenceWeeks: undefined })
    expect(reason).toBe('Set sprint cadence on the Sprint History tab.')
  })

  it('flags missing cadence ahead of all other missing fields (project-level prereqs win)', () => {
    // Cadence, start date, backlog, AND velocity are all missing. Cadence wins.
    const reason = getRunForecastBlockedReason({
      sprintCadenceWeeks: undefined,
      firstSprintStartDate: undefined,
      remainingBacklog: '',
      effectiveMean: 0,
      dateBlock: null,
      milestoneCount: 0,
    })
    expect(reason).toBe('Set sprint cadence on the Sprint History tab.')
  })

  it('flags missing first-sprint start date when cadence is set', () => {
    const reason = getRunForecastBlockedReason({ ...fullyValid, firstSprintStartDate: undefined })
    expect(reason).toBe('Set the first sprint start date on the Sprint History tab.')
  })

  it('flags zero velocity only when backlog has been entered (mid-fill detection)', () => {
    // Velocity is invalid, but backlog hasn't been entered yet → no error
    // (the user is mid-fill; complaining about velocity is premature).
    expect(
      getRunForecastBlockedReason({ ...fullyValid, remainingBacklog: '', effectiveMean: 0 })
    ).toBeNull()

    // Velocity is invalid AND backlog has been entered → fire the error.
    const reason = getRunForecastBlockedReason({ ...fullyValid, effectiveMean: 0 })
    expect(reason).toBe('Velocity must be greater than 0.')
  })

  it('flags negative velocity the same as zero velocity', () => {
    const reason = getRunForecastBlockedReason({ ...fullyValid, effectiveMean: -5 })
    expect(reason).toBe('Velocity must be greater than 0.')
  })
})

describe('canRunForecast', () => {
  const fullyValid = {
    sprintCadenceWeeks: 2,
    firstSprintStartDate: '2026-05-16',
    remainingBacklog: '1000',
    effectiveMean: 100,
    dateBlock: null,
    milestoneCount: 0,
  }

  it('returns true when every prereq is satisfied', () => {
    expect(canRunForecast(fullyValid)).toBe(true)
  })

  it('returns false when any single prereq is missing', () => {
    expect(canRunForecast({ ...fullyValid, sprintCadenceWeeks: undefined })).toBe(false)
    expect(canRunForecast({ ...fullyValid, firstSprintStartDate: undefined })).toBe(false)
    expect(canRunForecast({ ...fullyValid, remainingBacklog: '' })).toBe(false)
    expect(canRunForecast({ ...fullyValid, effectiveMean: 0 })).toBe(false)
    expect(canRunForecast({ ...fullyValid, effectiveMean: -1 })).toBe(false)
  })
})

describe('W4 — the most milestones a forecast runs on (MAX_FORECAST_MILESTONES)', () => {
  const ready = {
    sprintCadenceWeeks: 2, firstSprintStartDate: '2026-05-16', remainingBacklog: '1000', effectiveMean: 100, dateBlock: null,
  }

  it('runs at the bound, and the largest project a file can carry (100) is far inside it', () => {
    for (const milestoneCount of [0, 100, MAX_FORECAST_MILESTONES]) {
      expect(canRunForecast({ ...ready, milestoneCount })).toBe(true)
      expect(getRunForecastBlockedReason({ ...ready, milestoneCount })).toBeNull()
    }
  })

  it('above it the forecast does not run, and says why (known-bad: 7,000 milestones ran the worker past 15 s)', () => {
    expect(canRunForecast({ ...ready, milestoneCount: MAX_FORECAST_MILESTONES + 1 })).toBe(false)
    expect(getRunForecastBlockedReason({ ...ready, milestoneCount: 7000 }))
      .toBe('This project has 7,000 milestones. A forecast runs on at most 1,000.')
  })
})
