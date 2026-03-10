// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'

export type TabId = 'projects' | 'sprint-history' | 'forecast' | 'about' | 'settings'

interface Tab {
  id: TabId
  label: string
  hidden?: boolean
}

const TABS: Tab[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'sprint-history', label: 'Sprint History' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' },
]

interface TabNavigationProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="flex gap-2 border-b-2 border-gray-100 dark:border-gray-700 pl-2">
      {TABS.filter((tab) => !tab.hidden).map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'px-5 py-2 border-0 border-b-[3px] rounded-t-lg cursor-pointer font-semibold text-base transition-all duration-200',
            activeTab === tab.id
              ? 'bg-spert-blue dark:bg-blue-700 text-white border-b-spert-blue dark:border-b-blue-700'
              : 'bg-transparent text-spert-text-muted border-b-transparent hover:bg-spert-bg-hover'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
