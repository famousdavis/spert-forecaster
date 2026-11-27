// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The five app-wide notices are the SPERT® Suite frame's (FRAME26, contract §3 "Notices slot", Orch-FRAME-1's D3,
// v0.52.0): each one `.sf-notice` with its variant, at the full column width, with no margin, padding, radius, shadow
// or colour of its own (the slot spaces them 12 px apart; the stylesheet gives the box and the text colours). The
// frame's 28 px outlined dismiss button, `.sf-notice-dismiss`, is on exactly the notices' own "Got it" ×2 and
// "Dismiss" ×2; every other button in a notice (the invitation's sign-in buttons and "✕", "Try again") keeps its look.
// The wording, roles and order are unchanged (the order is AppShell.test.tsx's).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const H = vi.hoisted(() => ({ landing: 'idle' as 'idle' | 'pre_auth' | 'claimed', pending: null as string | null }))
vi.mock('@/features/auth/hooks/useInvitationLanding', () => ({
  useInvitationLanding: () => ({ state: H.landing, claimedNames: ['Alpha'], dismiss: vi.fn() }),
}))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, isFirebaseAvailable: true, signInWithGoogle: vi.fn(), signInWithMicrosoft: vi.fn() }) }))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: 'local', setMode: vi.fn() }) }))
vi.mock('@/features/connect-ai/lib/ai-session-teardown', () => ({
  getPendingAiTeardownSessionId: () => H.pending,
  retryPendingAiTeardown: vi.fn().mockResolvedValue(false),
  clearPendingAiTeardown: vi.fn(),
  AI_TEARDOWN_CHANGED_EVENT: 'x-ai-teardown-changed',
}))

import { FirstRunBanner } from './FirstRunBanner'
import { LocalStorageWarningBanner } from './LocalStorageWarningBanner'
import { ExportCheckWarning } from './ExportCheckWarning'
import { InvitationBanner } from './InvitationBanner'
import { AiTeardownBanner } from '@/features/connect-ai/components/AiTeardownBanner'
import { useExportCheckStore } from '@/shared/state/export-check-store'

beforeEach(() => {
  localStorage.clear()
  H.landing = 'idle'
  H.pending = null
  useExportCheckStore.setState({ items: [{ kind: 'file', reason: 'the file is broken' }] })
})
afterEach(() => cleanup())

/** The notice's root element, and the classes it must have exactly. */
function noticeRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild as HTMLElement
  expect(root, 'must-find: the notice rendered').not.toBeNull()
  return root
}
const OWN_LOOK = /(^|:)(m[trblxy]?|-m[trblxy]?|p[trblxy]?|rounded|shadow|bg|border|max-w|mx)-|^(rounded|shadow|border)$/

const CASES = [
  ['FirstRunBanner (terms)', () => render(<FirstRunBanner />), 'sf-notice sf-notice--info', ['Got it']],
  ['LocalStorageWarningBanner (caution)', () => render(<LocalStorageWarningBanner />), 'sf-notice sf-notice--caution', ['Got it']],
  ['ExportCheckWarning (app-wide)', () => render(<ExportCheckWarning />), 'sf-notice sf-notice--caution', ['Dismiss']],
  ['InvitationBanner, invited', () => { H.landing = 'pre_auth'; return render(<InvitationBanner />) }, 'sf-notice sf-notice--info relative', []],
  ['InvitationBanner, added', () => { H.landing = 'claimed'; return render(<InvitationBanner />) }, 'sf-notice sf-notice--success relative', []],
] as const

describe('the app-wide notices are the frame’s notices', () => {
  it.each(CASES)('%s: exactly its variant, no look of its own, the frame’s dismiss on exactly its dismiss button', (_n, mount, cls, dismiss) => {
    const { container } = mount()
    const root = noticeRoot(container)
    expect(root.className).toBe(cls)
    // Nothing inside carries a colour of its own either, except the invitation's "✕" and its sign-in block (the shared
    // SignInButtons, buttons and hint line, keep their own look; the hint's light 4.46 : 1 is listed, pre-existing).
    const coloured = [...root.querySelectorAll<HTMLElement>('[class]')]
      .filter((e) => !e.closest('button') && !e.parentElement?.querySelector(':scope > button[title^="Sign in"]'))
      .flatMap((e) => e.className.split(/\s+/))
      .filter((c) => /(^|:)(text|bg|border)-(?!xs$|sm$)/.test(c))
    expect(coloured).toEqual([])
    expect(root.className.split(/\s+/).filter((c) => OWN_LOOK.test(c))).toEqual([])
    const dismissers = [...root.querySelectorAll('button.sf-notice-dismiss')].map((b) => b.textContent?.trim())
    expect(dismissers).toEqual([...dismiss])
    for (const b of root.querySelectorAll('button.sf-notice-dismiss')) expect(b.className).toBe('sf-notice-dismiss')
  })

  it('AiTeardownBanner (caution): its Dismiss is the frame’s; "Try again" keeps its own filled look; role="alert"', async () => {
    H.pending = 'session-1'
    const { container } = render(<AiTeardownBanner />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    const root = noticeRoot(container)
    expect([root.className, root.getAttribute('role')]).toEqual(['sf-notice sf-notice--caution', 'alert'])
    expect([...root.querySelectorAll('button.sf-notice-dismiss')].map((b) => b.textContent?.trim())).toEqual(['Dismiss'])
    const retry = screen.getByRole('button', { name: 'Try again' })
    // v0.53.0 (FRAME26 clean-up F4): amber-700 (white on it 5.03:1; amber-600 measured 3.20), its own look still.
    expect([retry.classList.contains('sf-notice-dismiss'), retry.classList.contains('bg-amber-700'), retry.classList.contains('bg-amber-600')]).toEqual([false, true, false])
  })

  it('the invitation’s sign-in buttons and its "✕" keep their own look (never the frame’s dismiss)', () => {
    H.landing = 'pre_auth'
    render(<InvitationBanner />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length, 'must-find: the ✕ and the sign-in buttons').toBeGreaterThanOrEqual(3)
    expect(buttons.filter((b) => b.classList.contains('sf-notice-dismiss'))).toEqual([])
    expect(screen.getByRole('button', { name: 'Dismiss invitation banner' }).textContent).toBe('✕')
  })

  it('FirstRun’s ® inherits the notice’s colour (F14: gray-400 was 2.39 : 1 on its ground) and keeps its small raised size', () => {
    render(<FirstRunBanner />)
    const mark = [...document.querySelectorAll('span')].find((s) => s.textContent === '®')!
    expect(mark.className).toBe('font-normal text-xs align-top')
  })
})
