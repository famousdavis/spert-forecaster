// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useRef } from 'react'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { type ChartFontSize } from '@/shared/types/burn-up'
import { DEFAULT_BURN_UP_CONFIG, type BurnUpConfig } from '../types'

/**
 * Chart configuration state: font sizes, burn-up config, and copy-to-clipboard refs.
 * Session-only — not persisted to localStorage.
 */
export function useChartSettings() {
  const selectedProject = useProjectStore(selectViewingProject)

  // Burn-up config (per project, session only)
  const setBurnUpConfigStore = useProjectStore((state) => state.setBurnUpConfig)
  const burnUpConfigFromStore = useProjectStore((state) =>
    selectedProject ? state.burnUpConfigs[selectedProject.id] : undefined
  )
  const burnUpConfig = burnUpConfigFromStore ?? DEFAULT_BURN_UP_CONFIG

  const handleBurnUpConfigChange = (config: BurnUpConfig) => {
    if (selectedProject) {
      setBurnUpConfigStore(selectedProject.id, config)
    }
  }

  // Chart font sizes (session only, initialized from global default)
  const defaultFontSize = useSettingsStore((s) => s.defaultChartFontSize)
  const [burnUpFontSize, setBurnUpFontSize] = useState<ChartFontSize>(defaultFontSize)
  const [distributionFontSize, setDistributionFontSize] = useState<ChartFontSize>(defaultFontSize)
  const [histogramFontSize, setHistogramFontSize] = useState<ChartFontSize>(defaultFontSize)

  // Refs for copy-to-clipboard functionality
  const forecastInputsResultsRef = useRef<HTMLDivElement>(null)
  const forecastResultsRef = useRef<HTMLDivElement>(null)
  const distributionChartRef = useRef<HTMLDivElement>(null)
  const histogramChartRef = useRef<HTMLDivElement>(null)
  const percentileSelectorRef = useRef<HTMLDivElement>(null)
  const burnUpChartRef = useRef<HTMLDivElement>(null)

  return {
    burnUpConfig,
    handleBurnUpConfigChange,
    burnUpFontSize,
    setBurnUpFontSize,
    distributionFontSize,
    setDistributionFontSize,
    histogramFontSize,
    setHistogramFontSize,
    forecastInputsResultsRef,
    forecastResultsRef,
    distributionChartRef,
    histogramChartRef,
    percentileSelectorRef,
    burnUpChartRef,
  }
}
