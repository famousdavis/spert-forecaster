// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

export type TabId = 'projects' | 'sprint-history' | 'forecast' | 'about' | 'settings'

interface Tab {
  id: TabId
  label: string
}

// The navigation row's two zones (FRAME26, contract §3 "Navigation zones", v0.52.0), in row order. The DOM order, and
// so the tab order, is the same as before the frame: Projects, Sprint History, Forecast, Settings, About, Help Center.
// - WORK_TABS, on the left: the collection first ("Projects", named by its noun), then the project views.
// - APP_TABS, on the right: Settings · About, always in that order, then the Help Center link.
const WORK_TABS: readonly Tab[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'sprint-history', label: 'Sprint History' },
  { id: 'forecast', label: 'Forecast' },
]
const APP_TABS: readonly Tab[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' },
]

// This app's page in the SPERT® Suite Help Center. Module-local, like CONTACT_URL in
// CloudLoadingPanel.tsx: the link below is its only consumer. Deliberately not exported, so
// the tests compare the address as a literal and a wrong address here cannot satisfy them.
const HELP_CENTER_URL = 'https://spertsuite.com/help/forecaster'

interface TabNavigationProps {
  /** The tab shown, or null on a screen no item leads to (the changelog, a 404): then no item is active. */
  activeTab: TabId | null
  onTabChange: (tab: TabId) => void
}

function TabButton({ tab, activeTab, onTabChange }: { tab: Tab; activeTab: TabId | null; onTabChange: (tab: TabId) => void }) {
  return (
    <button
      type="button"
      /* The active item is marked by `aria-current="page"` alone: the frame's stylesheet draws its underline
         and accent colour from that attribute, at the same weight as every other item, so nothing moves when
         the selection changes (contract §3, "Active item"). Before v0.52.0 the value was "true", which the
         frame's selector does not match.

         ⚠️ `undefined`, not "false", on the inactive tabs. "false" is a valid aria-current value and some
         assistive tech announces it, so absence is the correct encoding for "not current".

         NOT role="tab"/tablist, for two reasons that point the same way:

         1. That pattern REQUIRES a roving tabindex — one tab stop for the whole list, arrow keys between
            tabs. Adopting the roles without it announces a keyboard contract this app does not honour,
            which is worse than the current silence, and the roles-only edit is exactly the tempting one.
            Adopting it WITH the roving tabindex would change keyboard navigation that already works.

         2. ⚠️ It would not stay correct. spert-scheduler could not use the pattern precisely because its
            tabs acquired focusable descendants — drag, lock, clone, delete (ScenarioTabs.tsx:SortableScenarioTab
            — named by symbol, not line, because that file is in another repository where nothing here can
            verify a line number). Ours are plain labels today, so the pattern is available; the moment a tab
            gains a close button, a badge or a context menu it becomes wrong and has to be unwound.
            aria-current does not depend on a tab's internal structure, so no future feature can invalidate
            it. The sibling repo is the worked example of that happening. */
      aria-current={activeTab === tab.id ? 'page' : undefined}
      onClick={() => onTabChange(tab.id)}
      className="sf-tab"
    >
      {tab.label}
    </button>
  )
}

/**
 * The frame's navigation row (FRAME26, contract §3, v0.52.0): a full-width 44 px band under the brand row, with a
 * 1 px rule. The work zone scrolls sideways only as a safety net; Forecaster's three items fit at every target width.
 * Its look is the frame's (`.sf-tab`): the filled blue pill went with v0.52.0, whose dark active state measured 3.68.
 */
export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="sf-nav" data-sf="nav">
      <div className="sf-col sf-nav-row">
        <div className="sf-nav-work" data-sf="nav-work">
          {WORK_TABS.map((tab) => (
            <TabButton key={tab.id} tab={tab} activeTab={activeTab} onTabChange={onTabChange} />
          ))}
        </div>
        <div className="sf-nav-app" data-sf="nav-app">
          {APP_TABS.map((tab) => (
            <TabButton key={tab.id} tab={tab} activeTab={activeTab} onTabChange={onTabChange} />
          ))}
          {/* Help Center: a LINK that leaves the app, never a tab. So it is not in APP_TABS, not a
              <button>, carries no aria-current and has no keyboard shortcut (1–5 stay the five
              tabs). It sits after About, at the row's right-hand end, as quiet 400-weight muted text
              (the frame's `.sf-help`), so it never reads as one more view of the app. The arrow is
              decoration, hidden from assistive technology; the hidden text gives the accessible name
              "Help Center (opens in a new tab)". ⚠️ The spaces are their own text nodes, outside the
              spans. With the space inside the hidden span, the tests' name computation
              (dom-accessibility-api) trimmed it and gave "Help Center(opens in a new tab)" (measured,
              v0.51.0). */}
          <a href={HELP_CENTER_URL} target="_blank" rel="noopener noreferrer" className="sf-help">
            Help Center{' '}<span aria-hidden="true">↗</span>{' '}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </nav>
  )
}
