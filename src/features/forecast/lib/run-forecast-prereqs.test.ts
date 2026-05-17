// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { canRunForecast, getRunForecastBlockedReason } from './run-forecast-prereqs'

describe('getRunForecastBlockedReason', () => {
  const fullyValid = {
    sprintCadenceWeeks: 2,
    firstSprintStartDate: '2026-05-16',
    remainingBacklog: '1000',
    effectiveMean: 100,
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
