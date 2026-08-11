// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// CHARACTERISATION SUITE — ForecastForm had ZERO executions before this file.
//
// It was census risk #1: cc 49, 396 LOC, 54 conditional sites, and never
// imported by any test. Not "thinly covered" — absent from the coverage report
// entirely. This suite pins what it renders today; it does not judge it.
//
// ⚠️ SENTINELS ARE NON-INTEGER AND DISTINCT PER PROP, ON PURPOSE.
// Every numeric prop below gets its own two-decimal value. That is not tidiness
// — it is the only thing that makes these assertions able to fail:
//
//   * DISTINCT, so a rendered number identifies WHICH prop was read. Four props
//     feed the two velocity fields through nested ternaries. Set them all to 20
//     and `value === '20.0'` passes no matter which one the component read, so
//     a mis-wired branch stays invisible. That is the composition defect this
//     component's shape invites.
//   * NON-INTEGER, so the number also pins the FORMATTING. `.toFixed(1)` is
//     applied to `calculatedMean`/`effectiveMean`/`calculatedStdDev`/
//     `effectiveStdDev` but NOT to `velocityMean`/`velocityStdDev`, which are
//     already strings. `55.55` rendering unrounded is the assertion that keeps
//     that asymmetry from being "fixed" by accident.
//
// ⚠️ SEVEN SITES ARE DELIBERATELY NOT COVERED, AND THIS IS THE RECORD OF IT.
// Of the 54 conditional sites, seven differ only by a Tailwind class string:
//   L163 backlog border · L209 velocity bg · L247 variability bg (ternary + ||)
//   L337 / L339 run-button bg · L352 the ' ' spacer
// Catching a swap at any of them means asserting on class strings, which pins
// presentation and breaks on any restyle. They are also REDUNDANT: `disabled=
// {isSubjective}` (L206) and `isSubjective ? 'bg-disabled' : 'bg-white'` (L209)
// express the same condition, and the first is asserted below. Skipping them
// loses close to nothing — but an undocumented gap is indistinguishable from an
// oversight, so it is written down rather than left to be rediscovered.
//
// ⚠️ AN EIGHTH SITE IS UNPINNABLE, AND FALSIFICATION IS WHAT FOUND IT.
// L290's `sprints.length >= 2` cannot be pinned through this component at all.
// `VelocitySparkline` carries its own `if (data.length < 2) return null`, so
// relaxing the outer guard to `>= 1` changes NOTHING observable — the child
// declines to render at one sprint either way. The test below still passes with
// the guard relaxed. It was written believing it discriminated; `scripts/
// falsify-spec-forecast-form.mjs` proved otherwise, and the probe was re-aimed
// at L290's `!isSubjective` leg, which IS pinned. The outer threshold is
// redundant defensive duplication, not a defect — recorded, not removed.
//
// ⚠️ TooltipProvider IS REQUIRED. `HelpTooltip` throws "`Tooltip` must be used
// within `TooltipProvider`" without it — the component is store-free but not
// provider-free. The app supplies it at the shell.
// ===========================================================================

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'

import { TooltipProvider } from '@/components/ui/tooltip'
import { ForecastForm } from './ForecastForm'
import type { Sprint } from '@/shared/types'

// ── Sentinels ──────────────────────────────────────────────────────────────
// Verified renderings: 11.11→"11.1" 22.22→"22.2" 33.33→"33.3" 44.44→"44.4"
const CALC_MEAN = 11.11 //  → "11.1"
const EFF_MEAN = 22.22 //   → "22.2"
const CALC_SD = 33.33 //    → "33.3"
const EFF_SD = 44.44 //     → "44.4"
const OVERRIDE_MEAN = '55.55' // string — must render UNROUNDED
const OVERRIDE_SD = '66.66' //   string — must render UNROUNDED
const LAST_BACKLOG = 777
const DERIVED_BACKLOG = 888
const DEFAULT_MULTIPLIER = 1.0

