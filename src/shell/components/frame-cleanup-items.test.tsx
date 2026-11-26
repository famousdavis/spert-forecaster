// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.53.0, the FRAME26 clean-up pass: Forecaster's own items, each measured on production v0.52.2 in Chrome 154
 * (Clean-FC-CFD probes) and fixed to the floor it names:
 * - F1: the consent dialog's Terms and Privacy links, blue-500, 3.76 light / 3.90 dark → blue-600 / blue-400 (5.25 /
 *   5.56; their hover 6.83 / 8.09). Text, so 4.5:1.
 * - F2: the invitation's "✕", both states, gray-400 (2.39 on the info ground, 2.49 on the success one) → gray-500 /
 *   gray-400 in dark (4.44 / 5.68 info, 4.62 / 5.74 success). An icon, so 3:1; names unchanged.
 * - F3: SignInButtons' hint, gray-500 (4.44 on the info ground) → gray-600 (6.94; 7.56 on white), gray-400 in dark.
 * - F4: AiTeardownBanner's "Try again", white on amber-600 (3.20) → amber-700 (5.03), amber-800 on hover (7.09).
 * - F5: the 404, Next's `h1` "404" → the frame's heading row, "Page not found", a line, a link back to Projects.
 * - E: the outermost crash screen, which Forecaster lacked (a fault in the frame left Next's "Application error").
 * The colours are class pins (jsdom paints nothing); the numbers are the browser's.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ConsentModal } from '@/features/auth/components/ConsentModal'
import NotFound from '@/app/not-found'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { AppCrashScreen } from './AppCrashScreen'

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

describe('F1: the consent dialog\'s links', () => {
  it('Terms of Service and Privacy Policy are blue-600, blue-400 in dark, with darker / lighter hovers', () => {
    render(<ConsentModal onAccept={vi.fn()} onCancel={vi.fn()} />)
    for (const name of ['Terms of Service', 'Privacy Policy']) {
      const cls = screen.getByRole('link', { name }).className.split(' ')
      expect(cls).toEqual(expect.arrayContaining(['text-blue-600', 'hover:text-blue-700', 'dark:text-blue-400', 'dark:hover:text-blue-300']))
      expect(cls).not.toContain('text-blue-500')
    }
  })
})

describe('F2: the invitation\'s "✕"', () => {
  it('both states\' "✕": gray-500, gray-400 in dark, darker / lighter on hover; nothing at gray-400 in light left', () => {
    const s = src('shell/components/InvitationBanner.tsx')
    const want = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    expect(s.split(want).length - 1).toBe(2)
    expect(s).not.toMatch(/"absolute top-2 right-2 text-gray-400 /)
    // The names are unchanged.
    expect(s).toContain('aria-label="Dismiss invitation banner"')
    expect(s).toContain('aria-label="Dismiss"')
  })
})

describe('F3: the Microsoft hint', () => {
  it('is gray-600, gray-400 in dark', () => {
    const s = src('features/auth/components/SignInButtons.tsx')
    expect(s).toContain('<p className="w-full text-xs text-gray-600 dark:text-gray-400">')
    expect(s).not.toContain('text-xs text-gray-500 dark:text-gray-400')
  })
})

describe('F4: "Try again"', () => {
  it('is white on amber-700, amber-800 on hover', () => {
    const s = src('features/connect-ai/components/AiTeardownBanner.tsx')
    expect(s).toContain('bg-amber-700 hover:bg-amber-800')
    expect(s).not.toContain('bg-amber-600')
  })
})

describe('F5: the 404', () => {
  it('the frame\'s heading row with the one h1 "Page not found", a line, and a link back to Projects', () => {
    render(<NotFound />)
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.map((h) => h.textContent)).toEqual(['Page not found'])
    expect(h1s[0].closest('[data-sf="headrow"]')).toBeTruthy()
    expect(screen.getByText("There's no page at this address.")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Projects' }).getAttribute('href')).toBe('/')
    expect(screen.queryByText('404')).toBeNull()
  })
})

describe('E: the outermost crash screen', () => {
  function Throws(): never { throw new Error('the frame itself failed') }

  it('the root layout wraps everything it mounts in the outermost boundary, outside the frame', () => {
    const s = src('app/layout.tsx')
    const at = (t: string) => s.indexOf(t)
    expect(at('<ErrorBoundary fallback={<AppCrashScreen />}>')).toBeGreaterThan(at('<body'))
    expect(at('<ErrorBoundary fallback={<AppCrashScreen />}>')).toBeLessThan(at('<AuthProvider>'))
    expect(at('</ErrorBoundary>')).toBeGreaterThan(at('</AuthProvider>'))
  })

  it('shows the one wording on the page ground in the frame\'s text colours, and Reload reloads', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
    try {
      render(<ErrorBoundary fallback={<AppCrashScreen />}><Throws /></ErrorBoundary>)
      const title = screen.getByRole('heading', { level: 1, name: 'Something went wrong' })
      const box = title.parentElement!
      expect(box.className.split(' ')).toEqual(expect.arrayContaining(['min-h-screen', 'bg-white', 'dark:bg-[#101828]']))
      expect(title.className.split(' ')).toEqual(expect.arrayContaining(['text-[#333333]', 'dark:text-[#e2e8f0]']))
      const line = box.querySelector('p')!
      expect(line.innerHTML).toBe('SPERT<span class="sf-mark">®</span> Forecaster could not display this page. Reload to try again.')
      expect(line.className.split(' ')).toEqual(expect.arrayContaining(['text-[#6a7282]', 'dark:text-[#99a1af]']))
      // Outside the frame: no brand, navigation or main of its own.
      expect(document.querySelector('[data-sf]')).toBeNull()
      screen.getByRole('button', { name: 'Reload' }).click()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
      vi.mocked(console.error).mockRestore()
    }
  })
})
