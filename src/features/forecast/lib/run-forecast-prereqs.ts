// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Centralized "can the forecast run?" check, paired with a user-facing reason
 * string when it can't. Used by:
 *  - useForecastState's auto-recalculate effect (gate the silent path)
 *  - useForecastState's handleRunForecast guard (gate the manual path)
 *  - ForecastTab's `canRun` prop passed to ForecastForm (drives button disabled state)
 *  - ForecastForm's inline helper-text slot under the Run Forecast button
 *    (renders the blockedReason so the user sees WHY the button is disabled)
 *
 * Centralizing here means the four call sites cannot drift apart. Before v0.31.5
 * the button's `canRun` was a subset of the handler's actual prereqs — cadence and
 * firstSprintStartDate were missing — so the button stayed enabled while the
 * handler silently bailed when the user clicked it, giving no feedback.
 */
export interface RunForecastPrereqInputs {
  sprintCadenceWeeks: number | undefined
  firstSprintStartDate: string | undefined
  remainingBacklog: string
  effectiveMean: number
}

/**
 * Returns null when the forecast is runnable (no missing prereqs and form is in
 * a fillable / filled state), otherwise a user-facing message naming the missing
 * prereq. The form-level checks (backlog, velocity) only complain once the user
 * has started filling the form, so an empty Forecast tab on a freshly-loaded
 * project doesn't surface "Enter a backlog" before they've had a chance to type.
 * Project-level checks (cadence, start date) complain immediately because they
 * won't fix themselves as the user types.
 */
export function getRunForecastBlockedReason({
  sprintCadenceWeeks,
  firstSprintStartDate,
  remainingBacklog,
  effectiveMean,
}: RunForecastPrereqInputs): string | null {
  if (!sprintCadenceWeeks) return 'Set sprint cadence on the Sprint History tab.'
  if (!firstSprintStartDate) return 'Set the first sprint start date on the Sprint History tab.'
  if (remainingBacklog && effectiveMean <= 0) return 'Velocity must be greater than 0.'
  return null
}

/**
 * True iff every prereq for a forecast run is satisfied: project has cadence and
 * first-sprint start date AND user has supplied a remaining backlog AND the
 * effective mean velocity is positive.
 */
export function canRunForecast({
  sprintCadenceWeeks,
  firstSprintStartDate,
  remainingBacklog,
  effectiveMean,
}: RunForecastPrereqInputs): boolean {
  return (
    !!sprintCadenceWeeks &&
    !!firstSprintStartDate &&
    !!remainingBacklog &&
    effectiveMean > 0
  )
}