// ⚠️ No `as Sprint` cast here, deliberately. The first draft of this factory set
// `velocity` and `included`; the real fields are `doneValue` and
// `includedInForecast`, and the cast silently accepted both wrong names — the
// sparkline was reading undefined. A cast on a fixture disables the one check
// that would have caught it.
function sprint(sprintNumber: number, doneValue: number): Sprint {
  return {
    id: `s${sprintNumber}`,
    projectId: 'p-1',
    sprintNumber,
    sprintStartDate: '2026-01-01',
    sprintFinishDate: '2026-01-14',
    doneValue,
    includedInForecast: true,
    createdAt: 't',
    updatedAt: 't',
  }
}

const TWO_SPRINTS = [sprint(1, 10), sprint(2, 12)]

type Props = Parameters<typeof ForecastForm>[0]

function baseProps(): Props {
  return {
    remainingBacklog: '123',
    velocityMean: '',
    velocityStdDev: '',
    startDate: '2026-01-05',
    sprintCadenceWeeks: 2,
    calculatedMean: CALC_MEAN,
    calculatedStdDev: CALC_SD,
    effectiveMean: EFF_MEAN,
    effectiveStdDev: EFF_SD,
    unitOfMeasure: 'widgets',
    lastSprintBacklog: LAST_BACKLOG,
    derivedBacklogFromIncluded: DERIVED_BACKLOG,
    hasBacklogDrift: false,
    onResetBacklogToDerived: vi.fn(),
    sprints: TWO_SPRINTS,
    scopeChangeStats: null,
    modelScopeGrowth: false,
    scopeGrowthMode: 'calculated',
    customScopeGrowth: '',
    forecastMode: 'history',
    includedSprintCount: 5,
    velocityEstimate: '99.99',
    selectedCV: 0.25,
    onForecastModeChange: vi.fn(),
    onVelocityEstimateChange: vi.fn(),
    onCVChange: vi.fn(),
    onModelScopeGrowthChange: vi.fn(),
    onScopeGrowthModeChange: vi.fn(),
    onCustomScopeGrowthChange: vi.fn(),
    onRemainingBacklogChange: vi.fn(),
    onVelocityMeanChange: vi.fn(),
    onVelocityStdDevChange: vi.fn(),
    volatilityMultiplier: DEFAULT_MULTIPLIER,
    onVolatilityMultiplierChange: vi.fn(),
    onRunForecast: vi.fn(),
    canRun: true,
    runForecastBlockedReason: null,
    isSimulating: false,
  }
}

function setup(overrides: Partial<Props> = {}) {
  const props = { ...baseProps(), ...overrides }
  const { container } = render(
    <TooltipProvider>
      <ForecastForm {...props} />
    </TooltipProvider>
  )
  return { container, props, q: within(container) }
}

/** An input and the helper `<p>` that sits beside it in the same field wrapper. */
function field(container: HTMLElement, id: string) {
  const input = container.querySelector(`#${id}`) as HTMLInputElement
  const helper = input.parentElement!.querySelector('p') as HTMLParagraphElement
  return { input, helper }
}

// Presence markers for the conditional children, each chosen to be unambiguous.
const SPARKLINE = 'Velocity trend'
const ADJUSTER = 'How volatile will your team be going forward?'
const subjectiveInputs = (c: HTMLElement) => c.querySelector('#velocityEstimate')
const scopeGrowth = (c: HTMLElement) => c.querySelector('#modelScopeGrowth')

