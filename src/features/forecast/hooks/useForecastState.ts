// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  useProjectStore,
  selectViewingProject,
} from '@/shared/state/project-store'
import {
  useForecastResultsStore,
  selectRecordFor,
  type ForecastScope,
  type ForecastRunRecord,
} from '@/shared/state/forecast-results-store'
import { readForecastInputSnapshot } from '@/shared/state/forecast-snapshot-source'
import { isRecordStale } from '@/shared/lib/forecast-staleness'
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
import { currentSimulationGeneration } from '@/shared/lib/simulation-generation'
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
export function extractQuadData(raw: QuadForecastResult): { results: QuadResults; simData: QuadSimulationData } {
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
export function extractMilestoneData(
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

/** A record whose only scope is the whole project — i.e. a non-milestone run. */
function isProjectScopeRecord(record: ForecastRunRecord | null): boolean {
  return record?.scopes[0]?.kind === 'project'
}

export function useForecastState() {
  const isClient = useIsClient()
  const { runSimulation, runMilestoneSimulation } = useSimulationWorker()
  const projects = useProjectStore((state) => state.projects)
  const selectedProject = useProjectStore(selectViewingProject)
  const setViewingProjectId = useProjectStore((state) => state.setViewingProjectId)

  // Global settings
  const trialCount = useSettingsStore((s) => s.trialCount)
  const autoRecalculate = useSettingsStore((s) => s.autoRecalculate)
  const defaultPercentile = useSettingsStore((s) => s.defaultCustomPercentile)
  const defaultPercentile2 = useSettingsStore((s) => s.defaultCustomPercentile2)
  const defaultResultsPercentiles = useSettingsStore((s) => s.defaultResultsPercentiles)

  // Composed hooks
  const sprintData = useSprintData()
  // Use the *included* sprint subset so that toggling a sprint's inclusion updates the
  // derived backlog value for the Forecast tab's Remaining Backlog field (Item 2 fix).
  const inputs = useForecastInputs(sprintData.calculatedStats, sprintData.includedSprintCount, sprintData.includedSprints)
  const charts = useChartSettings()

  const projectId = selectedProject?.id

  // ── Lifted state (v0.36.0) ────────────────────────────────────────────────
  // Results and view state live in the forecast-results store so they survive
  // a tab switch (AppShell unmounts the Forecast tab), and so the freshness
  // check can read them from outside React.
  const record = useForecastResultsStore((s) => selectRecordFor(s, projectId))
  const isSimulatingState = useForecastResultsStore((s) => s.isSimulating)
  const view = useForecastResultsStore((s) => (projectId ? s.viewState[projectId] : undefined))
  const ensureViewState = useForecastResultsStore((s) => s.ensureViewState)
  const patchViewState = useForecastResultsStore((s) => s.patchViewState)
  const setSelectedMilestoneIndexAction = useForecastResultsStore((s) => s.setSelectedMilestoneIndex)
  const publishRecord = useForecastResultsStore((s) => s.publishRecord)
  const clearIsSimulatingIfToken = useForecastResultsStore((s) => s.clearIsSimulatingIfToken)

  const isSimulating = !!isSimulatingState && isSimulatingState.projectId === projectId

  // Lazy per-project creation, seeded from settings where a default exists.
  //
  // ACCEPTED BEHAVIOR CHANGE: customPercentile, customPercentile2 and
  // selectedResultsPercentiles used to re-seed from settings-store on EVERY
  // mount of this hook — i.e. on every re-entry to the Forecast tab. Entries
  // are now created on first read only, so changing a Settings default stops
  // applying to a project already visited this session. That is the point of
  // per-project persistence; the old behavior silently discarded per-project
  // choices on every tab switch.
  useEffect(() => {
    if (!projectId) return
    ensureViewState(projectId, {
      customPercentile: defaultPercentile,
      customPercentile2: defaultPercentile2,
      selectedResultsPercentiles:
        defaultResultsPercentiles?.length > 0
          ? [...defaultResultsPercentiles]
          : [...DEFAULT_SELECTED_PERCENTILES],
    })
  }, [projectId, ensureViewState, defaultPercentile, defaultPercentile2, defaultResultsPercentiles])

  const customPercentile = view?.customPercentile ?? defaultPercentile
  const customPercentile2 = view?.customPercentile2 ?? defaultPercentile2
  const fallbackResultsPercentiles = useMemo(
    () =>
      defaultResultsPercentiles?.length > 0
        ? [...defaultResultsPercentiles]
        : [...DEFAULT_SELECTED_PERCENTILES],
    [defaultResultsPercentiles]
  )
  const selectedResultsPercentiles = view?.selectedResultsPercentiles ?? fallbackResultsPercentiles

  // Session-only target date for the Deadline Probability panel (v0.33.0).
  //
  // It used to live in this hook so a project-change reset effect could clear
  // it — "a target date from project A shouldn't bleed into project B when
  // the user switches." Per-project keying in the view-state map replaces that
  // mechanism; the invariant is unchanged, and this comment travels with the
  // field so the next reader does not restore the effect.
  const targetDate = view?.targetDate ?? ''

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

  const scopeGrowth = useScopeGrowthState(projectId, sprintData.scopeChangeStats?.averageScopeInjection)

  // ── Results, derived from the record ──────────────────────────────────────
  const milestoneResultsState = useMemo<MilestoneResults | null>(() => {
    if (!record || isProjectScopeRecord(record)) return null
    return {
      milestoneResults: record.quadResults,
      milestoneSimulationData: record.simData,
    }
  }, [record])

  const selectedMilestoneIndex = view?.selectedMilestoneIndex ?? 0
  const activeScopeIndex = useMemo(() => {
    if (!record) return 0
    if (isProjectScopeRecord(record)) return 0
    return Math.max(0, Math.min(selectedMilestoneIndex, record.scopes.length - 1))
  }, [record, selectedMilestoneIndex])

  const results = record?.quadResults[activeScopeIndex] ?? null
  const simulationData = record?.simData[activeScopeIndex] ?? null
  // Overall (total backlog) simulation data — used by the burn-up chart; not
  // swapped by the milestone dropdown, so it is always the LAST scope.
  const overallSimulationData = record ? (record.simData[record.simData.length - 1] ?? null) : null

  // customResults / customResults2 are DERIVED now, not imperative state.
  //
  // ACCEPTED BEHAVIOR CHANGE: as useState cells they retained their previous
  // value when the write guard was false (mid-switch, missing cadence).
  // Derived, they yield the empty value in that frame. The byte-identity gate
  // covers the steady state, not this frame.
  const cadence = selectedProject?.sprintCadenceWeeks
  const customResults = useMemo<QuadCustomResults>(() => {
    if (!simulationData || !cadence) return EMPTY_CUSTOM_RESULTS
    return calculateAllCustomPercentiles(
      simulationData, customPercentile, sprintData.forecastStartDate, cadence
    )
  }, [simulationData, customPercentile, sprintData.forecastStartDate, cadence])

  const customResults2 = useMemo<QuadCustomResults>(() => {
    if (!simulationData || !cadence) return EMPTY_CUSTOM_RESULTS
    return calculateAllCustomPercentiles(
      simulationData, customPercentile2, sprintData.forecastStartDate, cadence
    )
  }, [simulationData, customPercentile2, sprintData.forecastStartDate, cadence])

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

  const handleRunForecast = async () => {
    // Resolve from the store rather than the closure: this is the same value
    // the publish-time re-resolution compares against, and the auto-recalc
    // effect reaches this function through a ref.
    const project = selectViewingProject(useProjectStore.getState())
    if (!project || !canRun) return

    // canRun already guarantees cadence + firstSprintStartDate are set, but the
    // type system can't see that narrowing across a helper boundary.
    if (!project.sprintCadenceWeeks || !project.firstSprintStartDate) return

    // ── RUN-START CAPTURE ───────────────────────────────────────────────────
    // The project id (trap 2), the generation token, and the run config are
    // captured together, BEFORE any await.
    //
    // runConfig comes from readForecastInputSnapshot — the SAME builder that
    // produces the staleness comparand. Building it at publish time instead
    // would describe the store's *current* inputs, so an input edited during a
    // long run yields a record that is fresh by construction and
    // mis-attributed. Building it from this function's React closures would
    // let the two sides diverge, which makes every record instantly stale and
    // turns the auto-recalculate gate into a continuous worker loop under the
    // shipped autoRecalculate: true default.
    const runProjectId = project.id
    const startGen = currentSimulationGeneration()
    const runConfig = readForecastInputSnapshot(project)

    if (runConfig.remainingBacklog <= 0) return
    if (!Number.isFinite(runConfig.velocityMean) || runConfig.velocityMean <= 0) return
    if (!Number.isFinite(runConfig.velocityStdDev) || runConfig.velocityStdDev < 0) return

    // The worker payload is read straight off runConfig, so the record
    // provably describes what the simulation consumed.
    const config = {
      remainingBacklog: runConfig.remainingBacklog,
      velocityMean: runConfig.velocityMean,
      velocityStdDev: runConfig.velocityStdDev,
      startDate: runConfig.startDate,
      trialCount: runConfig.trialCount,
      sprintCadenceWeeks: runConfig.sprintCadenceWeeks,
    }
    const scopeGrowthArg = runConfig.scopeGrowthPerSprint ?? undefined

    // Pre-calculate productivity factors if enabled adjustments exist.
    // Anchored on runConfig.startDate with sprint index 1, so future sprint
    // date ranges align with any custom finish date shifts.
    const enabledAdjustments = productivityAdjustments.filter((a) => a.enabled !== false)
    let productivityFactors: number[] | undefined
    if (enabledAdjustments.length > 0) {
      const { factors } = preCalculateSprintFactors(
        runConfig.startDate,
        runConfig.sprintCadenceWeeks,
        1,
        enabledAdjustments
      )
      productivityFactors = factors
    }

    const thresholds = inputs.cumulativeThresholds
    const useMilestones = inputs.hasMilestones && thresholds.length > 0
    const milestoneNames = inputs.milestones.map((m) => m.name)

    /**
     * Publish, unless the resolved project changed under us.
     *
     * TRAP 2: selectViewingProject falls back to projects[0]. If a
     * collaborator deletes the viewed project mid-run, publishing under the
     * PUBLISH-time resolved id would stamp project B's arrays with project
     * A's id — the D13 read gate would then match, and the results would be
     * served under the wrong project's name. The choice is to SUPPRESS
     * entirely, not to publish under the captured id: the captured project
     * may no longer exist at all.
     */
    const publishIfStillCurrent = (
      quadResults: QuadResults[],
      simData: QuadSimulationData[],
      scopes: ForecastScope[]
    ): boolean => {
      const stillCurrent = selectViewingProject(useProjectStore.getState())
      if (stillCurrent?.id !== runProjectId) return false
      publishRecord({
        projectId: runProjectId,
        runAt: new Date().toISOString(),
        runConfig,
        simData,
        quadResults,
        scopes,
      })
      return true
    }

    try {
      if (useMilestones) {
        const milestoneResult = await runMilestoneSimulation({
          config,
          historicalVelocities: sprintData.canUseBootstrap ? sprintData.historicalVelocities : undefined,
          productivityFactors,
          milestoneThresholds: thresholds,
          scopeGrowthPerSprint: scopeGrowthArg,
        }, runProjectId)
        if (currentSimulationGeneration() !== startGen) return  // G1 — stale result, sign-out fired

        const { perMilestoneResults, perMilestoneSimData } = extractMilestoneData(
          milestoneResult, thresholds.length
        )
        const lastIdx = perMilestoneResults.length - 1
        // D20: with milestones, cumulative-final REPLACES the last milestone
        // entry, so N milestones yield N scopes.
        const scopes: ForecastScope[] = thresholds.map((threshold, i) => ({
          kind: i === lastIdx ? 'cumulative-final' : 'milestone',
          milestoneIndex: i,
          label: milestoneNames[i] ?? `Milestone ${i + 1}`,
          cumulativeThreshold: threshold,
          // Threshold above the backlog, and NOTHING ELSE. A trial that exits
          // by completion has crossed every threshold <= backlog regardless of
          // scope growth, because the crossing test runs in the same loop
          // iteration `remaining` goes non-positive. Growth delays crossings;
          // it does not prevent them. Do not add a scope-growth disjunct.
          thresholdUnreachable: threshold > runConfig.remainingBacklog,
        }))
        if (publishIfStillCurrent(perMilestoneResults, perMilestoneSimData, scopes)) {
          setSelectedMilestoneIndexAction(runProjectId, lastIdx)
        }
      } else {
        const quadResults = await runSimulation({
          config,
          historicalVelocities: sprintData.canUseBootstrap ? sprintData.historicalVelocities : undefined,
          productivityFactors,
          scopeGrowthPerSprint: scopeGrowthArg,
        }, runProjectId)
        if (currentSimulationGeneration() !== startGen) return  // G1 — stale result, sign-out fired

        const { results: quadResultsMapped, simData } = extractQuadData(quadResults)
        const scopes: ForecastScope[] = [{
          kind: 'project',
          milestoneIndex: null,
          label: project.name,
          cumulativeThreshold: runConfig.remainingBacklog,
          thresholdUnreachable: false,
        }]
        publishIfStillCurrent([quadResultsMapped], [simData], scopes)
      }
    } catch {
      // Path 4 of the five that stop a run: an aborted or failed simulation.
      // Clearing under the token means a replacement run already in flight
      // keeps its own flag.
      const inFlight = useForecastResultsStore.getState().isSimulating
      if (inFlight) clearIsSimulatingIfToken(inFlight.runToken)
    }
  }

  // Auto-recalculation: re-run forecast when inputs change. Keep an always-fresh
  // ref to the latest handleRunForecast closure so the effect below (which has
  // a static dep array of input values, NOT the function itself) calls the most
  // recent version with up-to-date captured state. Ref updated in a render-free
  // effect per React's lint rule react-hooks/refs.
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
    if (!canRun) return

    // D14: run only when the resolved project's record is ABSENT or STALE.
    // Without this gate the effect fires on every dependency change including
    // one its own publish caused.
    //
    // TRAP 1: the record AND the comparand both come from getState(), never
    // from a reactive value. Reading the undebounced derivations directly here
    // would either trip react-hooks/exhaustive-deps or, with the dep array
    // widened to satisfy it, fire a simulation on every keystroke.
    const project = selectViewingProject(useProjectStore.getState())
    if (!project) return
    const resultsState = useForecastResultsStore.getState()
    if (resultsState.isSimulating) return
    const current = selectRecordFor(resultsState, project.id)
    if (!isRecordStale(current?.runConfig ?? null, readForecastInputSnapshot(project))) return

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
    // The record itself: a publish must re-evaluate the gate, which is what
    // turns "absent" into "fresh" and stops the effect re-firing.
    record,
  ])

  const handleCustomPercentileChange = (percentile: number) => {
    if (projectId) patchViewState(projectId, { customPercentile: percentile })
  }

  const handleCustomPercentile2Change = (percentile: number) => {
    if (projectId) patchViewState(projectId, { customPercentile2: percentile })
  }

  const setSelectedResultsPercentiles = (percentiles: number[]) => {
    if (projectId) patchViewState(projectId, { selectedResultsPercentiles: percentiles })
  }

  const setTargetDate = (value: string) => {
    if (projectId) patchViewState(projectId, { targetDate: value })
  }

  /**
   * TRAP 5: this re-slices existing results with no re-run, so it is a store
   * write of the index alone. Publishing a record here would stamp a new
   * runAt and reset freshness for a change that altered nothing.
   */
  const handleMilestoneIndexChange = (index: number) => {
    if (projectId) setSelectedMilestoneIndexAction(projectId, index)
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
    selectedMilestoneIndex: activeScopeIndex,

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
