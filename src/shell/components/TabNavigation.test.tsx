// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// TabNavigation had ZERO executions before this file — no test, never imported
// by any test — which is how five buttons carrying one attribute between them
// went unnoticed. Active state was signalled purely by a blue fill: visible on
// screen, invisible to assistive technology. WCAG 2.2 4.1.2.
//
// ⚠️ WHAT THESE TESTS PROVE, AND WHAT THEY DO NOT.
// They pin the ATTRIBUTE. They cannot prove the ANNOUNCEMENT — a DOM assertion
// is a proxy for "a screen reader reports the state", and this campaign's
// standing result is that proxies fail (four tested, four wrong). So the
// announcement was confirmed separately, once, by reading the accessibility
// tree of the running app. Reading proves the attribute; running proves the
// announcement. Neither substitutes for the other.
//
// ⚠️ AND THEY ASSERT ACROSS EVERY TAB, NOT ONE.
// A guard checked at a single active tab cannot see an off-by-one in which tab
// gets marked. The count invariant is what makes "all five marked" fail as
// loudly as "none marked" — a presence-only check passes on both.
// ===========================================================================

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { TabNavigation, type TabId } from './TabNavigation'

const TAB_LABELS: Record<TabId, string> = {
  projects: 'Projects',
  'sprint-history': 'Sprint History',
  forecast: 'Forecast',
  settings: 'Settings',
  about: 'About',
}
const ALL_TABS = Object.keys(TAB_LABELS) as TabId[]

function tabButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter((b) =>
    Object.values(TAB_LABELS).includes(b.textContent?.trim() ?? '')
  )
}

describe('TabNavigation — the active tab is programmatically determinable', () => {
  it('renders all five tabs as native buttons, so Enter and Space activate them', () => {
    const { container } = render(<TabNavigation activeTab="projects" onTabChange={vi.fn()} />)
    const buttons = tabButtons(container)
    expect(buttons).toHaveLength(5)
    expect(buttons.every((b) => b.tagName === 'BUTTON')).toBe(true)
    expect(buttons.every((b) => b.type === 'button')).toBe(true)
  })

  // ⚠️ EVERY tab as the active one. Checking only the default would pass on a
  // component that marks the first tab regardless of the prop.
  for (const active of ALL_TABS) {
    it(`marks exactly ${TAB_LABELS[active]} as current, and no other tab`, () => {
      const { container } = render(<TabNavigation activeTab={active} onTabChange={vi.fn()} />)
      const marked = tabButtons(container).filter((b) => b.getAttribute('aria-current') !== null)
      expect(marked).toHaveLength(1)
      expect(marked[0].textContent?.trim()).toBe(TAB_LABELS[active])
      expect(marked[0].getAttribute('aria-current')).toBe('true')
    })
  }

  it('leaves aria-current ABSENT on inactive tabs, never "false"', () => {
    // ⚠️ The sharp one. "false" is a valid aria-current value and some assistive
    // tech announces it, so a tab marked aria-current="false" is worse than an
    // unmarked one — and a presence-only assertion passes on it happily.
    const { container } = render(<TabNavigation activeTab="forecast" onTabChange={vi.fn()} />)
    const inactive = tabButtons(container).filter((b) => b.textContent?.trim() !== 'Forecast')
    expect(inactive).toHaveLength(4)
    for (const b of inactive) {
      expect(b.hasAttribute('aria-current')).toBe(false)
    }
  })

  it('exactly one tab is current in every configuration — the count is the invariant', () => {
    // Holds "all five marked" and "none marked" to the same standard. Either is
    // a defect; a presence-only check catches neither.
    for (const active of ALL_TABS) {
      const { container, unmount } = render(
        <TabNavigation activeTab={active} onTabChange={vi.fn()} />
      )
      const count = tabButtons(container).filter((b) => b.hasAttribute('aria-current')).length
      expect(count, `activeTab=${active}`).toBe(1)
      unmount()
    }
  })

  it('still reports the tab the user asked for, so the fix did not touch navigation', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="projects" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forecast' }))
    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('forecast')
  })

  it('adds no tabindex, so all five stay in the document tab order', () => {
    // The roving-tabindex pattern was declined deliberately (see the component).
    // If a tabindex ever appears here, that decision has been reversed by
    // accident and keyboard navigation has changed.
    const { container } = render(<TabNavigation activeTab="settings" onTabChange={vi.fn()} />)
    for (const b of tabButtons(container)) {
      expect(b.hasAttribute('tabindex')).toBe(false)
    }
  })

  it('declares no tab/tablist roles, which would promise arrow-key navigation', () => {
    const { container } = render(<TabNavigation activeTab="about" onTabChange={vi.fn()} />)
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('[role="tab"]')).toBeNull()
    for (const b of tabButtons(container)) {
      expect(b.hasAttribute('aria-selected')).toBe(false)
    }
  })
})