describe('ForecastForm — history mode, velocity and variability composition', () => {
  it('reads the CALCULATED props when no override is set, and formats them to one decimal', () => {
    const { container } = setup()
    // Sentinels are distinct, so these assert WHICH prop was read, not merely
    // that a number appeared.
    expect(field(container, 'velocityMean').input.value).toBe('11.1')
    expect(field(container, 'velocityStdDev').input.value).toBe('33.3')
    expect(field(container, 'velocityMean').helper.textContent).toBe('Calc: 11.1')
    expect(field(container, 'velocityStdDev').helper.textContent).toContain('Calc: 33.3')
  })

  it('lets a manual override win, and does NOT reformat it', () => {
    // ⚠️ The toFixed asymmetry. velocityMean/velocityStdDev are strings and are
    // rendered verbatim; adding .toFixed(1) to either would turn these into
    // '55.6' / '66.7' and fail here.
    const { container } = setup({ velocityMean: OVERRIDE_MEAN, velocityStdDev: OVERRIDE_SD })
    expect(field(container, 'velocityMean').input.value).toBe('55.55')
    expect(field(container, 'velocityStdDev').input.value).toBe('66.66')
  })

  it('falls back to empty values, "No data" placeholders and prompt helpers with no sprint data', () => {
    const { container } = setup({ calculatedMean: 0, calculatedStdDev: 0 })
    const mean = field(container, 'velocityMean')
    const sd = field(container, 'velocityStdDev')
    expect(mean.input.value).toBe('')
    expect(sd.input.value).toBe('')
    expect(mean.input.getAttribute('placeholder')).toBe('No data')
    expect(sd.input.getAttribute('placeholder')).toBe('No data')
    expect(mean.helper.textContent).toBe('Add sprints to calculate')
    expect(sd.helper.textContent).toContain('Need 2+ sprints')
  })

  it('leaves both velocity fields editable in history mode', () => {
    const { container } = setup()
    expect(field(container, 'velocityMean').input.disabled).toBe(false)
    expect(field(container, 'velocityStdDev').input.disabled).toBe(false)
  })
})

describe('ForecastForm — subjective mode', () => {
  it('shows the EFFECTIVE props, disables both fields, and blanks their placeholders', () => {
    const { container } = setup({ forecastMode: 'subjective' })
    const mean = field(container, 'velocityMean')
    const sd = field(container, 'velocityStdDev')
    // 22.2 not 11.1, and 44.4 not 33.3 — the sentinels are what make this a
    // statement about which prop was read.
    expect(mean.input.value).toBe('22.2')
    expect(sd.input.value).toBe('44.4')
    expect(mean.input.disabled).toBe(true)
    expect(sd.input.disabled).toBe(true)
    // ⚠️ OBSERVATION, NOT A DEFECT — the two fields are asymmetric here, and
    // this suite pins the asymmetry rather than tidying it. Velocity keeps its
    // 'From estimate' placeholder unconditionally in subjective mode (L213),
    // while Variability blanks its own once there is an effective mean (L251).
    // Both are harmless because a placeholder is invisible behind a value, so
    // the observable behaviour matches — it is only the defensive style that
    // differs. Recorded, not fixed: this is a characterisation PR.
    expect(mean.input.getAttribute('placeholder')).toBe('From estimate')
    expect(sd.input.getAttribute('placeholder')).toBe('')
    expect(mean.helper.textContent).toBe('Calc: 11.1')
    expect(sd.helper.textContent).toContain('From CV: 44.4')
  })

  it('empties both fields and switches placeholders when there is no effective mean', () => {
    const { container } = setup({ forecastMode: 'subjective', effectiveMean: 0, calculatedMean: 0 })
    const mean = field(container, 'velocityMean')
    const sd = field(container, 'velocityStdDev')
    expect(mean.input.value).toBe('')
    expect(sd.input.value).toBe('')
    expect(mean.input.getAttribute('placeholder')).toBe('From estimate')
    expect(sd.input.getAttribute('placeholder')).toBe('From CV')
    // Both helpers collapse to a non-breaking space.
    expect(mean.helper.textContent).toBe(' ')
    expect(sd.helper.textContent).toBe(' ')
  })

  it('renders SubjectiveInputs and withdraws every history-only affordance', () => {
    const { container, q } = setup({ forecastMode: 'subjective', velocityMean: OVERRIDE_MEAN })
    expect(subjectiveInputs(container)).not.toBeNull()
    expect(q.queryByText(SPARKLINE)).toBeNull()
    expect(q.queryByRole('button', { name: 'Adjust' })).toBeNull()
    // hasOverrides is true here, so this proves the !isSubjective guard, not an
    // absent override.
    expect(q.queryByRole('button', { name: 'Reset overrides' })).toBeNull()
  })

  it('does not render SubjectiveInputs in history mode', () => {
    const { container } = setup()
    expect(subjectiveInputs(container)).toBeNull()
  })
})

