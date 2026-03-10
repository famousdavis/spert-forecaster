// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { runQuadrupleForecast, runQuadrupleForecastWithMilestones } from './monte-carlo'
import type { SimulationContext } from './monte-carlo'

export interface WorkerInput extends SimulationContext {
  milestoneThresholds?: number[] // Cumulative backlog thresholds for milestone mode
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { config, historicalVelocities, productivityFactors, milestoneThresholds, scopeGrowthPerSprint } = e.data

  if (milestoneThresholds && milestoneThresholds.length > 0) {
    const result = runQuadrupleForecastWithMilestones(
      config, milestoneThresholds, historicalVelocities, productivityFactors, scopeGrowthPerSprint
    )
    self.postMessage(result)
  } else {
    const result = runQuadrupleForecast(config, historicalVelocities, productivityFactors, scopeGrowthPerSprint)
    self.postMessage(result)
  }
}
