// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TabNavigation, type TabId } from './TabNavigation'
import { Footer } from './Footer'
import { AppHeader } from './AppHeader'
import { ProjectsTab } from '@/features/projects'
import { SprintHistoryTab } from '@/features/sprint-history'
import { ForecastTab } from '@/features/forecast'
import { AboutTab } from '@/features/about'
import { SettingsTab } from '@/features/settings'
import { useProjectStore } from '@/shared/state/project-store'
import { useViewedProject } from '@/shared/state/viewed-project'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { HeadingRow } from '@/shared/components/HeadingRow'
import { CloudStorageModal } from '@/features/auth'

import { KeyboardShortcutsHelp } from '@/shared/components/KeyboardShortcutsHelp'
import { useIsClient, useKeyboardShortcuts, type KeyboardShortcut } from '@/shared/hooks'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FirstRunBanner } from './FirstRunBanner'
import { InvitationBanner } from './InvitationBanner'
import { LocalStorageWarningBanner } from './LocalStorageWarningBanner'
import { ExportCheckWarning } from './ExportCheckWarning'
import { AiConnectivityProvider } from '@/features/connect-ai/AiConnectivityProvider'
import { AiTeardownBanner } from '@/features/connect-ai/components/AiTeardownBanner'
// Deep imports rather than widening `@/features/projects`' barrel, which deliberately exports
// only `ProjectsTab`. The precedent is two lines above; no lint rule enforces either choice.
import { useImportState } from '@/features/projects/hooks/useImportState'
import { useCrosslinkReceiver } from '@/features/projects/hooks/useCrosslinkReceiver'
import { exportWorkspaceBackup } from '@/features/projects/lib/export-backup'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { CloudLoadingPanel, PROJECT_DATA_TABS, awaitsFirstCloudLoad } from './CloudLoadingPanel'
import { ProjectsLoadingHeading } from './ProjectsLoadingHeading'
import { projectViewHeading } from './screen-heading'