describe('ForecastForm — velocity sparkline', () => {
  it('renders in history mode with two or more sprints', () => {
    const { q } = setup()
    expect(q.queryByText(SPARKLINE)).not.toBeNull()
  })

  it('is withheld below two sprints', () => {
    const { q } = setup({ sprints: [sprint(1, 10)] })
    expect(q.queryByText(SPARKLINE)).toBeNull()
  })
})

describe('ForecastForm — backlog field', () => {
  it('shows the last sprint backlog and no reset link when there is no drift', () => {
    const { container, q } = setup()
    expect(field(container, 'remainingBacklog').input.value).toBe('123')
    expect(field(container, 'remainingBacklog').helper.textContent).toContain('Last sprint: 777')
    expect(q.queryByRole('button', { name: /Reset to/ })).toBeNull()
  })

  it('blanks the helper when there is no last sprint backlog', () => {
    const { container } = setup({ lastSprintBacklog: undefined })
    expect(field(container, 'remainingBacklog').helper.textContent).toBe(' ')
  })

  it('offers the derived value on drift and calls back with it', () => {
    const { q, props } = setup({ hasBacklogDrift: true })
    // 888, not 777 — the link offers derivedBacklogFromIncluded, not the last
    // sprint's backlog. Distinct sentinels are what separate those two.
    const reset = q.getByRole('button', { name: 'Reset to 888' })
    fireEvent.click(reset)
    expect(props.onResetBacklogToDerived).toHaveBeenCalledTimes(1)
  })

  it('withholds the reset link when drift is flagged but no derived value exists', () => {
    const { q } = setup({ hasBacklogDrift: true, derivedBacklogFromIncluded: undefined })
    expect(q.queryByRole('button', { name: /Reset to/ })).toBeNull()
  })
})

describe('ForecastForm — volatility adjuster', () => {
  it('opens on Adjust, clears the manual SD override, and relabels the toggle', () => {
    const { q, props } = setup()
    expect(q.queryByText(ADJUSTER)).toBeNull()
    fireEvent.click(q.getByRole('button', { name: 'Adjust' }))
    // Expanding clears the manual override so the multiplier can take effect.
    expect(props.onVelocityStdDevChange).toHaveBeenCalledWith('')
    expect(q.queryByText(ADJUSTER)).not.toBeNull()
    expect(q.getByRole('button', { name: 'Close' })).not.toBeNull()
  })

  it('resets the multiplier to the default on Close and hides the panel', () => {
    const { q, props } = setup()
    fireEvent.click(q.getByRole('button', { name: 'Adjust' }))
    fireEvent.click(q.getByRole('button', { name: 'Close' }))
    expect(props.onVolatilityMultiplierChange).toHaveBeenCalledWith(DEFAULT_MULTIPLIER)
    expect(q.queryByText(ADJUSTER)).toBeNull()
    expect(q.getByRole('button', { name: 'Adjust' })).not.toBeNull()
  })

  it('takes over the variability field while open, showing the adjusted SD', () => {
    const { container, q } = setup({ volatilityMultiplier: 1.5 })
    fireEvent.click(q.getByRole('button', { name: 'Adjust' }))
    const sd = field(container, 'velocityStdDev')
    // 44.4 is effectiveStdDev — the adjusted figure — not calculatedStdDev's 33.3.
    expect(sd.input.value).toBe('44.4')
    expect(sd.input.disabled).toBe(true)
    expect(sd.helper.textContent).toContain('Adj: 44.4 (×1.5)')
  })

  it('keeps the Calc helper when open at the default multiplier', () => {
    const { container, q } = setup()
    fireEvent.click(q.getByRole('button', { name: 'Adjust' }))
    // The Adj: form is gated on the multiplier differing from the default, so
    // at 1.0 the helper falls through to Calc even though the panel is open.
    expect(field(container, 'velocityStdDev').helper.textContent).toContain('Calc: 33.3')
  })

  it('is not offered at all without a calculated standard deviation', () => {
    const { q } = setup({ calculatedStdDev: 0 })
    expect(q.queryByRole('button', { name: 'Adjust' })).toBeNull()
    expect(q.queryByText(ADJUSTER)).toBeNull()
  })
})

