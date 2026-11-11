// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus in the two Connect AI modals (v0.50.4, F5 and F6). Open: the modal itself, so its title
// is read (before: focus stayed behind it, on the header button). Closed, by any way out: the
// Connect AI button. After Connect in the consent modal the panel opens from nothing (the consent
// modal is gone), so the launcher names its own button rather than relying on what had focus.
// The consent modal also gains Escape, as every other dialog here has. The launcher needs
// Firebase, so this is jsdom only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within, createEvent } from '@testing-library/react'

const H = vi.hoisted(() => ({
  active: false,
  startSession: vi.fn<(read: boolean) => Promise<boolean>>(),
  stopSession: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/shared/firebase/config', () => ({
  db: { __fake: true },
  functionsInstance: { __fake: true },
  isFirebaseAvailable: true,
  auth: null,
}))
vi.mock('@/shared/firebase/callables', () => ({ callGeneratePairingCode: async () => ({ code: 'ABCD-1234' }) }))
vi.mock('../hooks/useAiConnectivity', () => ({
  useAiConnectivity: () => ({
    sessionState: { sessionActive: H.active, aiConnected: false, consentRead: true, sessionId: H.active ? 's1' : null },
    startSession: H.startSession,
    stopSession: H.stopSession,
    changePermissions: vi.fn(async () => true),
  }),
}))

import { ConnectAiLauncher } from './ConnectAiLauncher'
import { AiConnectivityProvider } from '../AiConnectivityProvider'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { AI_CONSENT_KEY } from '../constants'

const T = '2026-01-01T00:00:00.000Z'

beforeEach(() => {
  localStorage.removeItem(AI_CONSENT_KEY)
  H.active = false
  H.startSession.mockReset()
  H.stopSession.mockReset()
  H.startSession.mockImplementation(async () => {
    H.active = true
    return true
  })
  H.stopSession.mockResolvedValue(undefined)
  useProjectStore.setState({
    projects: [{ id: 'p0', name: 'P', unitOfMeasure: 'pts', createdAt: T, updatedAt: T }],
    sprints: [],
    viewingProjectId: 'p0',
  })
  useSettingsStore.setState({ projectPrefs: {} })
})
afterEach(() => cleanup())

async function mount() {
  render(
    <AiConnectivityProvider>
      <ConnectAiLauncher />
    </AiConnectivityProvider>,
  )
  await act(async () => {})
}
// Either label: the mock does not re-render the provider when a session starts.
const launcher = () => screen.getByRole('button', { name: /^(AI session active|Connect an AI assistant)$/ })
const panel = () => screen.queryByRole('dialog', { name: 'Connect AI' })
const consent = () => screen.queryByRole('dialog', { name: 'Connect an AI assistant' })
const focused = () => document.activeElement
/** Focus the launcher and press it, as a keyboard user does. */
async function openFromLauncher() {
  launcher().focus()
  await act(async () => {
    fireEvent.click(launcher())
  })
}

describe('the panel (an active session)', () => {
  beforeEach(() => {
    H.active = true
  })

  it('opening: focus goes to the panel itself (known-bad: it stayed on the launcher)', async () => {
    await mount()
    await openFromLauncher()
    expect(focused()).toBe(panel())
  })

  it.each([
    ['Close', () => fireEvent.click(within(panel()!).getByRole('button', { name: 'Close' }))],
    ['Done', () => fireEvent.click(within(panel()!).getByRole('button', { name: 'Done' }))],
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
    ['the backdrop', () => fireEvent.click(panel()!.previousElementSibling!)],
  ])('closed by %s: back to the launcher (known-bad: <body>)', async (_how, close) => {
    await mount()
    await openFromLauncher()
    act(() => close())
    expect([panel(), focused()]).toEqual([null, launcher()])
  })

  it('opened by a click that moves no focus (Safari, Firefox on macOS): closing still lands on the launcher', async () => {
    await mount()
    expect(focused()).toBe(document.body)
    await act(async () => {
      fireEvent.click(launcher())
    })
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    })
    expect([panel(), focused()]).toEqual([null, launcher()])
  })

  it('closed by Disconnect: back to the launcher', async () => {
    await mount()
    await openFromLauncher()
    await act(async () => {
      fireEvent.click(within(panel()!).getByRole('button', { name: 'Disconnect' }))
    })
    expect([H.stopSession.mock.calls.length, panel(), focused()]).toEqual([1, null, launcher()])
  })
})

describe('the consent modal (no session, no consent on record)', () => {
  it('opening: focus goes to the modal itself (known-bad: it stayed on the launcher)', async () => {
    await mount()
    await openFromLauncher()
    expect(focused()).toBe(consent())
  })

  it('Cancel: back to the launcher (known-bad: <body>)', async () => {
    await mount()
    await openFromLauncher()
    fireEvent.click(within(consent()!).getByRole('button', { name: 'Cancel' }))
    expect([consent(), focused()]).toEqual([null, launcher()])
  })

  it('opened by a click that moves no focus (Safari, Firefox on macOS): Cancel still lands on the launcher', async () => {
    await mount()
    expect(focused()).toBe(document.body)
    await act(async () => {
      fireEvent.click(launcher())
    })
    fireEvent.click(within(consent()!).getByRole('button', { name: 'Cancel' }))
    expect([consent(), focused()]).toEqual([null, launcher()])
  })

  it('Escape closes it, is marked handled, and focus goes back to the launcher (known-bad: no Escape)', async () => {
    await mount()
    await openFromLauncher()
    const event = createEvent.keyDown(document.activeElement!, { key: 'Escape' })
    act(() => {
      fireEvent(document.activeElement!, event)
    })
    expect([consent(), event.defaultPrevented, H.startSession.mock.calls.length, focused()]).toEqual([null, true, 0, launcher()])
  })

  it('Connect: the panel opens with focus, and closing it returns to the launcher', async () => {
    await mount()
    await openFromLauncher()
    await act(async () => {
      fireEvent.click(within(consent()!).getByRole('button', { name: 'Connect' }))
    })
    expect([consent(), focused()]).toEqual([null, panel()])
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    })
    expect([panel(), focused()]).toEqual([null, launcher()])
  })
})
