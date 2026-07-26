// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { ForecastConfig } from '@/shared/types'
import type { QuadMilestoneForecastResult } from '../lib/monte-carlo'
import type { PercentileResults } from '@/shared/types/forecast-results'
import { useForecastResultsStore } from '@/shared/state/forecast-results-store'

export type QuadForecastResult = {
  truncatedNormal: { results: PercentileResults; sprintsRequired: number[] }
  lognormal: { results: PercentileResults; sprintsRequired: number[] }
  gamma: { results: PercentileResults; sprintsRequired: number[] }
  bootstrap: { results: PercentileResults; sprintsRequired: number[] } | null
  triangular: { results: PercentileResults; sprintsRequired: number[] }
  uniform: { results: PercentileResults; sprintsRequired: number[] }
}

type WorkerResult = QuadForecastResult | QuadMilestoneForecastResult

interface RunInput {
  config: ForecastConfig & { sprintCadenceWeeks: number }
  historicalVelocities?: number[]
  productivityFactors?: number[]
  scopeGrowthPerSprint?: number
  milestoneThresholds?: number[]
}

/**
 * Owns the Monte Carlo worker and the in-flight run flag.
 *
 * `isSimulating` moved from a useState cell into the forecast-results store
 * in v0.36.0. It is `{projectId, runToken} | null` rather than a boolean
 * because the AI snapshot's freshness ladder needs to know WHICH project is
 * recomputing, and because every path that stops a run must be able to prove
 * it is clearing its own run rather than a replacement's.
 *
 * FIVE PATHS STOP A RUN, and all five clear the flag under a token check:
 *   1. worker unmount            — below, in the effect cleanup
 *   2. the success handler       — onmessage
 *   3. the error handler         — onerror
 *   4. handleRunForecast's catch — in useForecastState
 *   5. postMessage unreachable   — the worker ref is null
 *
 * Without the token check on 2 and 3, an aborted run's late callback clears
 * the flag while its replacement is still running, and the UI reports idle
 * mid-simulation.
 */
export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null)
  const messageIdRef = useRef(0)
  const pendingRef = useRef<{
    _messageId: number
    resolve: (value: WorkerResult) => void
    reject: (reason: Error) => void
  } | null>(null)

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../lib/monte-carlo.worker.ts', import.meta.url)
    )

    workerRef.current.onmessage = (e: MessageEvent<WorkerResult & { _messageId?: number }>) => {
      // Drop stale responses from superseded simulations
      if (pendingRef.current && e.data._messageId !== pendingRef.current._messageId) return
      if (typeof e.data._messageId === 'number') {
        useForecastResultsStore.getState().clearIsSimulatingIfToken(e.data._messageId)
      }
      pendingRef.current?.resolve(e.data)
      pendingRef.current = null
    }

    workerRef.current.onerror = (e: ErrorEvent) => {
      const token = pendingRef.current?._messageId
      if (typeof token === 'number') {
        useForecastResultsStore.getState().clearIsSimulatingIfToken(token)
      }
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
      // A store write, not setState: React discards state updates on an
      // unmounting component, so a setState here would leave the flag stuck
      // true and the freshness ladder pinned at "recomputing" forever.
      useForecastResultsStore.getState().setIsSimulating(null)
    }
  }, [])

  const post = useCallback(
    <T extends WorkerResult>(input: RunInput, projectId: string): Promise<T> => {
      // Abort any pending simulation
      if (pendingRef.current) {
        pendingRef.current.reject(new Error('Simulation aborted'))
        pendingRef.current = null
      }

      const id = ++messageIdRef.current
      useForecastResultsStore.getState().setIsSimulating({ projectId, runToken: id })

      return new Promise<T>((resolve, reject) => {
        pendingRef.current = {
          _messageId: id,
          resolve: resolve as (value: WorkerResult) => void,
          reject,
        }
        if (!workerRef.current) {
          // Path 5. This branch sits INSIDE the executor, after pendingRef is
          // assigned, so clearing the flag alone would leave the promise
          // permanently unsettled and every later run blocked behind it.
          pendingRef.current = null
          useForecastResultsStore.getState().clearIsSimulatingIfToken(id)
          reject(new Error('Simulation worker unavailable'))
          return
        }
        workerRef.current.postMessage({ ...input, _messageId: id })
      })
    },
    []
  )

  const runSimulation = useCallback(
    (
      input: {
        config: ForecastConfig & { sprintCadenceWeeks: number }
        historicalVelocities?: number[]
        productivityFactors?: number[]
        scopeGrowthPerSprint?: number
      },
      projectId: string
    ): Promise<QuadForecastResult> => post<QuadForecastResult>(input, projectId),
    [post]
  )

  const runMilestoneSimulation = useCallback(
    (
      input: {
        config: ForecastConfig & { sprintCadenceWeeks: number }
        historicalVelocities?: number[]
        productivityFactors?: number[]
        milestoneThresholds: number[]
        scopeGrowthPerSprint?: number
      },
      projectId: string
    ): Promise<QuadMilestoneForecastResult> =>
      post<QuadMilestoneForecastResult>(input, projectId),
    [post]
  )

  return { runSimulation, runMilestoneSimulation }
}
