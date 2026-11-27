// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The About page in the suite frame (FRAME26 pass 3, v0.54.0; contract §3 About page, §7 About, §9.3 hooks), through
// the real AppShell with About chosen. Its structure, its marks and its links; the words are about-words.test.tsx's.
// Geometry and colour are frame-check's, in a browser.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: 'local', setMode: vi.fn() }) }))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))

import { AppShell } from './AppShell'
import { useProjectStore } from '@/shared/state/project-store'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  localStorage.clear()
  useProjectStore.setState({ projects: [], sprints: [], viewingProjectId: null, cloudDataLoaded: false })
})
afterEach(() => cleanup())

function openAbout() {
  render(<AppShell />)
  fireEvent.click(within(document.querySelector('nav')!).getByRole('button', { name: 'About' }))
  return { main: document.querySelector('main')!, about: document.querySelector<HTMLElement>('main [data-sf="about"]')! }
}

describe('the About page (v0.54.0)', () => {
  it('is .sf-about, main’s next element after the heading row, with no wrapper', () => {
    const { main, about } = openAbout()
    expect([...main.children].map((c) => c.getAttribute('data-sf'))).toEqual(['headrow', 'about'])
    expect(about.className).toBe('sf-about')
  })

  it('titles the page "About SPERT® Forecaster", its ® the brand row’s mark', () => {
    openAbout()
    expect(document.querySelector('h1')!.innerHTML).toBe('About SPERT<span class="sf-mark">®</span> Forecaster')
  })

  it('has §7’s seven section headings in order; How it works is a numbered list of four; no tagline under the title', () => {
    const { main, about } = openAbout()
    expect([...about.querySelectorAll(':scope > section > h2')].map((h) => h.textContent)).toEqual([
      'What is SPERT® Forecaster?', 'How it works', 'About the simulation', 'Connect AI', 'Guides', 'Your data and storage', 'Version and license',
    ])
    const how = about.querySelectorAll(':scope > section')[1]
    expect([how.querySelectorAll(':scope > ol > li').length, how.querySelectorAll('ul').length]).toEqual([4, 0])
    expect(main.textContent).not.toContain('Agile Release Forecasting with Monte Carlo Simulation')
    expect(about.querySelector(':scope > section:last-child')!.getAttribute('data-sf')).toBe('about-legal')
    expect(about.querySelector('.sf-guides')!.getAttribute('data-sf')).toBe('guides')
  })

  it('carries no class but the frame’s own (no utility, no dark: variant)', () => {
    const { about } = openAbout()
    const classes = [...about.querySelectorAll('[class]')].flatMap((e) => [...e.classList])
    expect(classes.length).toBeGreaterThan(0)
    expect(classes.filter((c) => !c.startsWith('sf-'))).toEqual([])
  })

  it('shows every ® and ™ as the glyph alone in a .sf-mark (™ with .sf-mark--tm), in the h1 and on the page', () => {
    const { main } = openAbout()
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    const marks: string[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent ?? ''
      if (!/[®™]/.test(t)) continue
      const span = n.parentElement!
      marks.push(`${t}|${span.className}|${span.childNodes.length}`)
    }
    expect(marks.length).toBe(14) // h1 1, What is 4, Connect AI 2, data 1, © 1, trademarks 5
    expect(new Set(marks)).toEqual(new Set(['®|sf-mark|1', '™|sf-mark sf-mark--tm|1']))
  })

  it('links where §7 says, every new-tab link marked for screen readers; What’s new is the footer’s own /changelog link', () => {
    const { about } = openAbout()
    const links = [...about.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel'), a.querySelector('.sf-sr')?.textContent ?? null, a.querySelector('[aria-hidden="true"]')?.textContent ?? null])
    const NT = ' (opens in a new tab)'
    expect(links).toEqual([
      ['https://spertsuite.com/help/connect-ai', '_blank', 'noopener noreferrer', NT, ' ↗'],
      ['/SPERTForecaster_Connect_AI_Guide.pdf', '_blank', 'noopener noreferrer', NT, ' ↗'],
      ['https://spertsuite.com/ai-privacy', '_blank', 'noopener noreferrer', NT, ' ↗'],
      ['/SPERTForecaster_Quick_Reference_Guide.pdf', '_blank', 'noopener noreferrer', ': Quick Reference Guide (opens in a new tab)', ' ↗'],
      ['/SPERTForecaster_Connect_AI_Guide.pdf', '_blank', 'noopener noreferrer', ': Connect AI User Guide (opens in a new tab)', ' ↗'],
      ['https://spertsuite.com/help/forecaster', '_blank', 'noopener noreferrer', NT, ' ↗'],
      ['/changelog', null, null, null, null],
      ['https://github.com/famousdavis/spert-forecaster', '_blank', 'noopener noreferrer', NT, ' ↗'],
      ['https://github.com/famousdavis/spert-forecaster/blob/main/LICENSE', '_blank', 'noopener noreferrer', NT, ' ↗'],
    ])
    const footerVersion = document.querySelector('[data-sf="footer"] a[href="/changelog"]')!
    expect(footerVersion.textContent).toMatch(/^Version /)
  })

  it('says the same year in its © line as the footer', () => {
    openAbout()
    const year = (s: string | null | undefined) => s?.match(/© ?(\d{4})/)?.[1]
    const fromAbout = year(document.querySelector('[data-sf="about-legal"]')!.textContent)
    expect(fromAbout).toMatch(/^\d{4}$/)
    expect(fromAbout).toBe(year(document.querySelector('[data-sf="footer"]')!.textContent))
  })
})
