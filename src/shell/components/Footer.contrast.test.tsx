// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The footer links' colours (v0.51.2, FRAME26 FC-1).
//
// jsdom has no paint, so this file cannot measure contrast. The ratios were measured in headless
// Chrome against the real footer and are recorded in the PR. Before v0.51.2 the links carried only
// their light pair, so in dark mode they drew blue-600 on the gray-900 footer: 3.38 at rest and
// 2.60 on hover, under 4.5. What a test can pin is that every link carries its dark pair, and that
// no inline colour overrides the classes.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Footer } from './Footer'

afterEach(() => cleanup())

const LIGHT = ['text-blue-600', 'hover:text-blue-700']
const DARK = ['dark:text-blue-400', 'dark:hover:text-blue-300']

describe('Footer links are themed for both modes', () => {
  it('renders the six footer links (control: the census below must have something to check)', () => {
    const { container } = render(<Footer />)
    expect(container.querySelectorAll('footer a')).toHaveLength(6)
  })

  it('every link carries its light pair and its dark pair, at rest and on hover', () => {
    const { container } = render(<Footer />)
    const missing = [...container.querySelectorAll('footer a')].flatMap((a) => {
      const classes = new Set(a.className.split(/\s+/))
      return [...LIGHT, ...DARK].filter((c) => !classes.has(c)).map((c) => `${a.textContent}: ${c}`)
    })
    expect(missing).toEqual([])
  })

  it('no link sets an inline colour, which would beat every theme class', () => {
    const { container } = render(<Footer />)
    const inline = [...container.querySelectorAll<HTMLElement>('footer a')]
      .filter((a) => a.style.color !== '')
      .map((a) => a.textContent)
    expect(inline).toEqual([])
  })
})
