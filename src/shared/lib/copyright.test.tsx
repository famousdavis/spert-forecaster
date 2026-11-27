// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Y1 (FRAME26 pass 3, v0.54.0): the footer's © and the About page's © read one source, copyrightYear(), so they can
// never differ. And the hydration seam: the shell is prerendered at build time, so its HTML carries the build's year.
// The second block renders the footer and the About page to HTML with the clock in 2026 (the build), then hydrates
// that HTML with the clock in 2027 (a visitor after 1 January): React must report no mismatch, and the page must
// end up saying 2027.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'

import { Footer } from '@/shell/components/Footer'
import { AboutTab } from '@/features/about/components/AboutTab'
import { copyrightYear } from './copyright'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const at = (y: number, m: number, d: number) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(y, m, d, 12)) }
const years = (root: ParentNode) => ({
  footer: root.querySelector('[data-sf="footer"]')!.textContent!.match(/© ?(\d{4})/)![1],
  about: root.querySelector('[data-sf="about-legal"]')!.textContent!.match(/© ?(\d{4})/)![1],
})
const Page = () => <><AboutTab /><Footer /></>

describe('copyrightYear (Y1)', () => {
  it.each([[2026, 11, 31, '2026'], [2027, 0, 1, '2027']])('on %i-%i-%i the footer and the About page both say %s', (y, m, d, want) => {
    at(y, m, d)
    expect(copyrightYear()).toBe(Number(want))
    const { container } = render(<Page />)
    expect(years(container)).toEqual({ footer: want, about: want })
  })
})

// Two controls for the instrument, each a year rendered the way the component must not: today's plain form (the
// mismatch IS reported) and suppressHydrationWarning alone (no report, but the build's year stays on screen).
function Plain() { return <p>© {copyrightYear()} William</p> }
function SuppressedOnly() { return <p>© <span suppressHydrationWarning>{copyrightYear()}</span> William</p> }
async function hydrate2027(el: React.ReactElement) {
  at(2026, 11, 31)
  const container = document.createElement('div')
  container.innerHTML = renderToString(el)
  document.body.appendChild(container)
  at(2027, 0, 1)
  const recoverable = vi.fn()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  await act(async () => { hydrateRoot(container, el, { onRecoverableError: recoverable }) })
  const reported = recoverable.mock.calls.length + consoleError.mock.calls.filter((c) => /hydrat|did not match|didn't match/i.test(String(c[0]))).length
  const year = container.textContent!.match(/© ?(\d{4})/)![1]
  container.remove()
  return { reported: reported > 0, year }
}

describe('the hydration instrument (controls)', () => {
  it('control 1, the plain form: the mismatch is reported', async () => {
    expect((await hydrate2027(<Plain />)).reported).toBe(true)
  })
  it('control 2, suppressHydrationWarning alone: no report, but "© 2026" stays', async () => {
    expect(await hydrate2027(<SuppressedOnly />)).toEqual({ reported: false, year: '2026' })
  })
})

describe('the prerendered year (Y1, hydration)', () => {
  it('HTML built in 2026, hydrated in 2027: no mismatch, and both say 2027', async () => {
    at(2026, 11, 31)
    const html = renderToString(<Page />)
    expect(html).toMatch(/© (<!-- -->)?<span>2026<\/span>/)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    expect(years(container)).toEqual({ footer: '2026', about: '2026' })

    at(2027, 0, 1)
    const recoverable = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => { hydrateRoot(container, <Page />, { onRecoverableError: recoverable }) })
    expect(recoverable).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([])
    expect(years(container)).toEqual({ footer: '2027', about: '2027' })
    container.remove()
  })
})
