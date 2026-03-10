// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { ForecastConfig } from '@/shared/types'
import type { PercentileResults, QuadMilestoneForecastResult } from '../lib/monte-carlo'
import type { WorkerInput } from '../lib/monte-carlo.worker'

export type QuadForecastResult = {
  truncatedNormal: { results: PercentileResults; sprintsRequired: number[] }
  lognormal: { results: PercentileResults; sprintsRequired: number[] }
  gamma: { results: PercentileResults; sprintsRequired: number[] }
  bootstrap: { results: PercentileResults; sprintsRequired: number[] } | null
  triangular: { results: PercentileResults; sprintsRequired: number[] }
  uniform: { results: PercentileResults; sprintsRequired: number[] }
}

type WorkerResult = QuadForecastResult | QuadMilestoneForecastResult

export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<{
    resolve: (value: WorkerResult) => void
    reject: (reason: Error) => void
  } | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../lib/monte-carlo.worker.ts', import.meta.url)
    )

    workerRef.current.onmessage = (e: MessageEvent<WorkerResult>) => {
      setIsSimulating(false)
      pendingRef.current?.resolve(e.data)
      pendingRef.current = null
    }

    workerRef.current.onerror = (e: ErrorEvent) => {
      setIsSimulating(false)
      pendingRef.current?.reject(new Error(e.message))
      pendingRef.current = null
    }

    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      if (pendingRef.current) {
        pendingRef.current.reject(new Error('Worker terminated'))
        pendingRef.current = null
      }
    }
  }, [])

  const runSimulation = useCallback((input: {
    config: ForecastConfig & { sprintCadenceWeeks: number }
    historicalVelocities?: number[]
    productivityFactors?: number[]
    scopeGrowthPerSprint?: number
  }): Promise<QuadForecastResult> => {
    // Abort any pending simulation
    if (pendingRef.current) {
      pendingRef.current.reject(new Error('Simulation aborted'))
      pendingRef.current = null
    }

    setIsSimulating(true)

    return new Promise<QuadForecastResult>((resolve, reject) => {
      pendingRef.current = {
        resolve: resolve as (value: WorkerResult) => void,
        reject,
      }
      const message: WorkerInput = input
      workerRef.current?.postMessage(message)
    })
  }, [])

  const runMilestoneSimulation = useCallback((input: {
    config: ForecastConfig & { sprintCadenceWeeks: number }
    historicalVelocities?: number[]
    productivityFactors?: number[]
    milestoneThresholds: number[]
    scopeGrowthPerSprint?: number
  }): Promise<QuadMilestoneForecastResult> => {
    // Abort any pending simulation
    if (pendingRef.current) {
      pendingRef.current.reject(new Error('Simulation aborted'))
      pendingRef.current = null
    }

    setIsSimulating(true)

    return new Promise<QuadMilestoneForecastResult>((resolve, reject) => {
      pendingRef.current = {
        resolve: resolve as (value: WorkerResult) => void,
        reject,
      }
      const message: WorkerInput = input
      workerRef.current?.postMessage(message)
    })
  }, [])

  return { runSimulation, runMilestoneSimulation, isSimulating }
}
