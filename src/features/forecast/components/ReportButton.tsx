// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useRef, useMemo, useEffect, useCallback, type RefObject } from 'react'
import { toast } from 'sonner'
import { today } from '@/shared/lib/dates'
import { captureElementAsPng } from '@/shared/lib/copy-image'
import { openForecastReport, type ReportSection } from '../lib/generate-report'

interface ChartRef {
  id: ReportSection['id']
  label: string
  ref: RefObject<HTMLDivElement | null>
}

interface ReportButtonProps {
  forecastResultsRef: RefObject<HTMLDivElement | null>
  burnUpChartRef?: RefObject<HTMLDivElement | null>
  distributionChartRef?: RefObject<HTMLDivElement | null>
  histogramChartRef?: RefObject<HTMLDivElement | null>
  projectName: string
  summaryText: string
}

export function ReportButton({
  forecastResultsRef,
  burnUpChartRef,
  distributionChartRef,
  histogramChartRef,
  projectName,
  summaryText,
}: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [includeResults, setIncludeResults] = useState(true)
  const popoverRef = useRef<HTMLDivElement>(null)

  const chartRefs = useMemo<ChartRef[]>(() => [
    ...(burnUpChartRef ? [{ id: 'burnUp' as const, label: 'Burn-Up Chart', ref: burnUpChartRef }] : []),
    ...(distributionChartRef ? [{ id: 'cdf' as const, label: 'CDF Chart', ref: distributionChartRef }] : []),
    ...(histogramChartRef ? [{ id: 'histogram' as const, label: 'Histogram', ref: histogramChartRef }] : []),
  ], [burnUpChartRef, distributionChartRef, histogramChartRef])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    try {
      const sections: ReportSection[] = []

      if (includeResults && forecastResultsRef.current) {
        sections.push({ id: 'results', label: 'Forecast Results', imageDataUrl: await captureElementAsPng(forecastResultsRef.current) })
      }

      for (const chart of chartRefs) {
        if (!chart.ref.current) continue
        sections.push({ id: chart.id, label: chart.label, imageDataUrl: await captureElementAsPng(chart.ref.current) })
      }

      if (sections.length === 0) {
        toast.error('No sections to include. Expand at least one chart or check Forecast Results.')
        return
      }

      openForecastReport(sections, { projectName, generationDate: today(), summaryText })
      toast.success('Report opened in new tab')
      setIsOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setIsGenerating(false)
    }
  }, [includeResults, forecastResultsRef, chartRefs, projectName, summaryText])

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Generate forecast report"
        aria-label="Generate forecast report"
        className="bg-transparent border-none cursor-pointer p-1 opacity-50 hover:opacity-100 transition-opacity duration-200 shrink-0"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-spert-border dark:border-gray-600 rounded-lg shadow-lg p-3 z-10">
          <label className="flex items-center gap-2 text-sm text-spert-text dark:text-gray-300 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={includeResults}
              onChange={() => setIncludeResults((v) => !v)}
              className="cursor-pointer accent-blue-600"
            />
            Include Forecast Results
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Expanded charts are included automatically.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full px-3 py-1.5 text-sm font-medium text-white bg-spert-blue rounded cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      )}
    </div>
  )
}