describe('ForecastForm — override reset', () => {
  it('surfaces the reset link for any single override source', () => {
    // Each of the three legs of hasOverrides, alone, must be enough.
    for (const override of [
      { velocityMean: OVERRIDE_MEAN },
      { velocityStdDev: OVERRIDE_SD },
      { volatilityMultiplier: 1.5 },
    ]) {
      const { q } = setup(override)
      expect(
        q.queryByRole('button', { name: 'Reset overrides' }),
        JSON.stringify(override)
      ).not.toBeNull()
    }
  })

  it('withholds the reset link when nothing is overridden', () => {
    const { q } = setup()
    expect(q.queryByRole('button', { name: 'Reset overrides' })).toBeNull()
  })

  it('clears both overrides and the multiplier together', () => {
    const { q, props } = setup({ velocityMean: OVERRIDE_MEAN })
    fireEvent.click(q.getByRole('button', { name: 'Reset overrides' }))
    expect(props.onVelocityMeanChange).toHaveBeenCalledWith('')
    expect(props.onVelocityStdDevChange).toHaveBeenCalledWith('')
    expect(props.onVolatilityMultiplierChange).toHaveBeenCalledWith(DEFAULT_MULTIPLIER)
  })

  it('also collapses an open adjuster when resetting overrides', () => {
    const { q } = setup({ volatilityMultiplier: 1.5 })
    fireEvent.click(q.getByRole('button', { name: 'Adjust' }))
    expect(q.queryByText(ADJUSTER)).not.toBeNull()
    fireEvent.click(q.getByRole('button', { name: 'Reset overrides' }))
    expect(q.queryByText(ADJUSTER)).toBeNull()
  })
})

describe('ForecastForm — cadence, run button and scope growth', () => {
  it('renders the cadence singular, plural, or as an em dash', () => {
    expect(within(setup({ sprintCadenceWeeks: 1 }).container).getByText('1 Week')).not.toBeNull()
    expect(within(setup({ sprintCadenceWeeks: 3 }).container).getByText('3 Weeks')).not.toBeNull()
    expect(within(setup({ sprintCadenceWeeks: undefined }).container).getByText('—')).not.toBeNull()
  })

  it('runs when enabled, and reports "Running…" while simulating', () => {
    const { q, props } = setup()
    const run = q.getByRole('button', { name: 'Run Forecast' }) as HTMLButtonElement
    expect(run.disabled).toBe(false)
    fireEvent.click(run)
    expect(props.onRunForecast).toHaveBeenCalledTimes(1)

    const busy = setup({ isSimulating: true })
    const busyBtn = busy.q.getByRole('button', { name: 'Running…' }) as HTMLButtonElement
    expect(busyBtn.disabled).toBe(true)
  })

  it('disables the run button when it cannot run', () => {
    const { q } = setup({ canRun: false })
    expect((q.getByRole('button', { name: 'Run Forecast' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the blocked reason under the button, and only when there is one', () => {
    const withReason = setup({ canRun: false, runForecastBlockedReason: 'Add a backlog size' })
    expect(withReason.q.queryByText('Add a backlog size')).not.toBeNull()
    const without = setup()
    expect(without.q.queryByText('Add a backlog size')).toBeNull()
  })

  it('renders ScopeGrowthSection only when scope-change stats are supplied', () => {
    expect(scopeGrowth(setup().container)).toBeNull()
    const withStats = setup({
      scopeChangeStats: {
        dataPoints: [],
        averageChange: 3.5,
        averagePercentChange: 2.75,
        averageScopeInjection: 4.25,
        volatility: 1.25,
        trend: 'growing',
        sprintsWithData: 4,
        totalChange: 14.5,
        latestScope: 123.75,
      },
    })
    expect(scopeGrowth(withStats.container)).not.toBeNull()
  })

  it('renders the start date read-only and shows the unit of measure', () => {
    const { container, q } = setup()
    const start = container.querySelector('#startDate') as HTMLInputElement
    expect(start.value).toBe('2026-01-05')
    expect(start.readOnly).toBe(true)
    expect(q.getByText('widgets')).not.toBeNull()
  })
})
