// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The navigation row is the SPERT® Suite frame's (FRAME26, contract §3, v0.52.0): two zones, the work items on the
// left (Projects, the collection, first) and Settings · About · Help Center ↗ on the right; every item a `.sf-tab`; the
// active one marked by aria-current="page" alone (the stylesheet draws its underline from that value only); none
// active on a screen no item leads to.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { TabNavigation, type TabId } from './TabNavigation'

afterEach(() => cleanup())

const ALL: TabId[] = ['projects', 'sprint-history', 'forecast', 'settings', 'about']
const LABEL: Record<TabId, string> = { projects: 'Projects', 'sprint-history': 'Sprint History', forecast: 'Forecast', settings: 'Settings', about: 'About' }

function renderNav(activeTab: TabId | null, onTabChange = vi.fn()) {
  const { container } = render(<TabNavigation activeTab={activeTab} onTabChange={onTabChange} />)
  const nav = container.querySelector('nav')!
  const work = nav.querySelector('[data-sf="nav-work"]')!
  const app = nav.querySelector('[data-sf="nav-app"]')!
  return { nav, work, app, items: [...work.children, ...app.children] as HTMLElement[], onTabChange }
}

describe('the frame’s navigation row', () => {
  it('is nav.sf-nav with its hook, one column, and the two zones in order', () => {
    const { nav, work, app } = renderNav('projects')
    expect([nav.className, nav.getAttribute('data-sf')]).toEqual(['sf-nav', 'nav'])
    const row = nav.firstElementChild!
    expect([row.className, [...row.children]]).toEqual(['sf-col sf-nav-row', [work, app]])
    expect([work.className, app.className]).toEqual(['sf-nav-work', 'sf-nav-app'])
  })

  it('the work zone is Projects · Sprint History · Forecast; the app zone Settings · About · Help Center', () => {
    const { work, app } = renderNav('projects')
    expect([...work.children].map((e) => e.textContent?.trim())).toEqual(['Projects', 'Sprint History', 'Forecast'])
    expect([...app.children].map((e) => e.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Settings', 'About', 'Help Center ↗ (opens in a new tab)'])
  })

  it('every tab is a native .sf-tab button; Help Center is the .sf-help link, opening a new tab', () => {
    const { items } = renderNav('projects')
    const tabs = items.slice(0, 5), help = items[5]
    expect(tabs.map((t) => [t.tagName, t.getAttribute('type'), t.className])).toEqual(Array(5).fill(['BUTTON', 'button', 'sf-tab']))
    expect([help.tagName, help.className, help.getAttribute('target')]).toEqual(['A', 'sf-help', '_blank'])
  })

  it.each(ALL)('with %s active: aria-current="page" on that item only, absent (never "false") on the others', (active) => {
    const { items } = renderNav(active)
    expect(items.filter((e) => e.hasAttribute('aria-current')).map((e) => [e.textContent?.trim(), e.getAttribute('aria-current')])).toEqual([[LABEL[active], 'page']])
  })

  it('with no active tab (the changelog, a 404): no item is current, Help Center never', () => {
    const { items } = renderNav(null)
    expect(items.filter((e) => e.hasAttribute('aria-current'))).toEqual([])
  })

  it('an item reports its own tab', () => {
    const { items, onTabChange } = renderNav(null)
    items.slice(0, 5).forEach((b) => fireEvent.click(b))
    expect(onTabChange.mock.calls.map((c) => c[0])).toEqual(['projects', 'sprint-history', 'forecast', 'settings', 'about'])
  })
})
