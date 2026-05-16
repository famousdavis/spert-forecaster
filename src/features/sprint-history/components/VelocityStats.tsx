// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { Sprint } from '@/shared/types'
import { calculateVelocityStats } from '@/features/forecast/lib/statistics'

interface VelocityStatsProps {
  sprints: Sprint[]
  unitOfMeasure: string
}

export function VelocityStats({ sprints, unitOfMeasure }: VelocityStatsProps) {
  const stats = calculateVelocityStats(sprints)

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-sm text-muted-foreground">Included Sprints</p>
        <p className="text-2xl font-semibold dark:text-gray-100">{stats.count}</p>
      </div>
      <div className="rounded-lg border border-border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-sm text-muted-foreground">
          Velocity ({unitOfMeasure}/sprint)
        </p>
        <p className="text-2xl font-semibold dark:text-gray-100">
          {stats.count > 0 ? stats.mean.toFixed(1) : '—'}
        </p>
      </div>
      <div className="rounded-lg border border-border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-sm text-muted-foreground">Standard Deviation</p>
        <p className="text-2xl font-semibold dark:text-gray-100">
          {stats.count > 1 ? stats.standardDeviation.toFixed(1) : '—'}
        </p>
      </div>
    </div>
  )
}
