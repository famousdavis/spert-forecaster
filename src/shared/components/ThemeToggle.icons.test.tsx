// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The header's theme button is the SPERT® Suite frame's `.sf-theme` (FRAME26, v0.52.0). Its icons carry state (which
// theme is on), so they are held to the 3 : 1 non-text bar: they draw in currentColor, which the frame sets to its
// muted token (4.84 / 6.82) and steps to its text token on hover, at full opacity. Until v0.52.0 the sun was a fixed
// amber #f59e0b (2.15 : 1 on white), the moon a fixed yellow, and the button sat at 70 % opacity.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { contrast, frameToken, readsToken } from '@/styles/frame-tokens.testkit'

const T = vi.hoisted(() => ({ theme: 'light' as 'light' | 'dark' | 'system' }))
vi.mock('@/shared/hooks', () => ({ useTheme: () => ({ theme: T.theme, setTheme: vi.fn(), isInitialized: true }) }))

import { HeaderThemeToggle } from './ThemeToggle'

afterEach(() => cleanup())

describe('the frame’s theme button', () => {
  it.each(['light', 'dark', 'system'] as const)('%s: .sf-theme with its hook; the icon draws only in currentColor, hidden from AT', (theme) => {
    T.theme = theme
    render(<HeaderThemeToggle />)
    const button = screen.getByRole('button')
    expect([button.className, button.getAttribute('data-sf'), button.getAttribute('type')]).toEqual(['sf-theme', 'theme', 'button'])
    const svg = button.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    const paints = [svg, ...svg.querySelectorAll('*')].flatMap((e) => ['fill', 'stroke'].map((a) => e.getAttribute(a)).filter((v) => v !== null))
    expect(paints.length, 'must-find: the icon paints something').toBeGreaterThan(0)
    expect(paints.filter((v) => v !== 'currentColor' && v !== 'none')).toEqual([])
    expect([...button.querySelectorAll('*'), button].flatMap((e) => (e.getAttribute('class') ?? '').split(/\s+/)).filter((c) => /opacity|^text-/.test(c))).toEqual([])
  })

  it('the stylesheet draws it in the muted token and the text token on hover: 3 : 1 or better, both themes', () => {
    expect([readsToken('.sf-theme', 'color'), readsToken('.sf-theme:hover', 'color')]).toEqual(['--sf-text-muted', '--sf-text'])
    for (const t of ['light', 'dark'] as const) for (const tok of ['--sf-text-muted', '--sf-text']) {
      expect(contrast(frameToken(tok, t), frameToken('--sf-page', t)), `${t} ${tok}`).toBeGreaterThanOrEqual(3)
    }
  })
})
