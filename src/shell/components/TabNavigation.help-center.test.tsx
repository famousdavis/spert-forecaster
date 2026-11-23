// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do. The PDF guide house rules say the same.

// ===========================================================================
// The Help Center link (v0.51.0) sits at the right-hand end of the tab bar and
// opens this app's page in the SPERT® Suite Help Center in a new tab. It is a
// LINK, never a tab.
//
// ⚠️ WHY THE "NOT A TAB" TESTS LIVE HERE AND NOT IN TabNavigation.test.tsx.
// That file's `tabButtons()` keeps only the buttons whose text is one of the
// five tab labels, so its counts cannot see a sixth button with any other
// label: the link turned into a TABS entry leaves every one of them green.
// The counts below take EVERY button and EVERY aria-current in the bar.
//
// ⚠️ The address is compared as a LITERAL. The component's constant is
// deliberately unexported: a test that imported it would agree with any
// wrong address written there.
// ===========================================================================

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { TabNavigation, type TabId } from './TabNavigation'

const TAB_LABELS_IN_ORDER = ['Projects', 'Sprint History', 'Forecast', 'Settings', 'About']
const ALL_TABS: TabId[] = ['projects', 'sprint-history', 'forecast', 'settings', 'about']
const ACCESSIBLE_NAME = 'Help Center (opens in a new tab)'

function renderBar(activeTab: TabId = 'projects') {
  const { container, unmount } = render(<TabNavigation activeTab={activeTab} onTabChange={vi.fn()} />)
  const bar = container.firstElementChild as HTMLElement
  const link = screen.getByRole('link', { name: ACCESSIBLE_NAME })
  return { bar, link, unmount }
}

describe('TabNavigation — the Help Center link', () => {
  it('points at this app’s Help Center page, exactly', () => {
    const { link } = renderBar()
    expect(link.getAttribute('href')).toBe('https://spertsuite.com/help/forecaster')
  })

  it('opens in a new tab, without handing the opener or the referrer to it', () => {
    const { link } = renderBar()
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
  })

  it('is named "Help Center (opens in a new tab)", with the arrow hidden from assistive technology', () => {
    const { link } = renderBar()
    // getByRole above already matched the whole accessible name; these pin its parts.
    const arrow = link.querySelector('[aria-hidden="true"]')
    expect(arrow?.textContent?.trim()).toBe('↗')
    const hidden = [...link.querySelectorAll('span')].find((s) => s.textContent?.includes('(opens in a new tab)'))
    expect(hidden, 'the "(opens in a new tab)" text').toBeDefined()
    expect(hidden!.classList.contains('sr-only')).toBe(true)
  })

  // ⚠️ Every active tab, not one: the link must not move when the tabs change.
  for (const active of ALL_TABS) {
    it(`sits directly after About, as the right-hand zone's last element, with ${active} active`, () => {
      const { bar, link } = renderBar(active)
      expect(bar.contains(link)).toBe(true)
      // v0.52.0: the frame's navigation row has two zones; the link ends the right-hand one (Settings · About · Help).
      expect(bar.querySelector('[data-sf="nav-app"]')!.lastElementChild).toBe(link)
      const before = link.previousElementSibling
      expect(before?.tagName).toBe('BUTTON')
      expect(before?.textContent?.trim()).toBe('About')
    })
  }
})

describe('TabNavigation — the Help Center link is not a tab', () => {
  it('leaves exactly five buttons in the bar, the five tabs, in order', () => {
    const { bar } = renderBar()
    const labels = [...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).toEqual(TAB_LABELS_IN_ORDER)
  })

  it('is a plain <a>, not a button', () => {
    const { link } = renderBar()
    expect(link.tagName).toBe('A')
    expect(link.hasAttribute('role')).toBe(false)
  })

  it('never carries aria-current, and exactly one element in the bar does, whichever tab is active', () => {
    for (const active of ALL_TABS) {
      const { bar, link, unmount } = renderBar(active)
      expect(link.hasAttribute('aria-current'), `activeTab=${active}`).toBe(false)
      expect(bar.querySelectorAll('[aria-current]').length, `activeTab=${active}`).toBe(1)
      unmount()
    }
  })

  it('sets no tabindex anywhere in the bar, so Tab visits the five tabs and then the link', () => {
    const { bar } = renderBar()
    expect(bar.querySelectorAll('[tabindex]').length).toBe(0)
  })
})
