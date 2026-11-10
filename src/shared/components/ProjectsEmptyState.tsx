// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import { TOOLBAR_BUTTON, TOOLBAR_PRIMARY, TOOLBAR_SECONDARY } from './toolbar-button-styles'

// v0.31.1 — Option A empty-state with twin CTAs ("Create New Project" + "Load Sample Project").
// Same component used on both the Projects tab (Welcome variant) and the Forecast tab
// (Forecast-needs-project variant). Slight lead-in difference per context; everything else
// shared.

type EmptyStateVariant = 'welcome' | 'forecast-needs-project'

interface ProjectsEmptyStateProps {
  variant: EmptyStateVariant
  onCreateNew: () => void
  onLoadSample: () => void
}

const HEADINGS: Record<EmptyStateVariant, string> = {
  welcome: 'Welcome to SPERT Forecaster',
  'forecast-needs-project': "You'll need a project to forecast",
}

const SUBHEADS: Record<EmptyStateVariant, string> = {
  welcome:
    "Forecast project completion dates using Monte Carlo simulation and your team's velocity — historical or estimated.",
  'forecast-needs-project':
    "Forecast project completion dates using Monte Carlo simulation and your team's velocity.",
}

export function ProjectsEmptyState({ variant, onCreateNew, onLoadSample }: ProjectsEmptyStateProps) {
  return (
    <div
      className="rounded-lg border border-dashed border-border dark:border-gray-700 p-8 text-center bg-card"
      role="region"
      aria-labelledby="empty-state-heading"
    >
      <h2
        id="empty-state-heading"
        className="text-xl font-semibold text-spert-text dark:text-gray-100 mb-3"
      >
        {HEADINGS[variant]}
      </h2>
      <p className="text-sm text-spert-text-muted dark:text-gray-400 max-w-prose mx-auto">
        {SUBHEADS[variant]}
      </p>
      {/* v0.49.0: the dashboard toolbar's look (GanttApp's `.pt-btn`), from the same shared
          strings, so Load Sample reads the same here and in the toolbar above. */}
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
        <button type="button" onClick={onCreateNew} className={cn(TOOLBAR_BUTTON, TOOLBAR_PRIMARY)}>
          Create New Project
        </button>
        <button
          type="button"
          onClick={onLoadSample}
          className={cn(TOOLBAR_BUTTON, TOOLBAR_SECONDARY)}
        >
          Load Sample Project
        </button>
      </div>
      <p className="mt-4 text-xs italic text-spert-text-muted dark:text-gray-500 max-w-prose mx-auto">
        The sample project is a working example with eight sprints of history. You can explore it,
        edit it, or delete it at any time.
      </p>
    </div>
  )
}
