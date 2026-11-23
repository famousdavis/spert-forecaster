// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The brand row's brand (FRAME26, contract §3 "Brand link", v0.52.0): ONE link to the collection screen ("/"), holding
// both favicons and the title. Its accessible name is its visible title, "SPERT® Forecaster", with no aria-label (WCAG
// 2.5.3, label in name), so both favicons are decorative (alt=""). A plain click shows Projects itself; a modified
// click is the browser's (a new tab). The title is not a heading. Until v0.52.0 there was no link: the title was the
// header's h1 and the favicon an image named "SPERT Forecaster icon".
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, createEvent, cleanup } from '@testing-library/react'

vi.mock('@/features/connect-ai/components/ConnectAiLauncher', () => ({ ConnectAiLauncher: () => <button type="button">Connect AI</button> }))
vi.mock('@/shared/components/ThemeToggle', () => ({ HeaderThemeToggle: () => <button type="button">Theme</button> }))
vi.mock('@/features/auth', () => ({ UserMenu: () => <button type="button">Chip</button> }))

import { AppHeader } from './AppHeader'
import { APP_DESCRIPTION } from '@/shared/constants'

afterEach(() => cleanup())

function renderHeader() {
  const onNavigateHome = vi.fn()
  render(<AppHeader onNavigateHome={onNavigateHome} onOpenAccount={vi.fn()} accountButtonRef={{ current: null }} />)
  return { onNavigateHome, brand: screen.getByRole('link', { name: 'SPERT® Forecaster' }) }
}

describe('the brand link', () => {
  it('is an <a href="/"> named by its visible title, with no aria-label, holding both favicons and the title', () => {
    const { brand } = renderHeader()
    expect([brand.tagName, brand.getAttribute('href'), brand.className, brand.getAttribute('data-sf')]).toEqual(['A', '/', 'sf-brand', 'brand'])
    expect([brand.hasAttribute('aria-label'), brand.hasAttribute('aria-labelledby')]).toEqual([false, false])
    const title = brand.querySelector('[data-sf="title"]')!
    expect(title.textContent).toBe('SPERT® Forecaster')
    expect(brand.querySelectorAll('img[data-sf="favicon"]')).toHaveLength(2)
  })

  it('both favicons are decorative and theme-keyed by the stylesheet: alt="", .sf-icon--light and --dark', () => {
    const { brand } = renderHeader()
    const imgs = [...brand.querySelectorAll('img')]
    expect(imgs.map((i) => [i.getAttribute('alt'), i.classList.contains('sf-icon'), i.classList.contains('sf-icon--light') ? 'light' : i.classList.contains('sf-icon--dark') ? 'dark' : '?', i.getAttribute('src')])).toEqual([
      ['', true, 'light', '/spert-favicon-forecaster.png'],
      ['', true, 'dark', '/spert-favicon-forecaster-dark.png'],
    ])
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('a plain click shows Projects and stops the link’s own navigation', () => {
    const { brand, onNavigateHome } = renderHeader()
    const ev = createEvent.click(brand, { button: 0 })
    fireEvent(brand, ev)
    expect([onNavigateHome.mock.calls.length, ev.defaultPrevented]).toEqual([1, true])
  })

  it.each([['meta', { metaKey: true }], ['ctrl', { ctrlKey: true }], ['shift', { shiftKey: true }], ['alt', { altKey: true }]] as const)(
    'a %s-click is left to the browser (a new tab or window): not handled, not prevented by the brand',
    (_k, mods) => {
      const { brand, onNavigateHome } = renderHeader()
      const ev = createEvent.click(brand, { button: 0, ...mods })
      fireEvent(brand, ev)
      expect([onNavigateHome.mock.calls.length, ev.defaultPrevented]).toEqual([0, false])
    },
  )
})

describe('the brand row', () => {
  it('is the frame’s bar: the brand, the tagline, then the utilities (Connect AI · theme · chip), and no heading', () => {
    const { container } = render(<AppHeader onNavigateHome={vi.fn()} onOpenAccount={vi.fn()} accountButtonRef={{ current: null }} />)
    const header = container.querySelector('header')!
    expect(header.className).toBe('sf-bar')
    const row = header.firstElementChild!
    expect([row.className, [...row.children].map((c) => c.getAttribute('data-sf'))]).toEqual(['sf-col sf-bar-row', ['brand', 'tagline', 'utils']])
    expect(screen.getByText(APP_DESCRIPTION).className).toBe('sf-tagline')
    expect([...header.querySelector('[data-sf="utils"]')!.children].map((c) => c.textContent)).toEqual(['Connect AI', 'Theme', 'Chip'])
    expect(header.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')).toBeNull()
    // The ® is the frame's muted mark, outside both gradient words.
    expect(header.querySelector('.sf-mark')!.textContent).toBe('®')
  })
})
