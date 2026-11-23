// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The SPERT® Suite frame on every Forecaster screen (FRAME26, v0.52.0), through the real AppShell: the five tabs on "/"
// and the changelog on "/changelog". What each screen must show (contract §2, §3, §8): exactly one h1, in main's
// heading row, which is a direct child of main; no heading in the brand row; exactly one navigation item current on a
// tab, none on the changelog; X4's cap on Settings, About and the changelog only; the skip link first, to main; the
// notices slot between the navigation and main. Geometry and colour are frame-check's, in a browser.
//
// Also the route wiring (OP1): the shell is held by the layout, so on "/changelog" a navigation item, a 1–5 shortcut
// or the brand sets the tab and returns to "/"; on "/" nothing routes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/' as string | null, push: vi.fn(), mode: 'local' as 'local' | 'cloud' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: nav.mode, setMode: vi.fn() }) }))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))

import { AppShell } from './AppShell'
import { HeadingRow } from '@/shared/components/HeadingRow'
import { useProjectStore } from '@/shared/state/project-store'
import type { Project } from '@/shared/types'

const T = '2026-01-01T00:00:00.000Z'
const ALPHA: Project = { id: 'p1', name: 'Alpha release', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }

beforeEach(() => {
  // jsdom has no matchMedia; the theme hook asks it for the system theme.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  nav.pathname = '/'
  nav.push.mockReset()
  nav.mode = 'local'
  localStorage.clear()
  useProjectStore.setState({ projects: [], sprints: [], viewingProjectId: null, cloudDataLoaded: false })
})
afterEach(() => cleanup())

const TABS = [
  ['Projects', 'Projects', false],
  ['Sprint History', 'Sprint History', false],
  ['Forecast', 'Forecast', false],
  ['Settings', 'Settings', true],
  ['About', 'About SPERT® Forecaster', true],
] as const

const navItems = () => [...document.querySelectorAll<HTMLElement>('[data-sf="nav-work"] > *, [data-sf="nav-app"] > *')]
const current = () => navItems().filter((e) => e.hasAttribute('aria-current')).map((e) => `${e.textContent?.trim()}=${e.getAttribute('aria-current')}`)
const main = () => document.querySelector<HTMLElement>('main')!

/** What every framed screen must show, whatever its body. */
function expectFrame(h1: string, capped: boolean) {
  const h1s = [...document.querySelectorAll('h1')]
  expect(h1s.map((h) => h.textContent?.trim())).toEqual([h1])
  const row = h1s[0].closest('[data-sf="headrow"]')!
  // In main's heading row; a DIRECT child of main where the body is capped (X4 caps every other child of main).
  expect([main().contains(row), h1s[0].getAttribute('data-sf'), h1s[0].className]).toEqual([true, 'heading', 'sf-heading'])
  if (capped) expect(row.parentElement).toBe(main())
  expect(document.querySelector('header')!.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')).toBeNull()
  expect([main().id, main().getAttribute('data-sf'), main().classList.contains('sf-main--capped')]).toEqual(['main', 'main', capped])
  // The skip link is the frame root's first element and targets main; the notices slot sits between the nav and main.
  const app = document.querySelector('[data-sf="app"]')!
  expect([app.firstElementChild?.getAttribute('data-sf'), app.firstElementChild?.getAttribute('href')]).toEqual(['skip', '#main'])
  const order = ['skip', 'nav', 'notices', 'main', 'footer'].map((k) => [...app.children].findIndex((c) => c.getAttribute('data-sf') === k))
  expect(order).toEqual([...order].sort((a, b) => a - b))
  expect(order.every((i) => i > -1)).toBe(true)
}

describe('the frame on every tab ("/")', () => {
  it.each(TABS)('%s: one h1 (%s) in main’s heading row, the item current, capped: %s', (label, h1, capped) => {
    render(<AppShell />)
    fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: label }))
    expectFrame(h1, capped)
    expect(current()).toEqual([`${label}=page`])
  })

  it('Sprint History and Forecast name the viewed project (OP2), with its full name in title', () => {
    useProjectStore.setState({ projects: [ALPHA], viewingProjectId: ALPHA.id })
    render(<AppShell />)
    for (const label of ['Sprint History', 'Forecast']) {
      fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: label }))
      const h1 = screen.getByRole('heading', { level: 1 })
      expect([label, h1.textContent, h1.getAttribute('title')]).toEqual([label, 'Alpha release', 'Alpha release'])
    }
  })

  it('in cloud mode before the first load, every project tab keeps its heading row above the loading panel (F11)', () => {
    nav.mode = 'cloud'
    render(<AppShell />)
    for (const [label, h1] of [['Projects', 'Projects'], ['Sprint History', 'Sprint History'], ['Forecast', 'Forecast']] as const) {
      fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: label }))
      expectFrame(h1, false)
      expect(main().querySelector('[role="status"]')).not.toBeNull()
    }
    // Projects keeps its four toolbar buttons in place; nothing that writes a project is enabled (Import, Load Sample,
    // New Project), and Export All keeps its own gate (no projects here: disabled).
    fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: 'Projects' }))
    const toolbar = document.querySelector('[data-sf="toolbar"]')!
    const buttons = [...toolbar.querySelectorAll('button')]
    expect(buttons.map((b) => [b.textContent?.trim(), b.disabled])).toEqual([
      ['Export All', true], ['Import', true], ['Load Sample', true], ['New Project', true],
    ])
  })

  it('on "/" nothing routes: a navigation item, a shortcut and the brand only set the tab', () => {
    render(<AppShell />)
    fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: 'Forecast' }))
    fireEvent.keyDown(document, { key: '4' })
    expect(current()).toEqual(['Settings=page'])
    fireEvent.click(screen.getByRole('link', { name: 'SPERT® Forecaster' }))
    expect(current()).toEqual(['Projects=page'])
    expect(nav.push).not.toHaveBeenCalled()
  })
})

describe('the frame on the changelog ("/changelog", OP1)', () => {
  const page = (
    <>
      <HeadingRow>Changelog</HeadingRow>
      <div className="sf-below">release notes</div>
    </>
  )

  it('shows the page inside the frame: one h1 "Changelog", capped (X4), and no navigation item current', () => {
    nav.pathname = '/changelog'
    render(<AppShell>{page}</AppShell>)
    expectFrame('Changelog', true)
    expect(current()).toEqual([])
    expect(screen.getByText('release notes')).toBeTruthy()
    expect(screen.queryByText('← Back to SPERT Forecaster')).toBeNull()
  })

  it('a navigation item sets the tab and returns to "/" (the tab travels in state, not in the URL)', () => {
    nav.pathname = '/changelog'
    const { rerender } = render(<AppShell>{page}</AppShell>)
    fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: 'Forecast' }))
    expect(nav.push.mock.calls).toEqual([['/']])
    // The layout keeps the shell mounted while the route changes: on "/" it shows the tab chosen on the changelog.
    nav.pathname = '/'
    rerender(<AppShell>{null}</AppShell>)
    expect(current()).toEqual(['Forecast=page'])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Forecast')
  })

  it('a 1–5 shortcut and the brand return to "/" too', () => {
    nav.pathname = '/changelog'
    render(<AppShell>{page}</AppShell>)
    fireEvent.keyDown(document, { key: '2' })
    fireEvent.click(screen.getByRole('link', { name: 'SPERT® Forecaster' }))
    expect(nav.push.mock.calls).toEqual([['/'], ['/']])
  })
})
