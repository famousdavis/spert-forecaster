// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useCallback, useMemo } from 'react'
import { TabNavigation, type TabId } from './TabNavigation'
import { Footer } from './Footer'
import { ProjectsTab } from '@/features/projects'
import { SprintHistoryTab } from '@/features/sprint-history'
import { ForecastTab } from '@/features/forecast'
import { AboutTab } from '@/features/about'
import { SettingsTab } from '@/features/settings'
import { APP_DESCRIPTION } from '@/shared/constants'
import { useProjectStore } from '@/shared/state/project-store'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { HeaderThemeToggle } from '@/shared/components/ThemeToggle'
import { UserMenu } from '@/features/auth'

import { KeyboardShortcutsHelp } from '@/shared/components/KeyboardShortcutsHelp'
import { useKeyboardShortcuts, type KeyboardShortcut } from '@/shared/hooks'
import { Toaster } from 'sonner'
import { FirstRunBanner } from './FirstRunBanner'
import { LocalStorageWarningBanner } from './LocalStorageWarningBanner'

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('projects')
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false)
  const setViewingProjectId = useProjectStore((state) => state.setViewingProjectId)

  const handleViewHistory = useCallback((projectId: string) => {
    setViewingProjectId(projectId)
    setActiveTab('sprint-history')
  }, [setViewingProjectId])

  // Define keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = useMemo(() => [
    {
      key: '1',
      description: 'Go to Projects tab',
      action: () => setActiveTab('projects'),
    },
    {
      key: '2',
      description: 'Go to Sprint History tab',
      action: () => setActiveTab('sprint-history'),
    },
    {
      key: '3',
      description: 'Go to Forecast tab',
      action: () => setActiveTab('forecast'),
    },
    {
      key: '4',
      description: 'Go to Settings tab',
      action: () => setActiveTab('settings'),
    },
    {
      key: '5',
      description: 'Go to About tab',
      action: () => setActiveTab('about'),
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      action: () => setIsShortcutsHelpOpen((prev) => !prev),
    },
  ], [])

  useKeyboardShortcuts(shortcuts)

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 p-4 sm:p-6 md:p-8 transition-colors">
      <div className="max-w-[1200px] mx-auto px-2 sm:px-4 md:px-8">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl sm:text-[1.75rem] md:text-[2.1rem] mb-1">
              <span
                className="font-bold bg-gradient-to-r from-spert-blue-light to-spert-blue-dark bg-clip-text text-transparent"
              >
                SPERT</span><span className="text-gray-400 dark:text-gray-500 font-normal text-base sm:text-lg align-top">®</span>
              <span
                className="font-bold bg-gradient-to-r from-spert-blue-light to-spert-blue-dark bg-clip-text text-transparent"
              > Forecaster</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">{APP_DESCRIPTION}</p>
          </div>
          <div className="flex items-center gap-2">
            <HeaderThemeToggle />
            <UserMenu />
          </div>
        </header>

        <FirstRunBanner />
        <LocalStorageWarningBanner />

        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="mt-8">
          {activeTab === 'projects' && <ErrorBoundary><ProjectsTab onViewHistory={handleViewHistory} /></ErrorBoundary>}
          {activeTab === 'sprint-history' && <ErrorBoundary><SprintHistoryTab /></ErrorBoundary>}
          {activeTab === 'forecast' && <ErrorBoundary><ForecastTab /></ErrorBoundary>}
          {activeTab === 'about' && <ErrorBoundary><AboutTab /></ErrorBoundary>}
          {activeTab === 'settings' && <ErrorBoundary><SettingsTab /></ErrorBoundary>}
        </main>

        <Footer />
      </div>
      <Toaster position="bottom-right" richColors />
      <KeyboardShortcutsHelp
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
        shortcuts={shortcuts}
      />
    </div>
  )
}
