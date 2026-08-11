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
          type="button"
          /* Which tab is active was carried ONLY by the blue fill below — visible
             to anyone looking at the screen and to nobody else. The buttons were
             keyboard-reachable and the 1–5 shortcuts worked; the state was the
             missing half. WCAG 2.2 4.1.2.

             ⚠️ `undefined`, not "false", on the inactive tabs. "false" is a valid
             aria-current value and some assistive tech announces it, so absence
             is the correct encoding for "not current".

             NOT role="tab"/tablist, for two reasons that point the same way:

             1. That pattern REQUIRES a roving tabindex — one tab stop for the
                whole list, arrow keys between tabs. Adopting the roles without it
                announces a keyboard contract this app does not honour, which is
                worse than the current silence, and the roles-only edit is exactly
                the tempting one. Adopting it WITH the roving tabindex would change
                keyboard navigation that already works.

             2. ⚠️ It would not stay correct. spert-scheduler could not use the
                pattern precisely because its tabs acquired focusable descendants —
                drag, lock, clone, delete (ScenarioTabs.tsx:164). Ours are plain
                labels today, so the pattern is available; the moment a tab gains a
                close button, a badge or a context menu it becomes wrong and has to
                be unwound. aria-current does not depend on a tab's internal
                structure, so no future feature can invalidate it. The sibling repo
                is the worked example of that happening. */
          aria-current={activeTab === tab.id ? 'true' : undefined}
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
