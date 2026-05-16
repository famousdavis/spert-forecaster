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
import { UserMenu, CloudStorageModal } from '@/features/auth'
import { useTheme } from '@/shared/hooks/useTheme'

import { KeyboardShortcutsHelp } from '@/shared/components/KeyboardShortcutsHelp'
import { useKeyboardShortcuts, type KeyboardShortcut } from '@/shared/hooks'
import { Toaster } from 'sonner'
import { FirstRunBanner } from './FirstRunBanner'
import { InvitationBanner } from './InvitationBanner'
import { LocalStorageWarningBanner } from './LocalStorageWarningBanner'

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('projects')
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false)
  const [cloudModalOpen, setCloudModalOpen] = useState(false)
  const setViewingProjectId = useProjectStore((state) => state.setViewingProjectId)
  const { effectiveTheme } = useTheme()
  const faviconSrc = effectiveTheme === 'dark'
    ? '/spert-favicon-forecaster-dark.png'
    : '/spert-favicon-forecaster.png'

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
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors flex flex-col">
      <div className="max-w-[1200px] w-full mx-auto px-2 sm:px-4 md:px-8 p-4 sm:p-6 md:p-8 flex-1 flex flex-col">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconSrc}
                alt="SPERT Forecaster icon"
                className="mr-2 h-7 w-7 rounded-lg ring-1 ring-white/20"
              />
              <h1 className="text-2xl sm:text-[1.75rem] md:text-[2.1rem]">
                <span
                  className="font-bold bg-gradient-to-r from-spert-blue-light to-spert-blue-dark bg-clip-text text-transparent"
                >
                  SPERT</span><span className="text-gray-400 dark:text-gray-500 font-normal text-base sm:text-lg align-top">®</span>
                <span
                  className="font-bold bg-gradient-to-r from-spert-blue-light to-spert-blue-dark bg-clip-text text-transparent"
                > Forecaster</span>
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">{APP_DESCRIPTION}</p>
          </div>
          <div className="flex items-center gap-2">
            <HeaderThemeToggle />
            <UserMenu onRequestOpen={() => setCloudModalOpen(true)} />
          </div>
        </header>

        <InvitationBanner />
        <FirstRunBanner />
        <LocalStorageWarningBanner />

        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="mt-8 flex-1">
          {activeTab === 'projects' && <ErrorBoundary><ProjectsTab onViewHistory={handleViewHistory} /></ErrorBoundary>}
          {activeTab === 'sprint-history' && <ErrorBoundary><SprintHistoryTab /></ErrorBoundary>}
          {activeTab === 'forecast' && <ErrorBoundary><ForecastTab /></ErrorBoundary>}
          {activeTab === 'about' && <ErrorBoundary><AboutTab /></ErrorBoundary>}
          {activeTab === 'settings' && <ErrorBoundary><SettingsTab /></ErrorBoundary>}
        </main>
      </div>

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
      />
    </div>
  )
}
