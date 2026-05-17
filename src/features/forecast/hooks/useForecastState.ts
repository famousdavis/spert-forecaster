// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  useProjectStore,
  selectViewingProject,
} from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { useIsClient, useDebounce } from '@/shared/hooks'
import { useSprintData } from './useSprintData'
import { useForecastInputs } from './useForecastInputs'
import { useChartSettings } from './useChartSettings'
import {
  calculateAllCustomPercentiles,
  type QuadResults,
  type QuadSimulationData,
  type QuadCustomResults,
  type QuadMilestoneForecastResult,
} from '../lib/monte-carlo'
import { useSimulationWorker, type QuadForecastResult } from './useSimulationWorker'
import { useScopeGrowthState } from './useScopeGrowthState'
import { preCalculateSprintFactors } from '../lib/productivity'
import { generateForecastCsv, downloadCsv, generateFilename } from '../lib/export-csv'
import { safeParseNumber } from '@/shared/lib/validation'
import { MIN_SPRINTS_FOR_HISTORY, DEFAULT_SELECTED_PERCENTILES } from '../constants'
import type { ForecastMode } from '@/shared/types'
import { computeMilestoneCompletionInfo } from '../lib/milestones'
import { canRunForecast, getRunForecastBlockedReason } from '../lib/run-forecast-prereqs'

/** Per-milestone QuadResults and QuadSimulationData */
export interface MilestoneResults {
  milestoneResults: QuadResults[]
  milestoneSimulationData: QuadSimulationData[]
}

const EMPTY_CUSTOM_RESULTS: QuadCustomResults = {
  truncatedNormal: null, lognormal: null, gamma: null, bootstrap: null,
  triangular: null, uniform: null,
}

/** Extract QuadResults + QuadSimulationData from a QuadForecastResult */
function extractQuadData(raw: QuadForecastResult): { results: QuadResults; simData: QuadSimulationData } {
  return {
    results: {
      truncatedNormal: raw.truncatedNormal.results,
      lognormal: raw.lognormal.results,
      gamma: raw.gamma.results,
      bootstrap: raw.bootstrap?.results ?? null,
      triangular: raw.triangular.results,
      uniform: raw.uniform.results,
    },
    simData: {
      truncatedNormal: raw.truncatedNormal.sprintsRequired,
      lognormal: raw.lognormal.sprintsRequired,
      gamma: raw.gamma.sprintsRequired,
      bootstrap: raw.bootstrap?.sprintsRequired ?? null,
      triangular: raw.triangular.sprintsRequired,
      uniform: raw.uniform.sprintsRequired,
    },
  }
}

/** Reshape QuadMilestoneForecastResult into per-milestone QuadResults[] + QuadSimulationData[] */
function extractMilestoneData(
  raw: QuadMilestoneForecastResult,
  milestoneCount: number
): { perMilestoneResults: QuadResults[]; perMilestoneSimData: QuadSimulationData[] } {
  const perMilestoneResults: QuadResults[] = []
  const perMilestoneSimData: QuadSimulationData[] = []
  for (let m = 0; m < milestoneCount; m++) {
    perMilestoneResults.push({
      truncatedNormal: raw.truncatedNormal.milestoneResults[m].results,
      lognormal: raw.lognormal.milestoneResults[m].results,
      gamma: raw.gamma.milestoneResults[m].results,
      bootstrap: raw.bootstrap?.milestoneResults[m].results ?? null,
      triangular: raw.triangular.milestoneResults[m].results,
      uniform: raw.uniform.milestoneResults[m].results,
    })
    perMilestoneSimData.push({
      truncatedNormal: raw.truncatedNormal.milestoneResults[m].sprintsRequired,
      lognormal: raw.lognormal.milestoneResults[m].sprintsRequired,
      gamma: raw.gamma.milestoneResults[m].sprintsRequired,
      bootstrap: raw.bootstrap?.milestoneResults[m].sprintsRequired ?? null,
      triangular: raw.triangular.milestoneResults[m].sprintsRequired,
      uniform: raw.uniform.milestoneResults[m].sprintsRequired,
    })
  }
  return { perMilestoneResults, perMilestoneSimData }
}

