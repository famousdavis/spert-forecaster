// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The footer links' colours: the SPERT® Suite frame's since v0.52.0 (FRAME26), stage 0's classes before (v0.51.2).
//
// The fact this file holds is unchanged since v0.51.2: every footer link reaches 4.5 : 1 in both themes, at rest and
// on hover. Before v0.51.2 the links carried only their light pair, so in dark mode they drew blue-600 on the gray-900
// footer: 3.38 at rest and 2.60 on hover. Since v0.52.0 the colour is the frame's `--sf-link`, set by the vendored
// stylesheet on `.sf-footer a`, and the hover is its underline, the colour unchanged. jsdom has no paint, so the ratio
// is computed from the token values the vendored file ships; what the DOM must show is that no link sets a colour of
// its own (a utility would lose to the unlayered stylesheet; an inline colour would win over it and the theme).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Footer } from './Footer'
import { contrast, frameRule, frameToken, readsToken } from '@/styles/frame-tokens.testkit'

afterEach(() => cleanup())

const links = () => [...render(<Footer />).container.querySelectorAll<HTMLAnchorElement>('footer a')]

describe('Footer links take the frame’s link colour, readable in both themes', () => {
  it('renders the six footer links (control: the census below must have something to check)', () => {
    const names = links().map((a) => a.textContent?.trim())
    expect(names[0]).toMatch(/^Version \d+\.\d+\.\d+$/)
    expect(names.slice(1)).toEqual([
      'SPERT® Suite',
      'Terms of Service',
      'Privacy Policy',
      'AI Privacy Notice',
      'License',
    ])
  })

  it('is the frame’s footer: .sf-footer with its hook, one column, two lines', () => {
    const { container } = render(<Footer />)
    const footer = container.querySelector('footer')!
    expect([footer.className, footer.getAttribute('data-sf')]).toEqual(['sf-footer', 'footer'])
    expect(footer.children).toHaveLength(1)
    expect(footer.firstElementChild!.className).toBe('sf-col')
    expect(footer.firstElementChild!.children).toHaveLength(2)
  })

  it('no link carries a class or an inline style of its own: the colour and the hover are the stylesheet’s', () => {
    const own = links()
      .filter((a) => (a.getAttribute('class') ?? '') !== '' || a.getAttribute('style') !== null)
      .map((a) => `${a.textContent}: ${a.getAttribute('class') ?? ''} ${a.getAttribute('style') ?? ''}`)
    expect(own).toEqual([])
  })

  it('the stylesheet draws the links in --sf-link and underlines them on hover', () => {
    expect(readsToken('.sf-footer a, .sf-footer .sf-link', 'color')).toBe('--sf-link')
    expect(frameRule('.sf-footer a:hover, .sf-footer .sf-link:hover')).toMatch(/text-decoration:\s*underline/)
  })

  it.each(['light', 'dark'] as const)('%s: the link colour reaches 4.5 : 1 on the page ground, at rest and on hover', (theme) => {
    for (const more of ['no-preference', 'more'] as const) {
      const ratio = contrast(frameToken('--sf-link', theme, more), frameToken('--sf-page', theme, more))
      expect(ratio, `${theme} ${more}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the measured values: 5.25 light, 6.73 dark (a change to either token needs a new measurement)', () => {
    expect([contrast(frameToken('--sf-link', 'light'), frameToken('--sf-page', 'light')), contrast(frameToken('--sf-link', 'dark'), frameToken('--sf-page', 'dark'))]).toEqual([5.25, 6.73])
  })
})