/**
 * The SPERT® Suite app frame (FRAME26, contract FRAME-CONTRACT.md, v0.52.0), held by the root layout around every
 * route: the skip link, the brand row, the navigation row, the notices slot, `main` and the footer, in one 1600 px
 * column. The styles are the vendored `src/styles/spert-frame.css`; the `data-sf` hooks let `frame-check` find each
 * landmark without guessing.
 *
 * ⚠️ HELD BY THE LAYOUT (src/app/layout.tsx), not by a page, so it never remounts between "/" and "/changelog": the
 * active tab, an import preview, a held crosslink transfer, the Connect AI provider and the notices' dismissals all
 * survive a visit to the changelog. On "/" `main` shows the active tab; on any other route it shows that route's page
 * (`children`) and no navigation item is active. A tab chosen there (an item, a 1–5 shortcut, the brand) sets the tab
 * in state, then returns to "/": the tab travels in state, never in the URL.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  // `null` only outside the App Router (unit tests): the tabs' route.
  const onTabsRoute = pathname === '/' || pathname === null
  const [activeTab, setActiveTab] = useState<TabId>('projects')
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false)
  const [cloudModalOpen, setCloudModalOpen] = useState(false)
  // The header's account button, whichever one is shown: where focus goes when Cloud Storage closes.
  const userMenuRef = useRef<HTMLButtonElement>(null)
  const setViewingProjectId = useProjectStore((state) => state.setViewingProjectId)
  // ⚠️ Owned HERE, not in ProjectsTab, because ProjectsTab unmounts on every tab switch
  // (see the conditional render below) and a transfer arriving mid-switch would have nothing
  // to land on. The visible consequence is on the FILE path too: an import preview or banner
  // now survives leaving the Projects tab and coming back, where it used to be discarded.
  const importState = useImportState()
  // Inert unless this tab was opened by SPERT Story Map with a transfer parameter AND has an
  // opener. Mounted beside InvitationBanner rather than inside a tab for the same reason the
  // hook above is: the tabs come and go.
  useCrosslinkReceiver(importState)
  // Brief 40, R2: in cloud mode the project tabs wait for the first cloud load.
  // Auth still resolving counts as not loaded — useCloudSync has not started.
  const { mode } = useStorageMode()
  const { user, isLoading: authLoading } = useAuth()
  const cloudDataLoaded = useProjectStore((state) => state.cloudDataLoaded)
  const cloudLoadRetrying = useProjectStore((state) => state.cloudLoadRetrying)
  const cloudLoadError = useProjectStore((state) => state.cloudLoadError)
  const requestCloudLoadRetry = useProjectStore((state) => state.requestCloudLoadRetry)
  const awaitingCloud = awaitsFirstCloudLoad({ mode, authLoading, signedIn: !!user, cloudDataLoaded })
  // The Sprint History and Forecast heading: the project their pickers show (contract §7, "Inside a project").
  // Not before hydration (the server has no projects) and not while the first cloud load is pending (the store may
  // still hold a stale copy): then the heading is the tab's own name.
  const isClient = useIsClient()
  const viewedProject = useViewedProject()
  const viewedName = isClient && !awaitingCloud ? viewedProject?.name : undefined

  // Every way of choosing a tab: the navigation items, the 1–5 shortcuts, the brand, a tile, Forecast's own links.
  const selectTab = useCallback((tab: TabId) => {
    setActiveTab(tab)
    if (!onTabsRoute) router.push('/')
  }, [onTabsRoute, router])

  const handleViewHistory = useCallback((projectId: string) => {
    setViewingProjectId(projectId)
    selectTab('sprint-history')
  }, [setViewingProjectId, selectTab])

  // Define keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = useMemo(() => [
    {
      key: '1',
      description: 'Go to Projects tab',
      action: () => selectTab('projects'),
    },
    {
      key: '2',
      description: 'Go to Sprint History tab',
      action: () => selectTab('sprint-history'),
    },
    {
      key: '3',
      description: 'Go to Forecast tab',
      action: () => selectTab('forecast'),
    },
    {
      key: '4',
      description: 'Go to Settings tab',
      action: () => selectTab('settings'),
    },
    {
      key: '5',
      description: 'Go to About tab',
      action: () => selectTab('about'),
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      // Opens only: while the help is open every page shortcut waits (v0.48.1).
      action: () => setIsShortcutsHelpOpen(true),
    },
  ], [selectTab])

  useKeyboardShortcuts(shortcuts)

  // The page's body under the frame. Every screen's heading row is a direct child of `main` (X4 caps the others);
  // the project views' and the capped screens' rows are rendered here, OUTSIDE each tab's ErrorBoundary, so a view
  // that fails keeps its `h1`. Projects renders its own, because its toolbar's state lives in ProjectsTab.
  const tabBody = (): ReactNode => {
    if (awaitingCloud && PROJECT_DATA_TABS.has(activeTab)) {
      // Contract §7, "Loading": the frame and the heading row render at full geometry; only the body waits.
      const panel = (
        <div className="sf-below">
          <CloudLoadingPanel
            retrying={cloudLoadRetrying}
            error={cloudLoadError}
            onTryAgain={requestCloudLoadRetry}
            onExportBackup={exportWorkspaceBackup}
          />
        </div>
      )
      if (activeTab === 'projects') return <><ProjectsLoadingHeading />{panel}</>
      if (activeTab === 'sprint-history' || activeTab === 'forecast') {
        return <><HeadingRow>{projectViewHeading(activeTab, undefined)}</HeadingRow>{panel}</>
      }
    }
    switch (activeTab) {
      case 'projects':
        return <ErrorBoundary><ProjectsTab onViewHistory={handleViewHistory} importState={importState} /></ErrorBoundary>
      case 'sprint-history':
      case 'forecast': {
        const heading = projectViewHeading(activeTab, viewedName)
        return (
          <>
            <HeadingRow title={viewedName}>{heading}</HeadingRow>
            <div className="sf-below">
              {activeTab === 'sprint-history'
                ? <ErrorBoundary><SprintHistoryTab /></ErrorBoundary>
                : <ErrorBoundary><ForecastTab onTabChange={selectTab} /></ErrorBoundary>}
            </div>
          </>
        )
      }
      case 'settings':
        return <><HeadingRow>Settings</HeadingRow><div className="sf-below"><ErrorBoundary><SettingsTab /></ErrorBoundary></div></>
      case 'about':
        // The ® is never bold (Branding): the heading is 700, the mark 400.
        return <><HeadingRow>About SPERT<span className="font-normal">®</span> Forecaster</HeadingRow><div className="sf-below"><ErrorBoundary><AboutTab /></ErrorBoundary></div></>
    }
  }

  // X4 (contract §8): Settings, About and the changelog are capped at 896 px, aligned at C; the heading row is not.
  const capped = onTabsRoute ? activeTab === 'settings' || activeTab === 'about' : pathname === '/changelog'

  return (
    <TooltipProvider>
    {/* Mounted here, not in the Settings section: the snapshot publisher and
        heartbeat must survive leaving the Settings tab. */}
    <AiConnectivityProvider>
    <div className="sf-app" data-sf="app">
      <a href="#main" className="sf-skip" data-sf="skip">Skip to main content</a>

      <AppHeader
        onNavigateHome={() => selectTab('projects')}
        onOpenAccount={() => setCloudModalOpen(true)}
        accountButtonRef={userMenuRef}
      />

      <TabNavigation activeTab={onTabsRoute ? activeTab : null} onTabChange={selectTab} />

      {/* The app-wide notices, in the frame's notices slot directly under the navigation (the SPERT® suite's
          shared placement, v0.48.0; the frame's slot since v0.52.0): the invitation, then the terms notice, then
          the local-storage caution; the other two keep their places relative to those. ⚠️ Rendered HERE, outside
          the per-tab conditional inside the main element, so a tab switch never remounts them: "Got it" on the caution holds
          until the next page load. The stylesheet hides the slot when no notice shows, so it takes no space. */}
      <div className="sf-col sf-notices" data-sf="notices">
        <InvitationBanner />
        <AiTeardownBanner />
        <FirstRunBanner />
        <LocalStorageWarningBanner />
        <ExportCheckWarning />
      </div>

      <main id="main" className={capped ? 'sf-col sf-main sf-main--capped' : 'sf-col sf-main'} data-sf="main">
        {onTabsRoute ? tabBody() : children}
      </main>

      <Footer />
      <Toaster position="bottom-right" richColors />
      <KeyboardShortcutsHelp
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
        shortcuts={shortcuts}
      />
      <CloudStorageModal
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        returnFocusTo={() => userMenuRef.current}
      />
    </div>
    </AiConnectivityProvider>
    </TooltipProvider>
  )
}
