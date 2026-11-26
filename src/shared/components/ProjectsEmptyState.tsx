// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import { TOOLBAR_BUTTON, TOOLBAR_PRIMARY, TOOLBAR_SECONDARY } from './toolbar-button-styles'

// v0.31.1: an empty state with twin calls to action ("Create New Project" + "Load Sample Project"), used on the
// Projects tab (the welcome variant) and the Forecast tab (the forecast-needs-project variant).
//
// v0.53.0 (FRAME26 clean-up W): the welcome variant is the SPERT® Suite frame's Welcome panel (contract §3, §7;
// stylesheet v3): `.sf-empty` draws it 16 px below the heading row, the full column wide, a 1 px dashed border on the
// page ground in both themes, and it carries `data-sf="empty"` itself. Its title is "Welcome to " and the brand row's
// title exactly, the ® in the same `.sf-mark` (until v0.53.0 it read "Welcome to SPERT Forecaster", sat 24 px down on
// a #171717 card in dark, with 35 px buttons). The Forecast tab's variant is inside a working view (contract §10) and
// keeps its own card; only its note's dark colour changed (3.71:1 → 6.89:1).

type EmptyStateVariant = 'welcome' | 'forecast-needs-project'

interface ProjectsEmptyStateProps {
  variant: EmptyStateVariant
  onCreateNew: () => void
  onLoadSample: () => void
}

const SUBHEADS: Record<EmptyStateVariant, string> = {
  welcome:
    "Forecast project completion dates using Monte Carlo simulation and your team's velocity — historical or estimated.",
  'forecast-needs-project':
    "Forecast project completion dates using Monte Carlo simulation and your team's velocity.",
}

const NOTE =
  'The sample project is a working example with eight sprints of history. You can explore it, edit it, or delete it at any time.'

export function ProjectsEmptyState({ variant, onCreateNew, onLoadSample }: ProjectsEmptyStateProps) {
  if (variant === 'welcome') return <WelcomePanel onCreateNew={onCreateNew} onLoadSample={onLoadSample} />
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
        You&apos;ll need a project to forecast
      </h2>
      <p className="text-sm text-spert-text-muted dark:text-gray-400 max-w-prose mx-auto">
        {SUBHEADS[variant]}
      </p>
      {/* v0.49.0: the dashboard toolbar's look (GanttApp's `.pt-btn`), from the same shared strings. In dark mode the
          secondary button is transparent here (v0.50.3): this card is bg-card (#171717), where the shared
          dark:bg-gray-900 (#101828) showed as a bluer box. */}
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
        <button type="button" onClick={onCreateNew} className={cn(TOOLBAR_BUTTON, TOOLBAR_PRIMARY)}>
          Create New Project
        </button>
        <button
          type="button"
          onClick={onLoadSample}
          className={cn(TOOLBAR_BUTTON, TOOLBAR_SECONDARY, 'dark:bg-transparent')}
        >
          Load Sample Project
        </button>
      </div>
      {/* dark: gray-400 (6.89:1 on #171717); gray-500 measured 3.71 (FRAME26 clean-up, v0.53.0). */}
      <p className="mt-4 text-xs italic text-spert-text-muted dark:text-gray-400 max-w-prose mx-auto">{NOTE}</p>
    </div>
  )
}

/** The frame's Welcome panel: the Projects tab with no projects (v0.53.0). Its buttons are the toolbar's. */
function WelcomePanel({ onCreateNew, onLoadSample }: Omit<ProjectsEmptyStateProps, 'variant'>) {
  return (
    <div className="sf-empty" data-sf="empty" role="region" aria-labelledby="empty-state-heading">
      <h2 id="empty-state-heading" className="sf-empty-title">
        Welcome to SPERT<span className="sf-mark">®</span> Forecaster
      </h2>
      <p className="sf-empty-text">{SUBHEADS.welcome}</p>
      <div className="sf-empty-actions">
        <button type="button" onClick={onCreateNew} className={cn('sf-btn', TOOLBAR_BUTTON, TOOLBAR_PRIMARY)}>
          Create New Project
        </button>
        <button type="button" onClick={onLoadSample} className={cn('sf-btn', TOOLBAR_BUTTON, TOOLBAR_SECONDARY)}>
          Load Sample Project
        </button>
      </div>
      <p className="sf-empty-note">{NOTE}</p>
    </div>
  )
}