export function useForecastState() {
  const isClient = useIsClient()
  const { runSimulation, runMilestoneSimulation, isSimulating } = useSimulationWorker()
  const projects = useProjectStore((state) => state.projects)
  const selectedProject = useProjectStore(selectViewingProject)
  const setViewingProjectId = useProjectStore((state) => state.setViewingProjectId)

  // Global settings
  const trialCount = useSettingsStore((s) => s.trialCount)
  const autoRecalculate = useSettingsStore((s) => s.autoRecalculate)

  // Composed hooks
  const sprintData = useSprintData()
  // Use the *included* sprint subset so that toggling a sprint's inclusion updates the
  // derived backlog value for the Forecast tab's Remaining Backlog field (Item 2 fix).
  const inputs = useForecastInputs(sprintData.calculatedStats, sprintData.includedSprintCount, sprintData.includedSprints)
  const charts = useChartSettings()

  // Forecast mode: auto-detect or user override
  const canUseHistory = sprintData.includedSprintCount >= MIN_SPRINTS_FOR_HISTORY
  const effectiveForecastMode: ForecastMode = inputs.forecastMode
    ? inputs.forecastMode
    : (canUseHistory ? 'history' : 'subjective')

  // Productivity adjustments for the selected project
  const productivityAdjustments = useMemo(
    () => selectedProject?.productivityAdjustments ?? [],
    [selectedProject?.productivityAdjustments]
  )

  // Per-milestone completion status (user has zeroed backlogSize), derived once at
  // this level so both ForecastSummary (breakdown past-tense rendering, Scope-picker
  // filter) and ForecastResults (per-milestone forecast-table filter) share the same
  // source of truth without duplication.
  const milestoneCompletionInfo = useMemo(
    () => computeMilestoneCompletionInfo(inputs.milestones),
    [inputs.milestones]
  )

  // Track previous project to clear results on change
  const prevProjectIdRef = useRef<string | undefined>(selectedProject?.id)

  // Track whether a forecast has been run at least once (for auto-recalc guard)
  const hasRunOnceRef = useRef(false)

  // Results state
  const [results, setResults] = useState<QuadResults | null>(null)
  const [simulationData, setSimulationData] = useState<QuadSimulationData | null>(null)
  // Overall (total backlog) simulation data — used by burn-up chart; not swapped by milestone dropdown
  const [overallSimulationData, setOverallSimulationData] = useState<QuadSimulationData | null>(null)
  const [milestoneResultsState, setMilestoneResultsState] = useState<MilestoneResults | null>(null)
  const defaultPercentile = useSettingsStore((s) => s.defaultCustomPercentile)
  const [customPercentile, setCustomPercentile] = useState(defaultPercentile)
  const [customResults, setCustomResults] = useState<QuadCustomResults>(EMPTY_CUSTOM_RESULTS)

  // Second custom percentile slider (Feature 3)
  const defaultPercentile2 = useSettingsStore((s) => s.defaultCustomPercentile2)
  const [customPercentile2, setCustomPercentile2] = useState(defaultPercentile2)
  const [customResults2, setCustomResults2] = useState<QuadCustomResults>(EMPTY_CUSTOM_RESULTS)

  // User-selectable results table percentiles (Feature 2)
  const defaultResultsPercentiles = useSettingsStore((s) => s.defaultResultsPercentiles)
  const [selectedResultsPercentiles, setSelectedResultsPercentiles] = useState<number[]>(
    () => defaultResultsPercentiles?.length > 0 ? [...defaultResultsPercentiles] : [...DEFAULT_SELECTED_PERCENTILES]
  )

  // Scope growth modeling (session only, extracted hook)
  const scopeGrowth = useScopeGrowthState(sprintData.scopeChangeStats?.averageScopeInjection)

  // Milestone chart selector (which milestone to show on CDF/histogram)
  const [selectedMilestoneIndex, setSelectedMilestoneIndex] = useState(0)

  // Deadline Probability panel target date (v0.33.0). Session-only string. Lives
  // here rather than inside DeadlineProbabilityPanel so the project-change
  // reset effect below can clear it alongside the other forecast state — a
  // target date from project A shouldn't bleed into project B when the user
  // switches.
  const [targetDate, setTargetDate] = useState<string>('')

  // Centralized prerequisite check shared by:
  //  - the auto-recalculate effect below (silent-path gate)
  //  - handleRunForecast (manual-path guard — defense in depth)
  //  - the `canRun` prop passed to ForecastForm (drives the Run Forecast button
  //    disabled state)
  //  - the `runForecastBlockedReason` returned to consumers (rendered as
  //    inline helper text under the button so the user sees WHY it's disabled)
  //
  // See ../lib/run-forecast-prereqs.ts for the rationale. Before v0.31.5 the
  // four call sites had drifted: the button's canRun checked only backlog +
  // velocity, while the handler additionally required cadence + start date —
  // a missing-cadence project left the button enabled and the handler silently
  // bailing with no UI feedback.
  const prereqInputs = useMemo(
    () => ({
      sprintCadenceWeeks: selectedProject?.sprintCadenceWeeks,
      firstSprintStartDate: selectedProject?.firstSprintStartDate,
      remainingBacklog: inputs.remainingBacklog,
      effectiveMean: inputs.effectiveMean,
    }),
    [
      selectedProject?.sprintCadenceWeeks,
      selectedProject?.firstSprintStartDate,
      inputs.remainingBacklog,
      inputs.effectiveMean,
    ]
  )
  const canRun = useMemo(() => canRunForecast(prereqInputs), [prereqInputs])
  const runForecastBlockedReason = useMemo(
    () => getRunForecastBlockedReason(prereqInputs),
    [prereqInputs]
  )

  // Clear results when project changes. `resetScopeGrowth` is extracted to
  // a local binding so exhaustive-deps sees a plain identifier dep rather
  // than the `scopeGrowth.*` member access (which would force the whole
  // `scopeGrowth` object — including frequently-changing toggle state — to
  // be a dep). The function has stable identity (wrapped in `useCallback([])`
  // inside useScopeGrowthState), so listing it does not cause re-runs.
  const { resetScopeGrowth } = scopeGrowth
  // Reset all results state when the selected project changes. React's
  // react-hooks/set-state-in-effect rule flags setState-in-useEffect as an
  // anti-pattern, with the recommended alternative being a `key` prop on the
  // parent for forced remount — too invasive for a tab-switch boundary that
  // owns this much locally-managed state. The setStates here are
  // resetting-to-empty, not cascading derivations, so the cascading-renders
  // concern the rule warns about does not apply.
  useEffect(() => {
    if (prevProjectIdRef.current !== selectedProject?.id) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setResults(null)
      setSimulationData(null)
      setOverallSimulationData(null)
      setMilestoneResultsState(null)
      setCustomResults(EMPTY_CUSTOM_RESULTS)
      setCustomResults2(EMPTY_CUSTOM_RESULTS)
      setSelectedMilestoneIndex(0)
      setTargetDate('')
      /* eslint-enable react-hooks/set-state-in-effect */
      resetScopeGrowth()
      hasRunOnceRef.current = false
      prevProjectIdRef.current = selectedProject?.id
    }
  }, [selectedProject?.id, resetScopeGrowth])

  const handleRunForecast = async () => {
    // Belt-and-braces: same prereq check used by the UI's button-disabled state.
    // If the UI is wired correctly, canRun gates the button so this guard never
    // fires from a user click — but the auto-recalc effect and any future caller
    // also funnels through here, so we keep the runtime guard.
    if (!selectedProject || !canRun) return

    // canRun already guarantees cadence + firstSprintStartDate are set, but the
    // type system can't see that narrowing across a helper boundary. Re-check
    // here so TypeScript can narrow `number | undefined` → `number` at every
    // downstream use site. Runtime-redundant, type-system-essential.
    if (!selectedProject.sprintCadenceWeeks || !selectedProject.firstSprintStartDate) return

    const parsedBacklog = safeParseNumber(inputs.remainingBacklog)
    if (parsedBacklog === null || parsedBacklog <= 0) return
    if (!Number.isFinite(inputs.effectiveMean) || inputs.effectiveMean <= 0) return
    if (!Number.isFinite(inputs.effectiveStdDev) || inputs.effectiveStdDev < 0) return

    const config = {
      remainingBacklog: parsedBacklog,
      velocityMean: inputs.effectiveMean,
      velocityStdDev: inputs.effectiveStdDev,
      startDate: sprintData.forecastStartDate,
      trialCount,
      sprintCadenceWeeks: selectedProject.sprintCadenceWeeks,
    }

    // Pre-calculate productivity factors if enabled adjustments exist
    // Use the cascade-resolved forecastStartDate as anchor, with sprint index 1,
    // so future sprint date ranges align with any custom finish date shifts
    const enabledAdjustments = productivityAdjustments.filter((a) => a.enabled !== false)
    let productivityFactors: number[] | undefined
    if (enabledAdjustments.length > 0) {
      const { factors } = preCalculateSprintFactors(
        sprintData.forecastStartDate,
        selectedProject.sprintCadenceWeeks,
        1,
        enabledAdjustments
      )
      productivityFactors = factors
    }

    try {
      if (inputs.hasMilestones && inputs.cumulativeThresholds.length > 0) {
        const milestoneResult = await runMilestoneSimulation({
          config,
          historicalVelocities: sprintData.canUseBootstrap ? sprintData.historicalVelocities : undefined,
          productivityFactors,
          milestoneThresholds: inputs.cumulativeThresholds,
          scopeGrowthPerSprint: scopeGrowth.scopeGrowthPerSprint,
        })

        const { perMilestoneResults, perMilestoneSimData } = extractMilestoneData(
          milestoneResult, inputs.cumulativeThresholds.length
        )
        setMilestoneResultsState({ milestoneResults: perMilestoneResults, milestoneSimulationData: perMilestoneSimData })

        const lastIdx = perMilestoneResults.length - 1
        setOverallSimulationData(perMilestoneSimData[lastIdx])
        setSimulationData(perMilestoneSimData[lastIdx])
        setResults(perMilestoneResults[lastIdx])
        setSelectedMilestoneIndex(lastIdx)
        setCustomResults(calculateAllCustomPercentiles(
          perMilestoneSimData[lastIdx], customPercentile,
          sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
        ))
        setCustomResults2(calculateAllCustomPercentiles(
          perMilestoneSimData[lastIdx], customPercentile2,
          sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
        ))
      } else {
        const quadResults = await runSimulation({
          config,
          historicalVelocities: sprintData.canUseBootstrap ? sprintData.historicalVelocities : undefined,
          productivityFactors,
          scopeGrowthPerSprint: scopeGrowth.scopeGrowthPerSprint,
        })

        setMilestoneResultsState(null)

        const { results: quadResultsMapped, simData } = extractQuadData(quadResults)
        setOverallSimulationData(simData)
        setSimulationData(simData)
        setResults(quadResultsMapped)
        setCustomResults(calculateAllCustomPercentiles(
          simData, customPercentile,
          sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
        ))
        setCustomResults2(calculateAllCustomPercentiles(
          simData, customPercentile2,
          sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
        ))
      }
      hasRunOnceRef.current = true
    } catch {
      // Aborted simulation (new run started) — ignore
    }
  }

  // Auto-recalculation: re-run forecast when inputs change. Keep an always-fresh
  // ref to the latest handleRunForecast closure so the effect below (which has
  // a static dep array of input values, NOT the function itself) calls the most
  // recent version with up-to-date captured state. Ref updated in a render-free
  // effect per React's lint rule react-hooks/refs (the in-render assignment was
  // a footgun for React Compiler's render-purity analysis).
  const runForecastRef = useRef(handleRunForecast)
  useEffect(() => {
    runForecastRef.current = handleRunForecast
  })

  const debouncedBacklog = useDebounce(inputs.remainingBacklog, 400)
  const debouncedMean = useDebounce(inputs.velocityMean, 400)
  const debouncedStdDev = useDebounce(inputs.velocityStdDev, 400)
  const debouncedCustomGrowth = useDebounce(scopeGrowth.customScopeGrowth, 400)
  const debouncedEstimate = useDebounce(inputs.velocityEstimate, 400)

  useEffect(() => {
    if (!autoRecalculate) return
    // Shared canRun — same gate the manual Run Forecast button uses. Before
    // v0.31.5 this effect used a stripped-down local check (backlog + velocity
    // only) that didn't include cadence / firstSprintStartDate, so auto-recalc
    // would silently call handleRunForecast for missing-cadence projects and
    // handleRunForecast would then silently bail — two layers of silent fail.
    // Centralizing here keeps both paths aligned and gives the UI a single
    // place to surface the blockedReason to the user.
    if (!canRun) return
    // Previously gated on hasRunOnceRef.current — required an initial manual click of
    // "Run Forecast" before auto-recalc would fire. That made auto-recalc effectively
    // opt-in twice (Settings + first click) and left trainees staring at an empty
    // forecast despite valid inputs. canRun is the only correctness gate we need.
    runForecastRef.current()
  }, [
    autoRecalculate,
    canRun,
    debouncedBacklog,
    debouncedMean,
    debouncedStdDev,
    scopeGrowth.modelScopeGrowth,
    scopeGrowth.scopeGrowthMode,
    debouncedCustomGrowth,
    productivityAdjustments,
    inputs.cumulativeThresholds,
    trialCount,
    effectiveForecastMode,
    debouncedEstimate,
    inputs.selectedCV,
    inputs.volatilityMultiplier,
  ])

  const handleCustomPercentileChange = (percentile: number) => {
    setCustomPercentile(percentile)

    const activeSimData = milestoneResultsState && selectedMilestoneIndex < milestoneResultsState.milestoneSimulationData.length
      ? milestoneResultsState.milestoneSimulationData[selectedMilestoneIndex]
      : simulationData

    if (activeSimData && selectedProject?.sprintCadenceWeeks) {
      setCustomResults(calculateAllCustomPercentiles(
        activeSimData, percentile,
        sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
      ))
    }
  }

  const handleCustomPercentile2Change = (percentile: number) => {
    setCustomPercentile2(percentile)

    const activeSimData = milestoneResultsState && selectedMilestoneIndex < milestoneResultsState.milestoneSimulationData.length
      ? milestoneResultsState.milestoneSimulationData[selectedMilestoneIndex]
      : simulationData

    if (activeSimData && selectedProject?.sprintCadenceWeeks) {
      setCustomResults2(calculateAllCustomPercentiles(
        activeSimData, percentile,
        sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
      ))
    }
  }

  const handleMilestoneIndexChange = (index: number) => {
    setSelectedMilestoneIndex(index)

    if (milestoneResultsState && index < milestoneResultsState.milestoneSimulationData.length) {
      const simData = milestoneResultsState.milestoneSimulationData[index]
      setSimulationData(simData)
      setResults(milestoneResultsState.milestoneResults[index])

      if (selectedProject?.sprintCadenceWeeks) {
        setCustomResults(calculateAllCustomPercentiles(
          simData, customPercentile,
          sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
        ))
        setCustomResults2(calculateAllCustomPercentiles(
          simData, customPercentile2,
          sprintData.forecastStartDate, selectedProject.sprintCadenceWeeks
        ))
      }
    }
  }

  const handleExportCsv = () => {
    if (!selectedProject || !results || !simulationData || !selectedProject.sprintCadenceWeeks) return

    let milestoneExportData: Parameters<typeof generateForecastCsv>[0]['milestoneData']
    if (inputs.hasMilestones && milestoneResultsState) {
      let cumulative = 0
      const msExport = inputs.milestones.map((m) => {
        cumulative += m.backlogSize
        return { name: m.name, backlogSize: m.backlogSize, cumulativeBacklog: cumulative }
      })
      milestoneExportData = {
        milestones: msExport,
        distributions: {
          truncatedNormal: milestoneResultsState.milestoneResults.map((r) => r.truncatedNormal),
          lognormal: milestoneResultsState.milestoneResults.map((r) => r.lognormal),
          gamma: milestoneResultsState.milestoneResults.map((r) => r.gamma),
          bootstrap: milestoneResultsState.milestoneResults[0]?.bootstrap
            ? milestoneResultsState.milestoneResults.map((r) => r.bootstrap!)
            : null,
          triangular: milestoneResultsState.milestoneResults.map((r) => r.triangular),
          uniform: milestoneResultsState.milestoneResults.map((r) => r.uniform),
        },
      }
    }

    const csvContent = generateForecastCsv({
      config: {
        projectName: selectedProject.name,
        remainingBacklog: safeParseNumber(inputs.remainingBacklog) ?? 0,
        velocityMean: inputs.effectiveMean,
        velocityStdDev: inputs.effectiveStdDev,
        startDate: sprintData.forecastStartDate,
        sprintCadenceWeeks: selectedProject.sprintCadenceWeeks,
        trialCount,
        productivityAdjustments: productivityAdjustments.filter((a) => a.enabled !== false),
        milestones: inputs.hasMilestones ? inputs.milestones : undefined,
        scopeGrowthPerSprint: scopeGrowth.scopeGrowthPerSprint,
        forecastMode: effectiveForecastMode,
        velocityEstimate: effectiveForecastMode === 'subjective' ? (Number(inputs.velocityEstimate) || undefined) : undefined,
        selectedCV: effectiveForecastMode === 'subjective' ? inputs.selectedCV : undefined,
        volatilityMultiplier: effectiveForecastMode !== 'subjective' ? inputs.volatilityMultiplier : undefined,
      },
      truncatedNormalResults: results.truncatedNormal,
      lognormalResults: results.lognormal,
      gammaResults: results.gamma,
      bootstrapResults: results.bootstrap,
      triangularResults: results.triangular,
      uniformResults: results.uniform,
      truncatedNormalSprintsRequired: simulationData.truncatedNormal,
      lognormalSprintsRequired: simulationData.lognormal,
      gammaSprintsRequired: simulationData.gamma,
      bootstrapSprintsRequired: simulationData.bootstrap,
      triangularSprintsRequired: simulationData.triangular,
      uniformSprintsRequired: simulationData.uniform,
      milestoneData: milestoneExportData,
    })

    downloadCsv(csvContent, generateFilename(selectedProject.name))
    toast.success('Forecast exported to CSV')
  }

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setViewingProjectId(e.target.value)
  }

  return {
    // Loading / empty states
    isClient,
    projects,
    selectedProject,

    // Sprint data (from useSprintData)
    projectSprints: sprintData.projectSprints,
    includedSprints: sprintData.includedSprints,
    completedSprintCount: sprintData.completedSprintCount,
    forecastStartDate: sprintData.forecastStartDate,
    resolvedSprintDates: sprintData.resolvedSprintDates,
    calculatedStats: sprintData.calculatedStats,

    // Milestone data (from useForecastInputs)
    milestones: inputs.milestones,
    hasMilestones: inputs.hasMilestones,
    cumulativeThresholds: inputs.cumulativeThresholds,
    milestoneCompletionInfo,

    // Forecast mode
    forecastMode: effectiveForecastMode,
    setForecastMode: inputs.setForecastMode,

    // Form state (from useForecastInputs)
    lastSprintBacklog: inputs.lastSprintBacklog,
    remainingBacklog: inputs.remainingBacklog,
    derivedBacklogFromIncluded: inputs.derivedBacklogFromIncluded,
    hasBacklogDrift: inputs.hasBacklogDrift,
    velocityMean: inputs.velocityMean,
    velocityStdDev: inputs.velocityStdDev,
    effectiveMean: inputs.effectiveMean,
    effectiveStdDev: inputs.effectiveStdDev,
    includedSprintCount: sprintData.includedSprintCount,
    setRemainingBacklog: inputs.setRemainingBacklog,
    resetRemainingBacklogToDerived: inputs.resetRemainingBacklogToDerived,
    setVelocityMean: inputs.setVelocityMean,
    setVelocityStdDev: inputs.setVelocityStdDev,

    // Subjective mode inputs
    velocityEstimate: inputs.velocityEstimate,
    selectedCV: inputs.selectedCV,
    setVelocityEstimate: inputs.setVelocityEstimate,
    setSelectedCV: inputs.setSelectedCV,

    // History mode volatility adjustment
    volatilityMultiplier: inputs.volatilityMultiplier,
    setVolatilityMultiplier: inputs.setVolatilityMultiplier,

    // Scope growth modeling (from useScopeGrowthState)
    scopeChangeStats: sprintData.scopeChangeStats,
    ...scopeGrowth,

    // Simulation state
    isSimulating,

    // Results
    results,
    simulationData,
    overallSimulationData,
    milestoneResultsState,
    customPercentile,
    customResults,
    customPercentile2,
    customResults2,
    selectedResultsPercentiles,
    setSelectedResultsPercentiles,
    selectedMilestoneIndex,

    // Deadline Probability panel (v0.33.0)
    targetDate,
    setTargetDate,

    // Chart settings (from useChartSettings)
    ...charts,

    // Run-forecast prerequisites (centralized — see ../lib/run-forecast-prereqs.ts)
    canRun,
    runForecastBlockedReason,

    // Handlers
    handleRunForecast,
    handleCustomPercentileChange,
    handleCustomPercentile2Change,
    handleMilestoneIndexChange,
    handleExportCsv,
    handleProjectChange,
  }
}
