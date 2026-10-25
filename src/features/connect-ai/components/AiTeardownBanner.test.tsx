// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// When sign-out cannot reach the server to end the Connect AI session,
// AiTeardownBanner tells the user in plain words (not only the console) and
// offers a retry. Pins the user-visible message and the auto-hide.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

const hoisted = vi.hoisted(() => ({
  getPending: vi.fn<() => string | null>(),
  retry: vi.fn(() => Promise.resolve(true)),
  clear: vi.fn(),
}))

vi.mock('../lib/ai-session-teardown', () => ({
  getPendingAiTeardownSessionId: hoisted.getPending,
  retryPendingAiTeardown: hoisted.retry,
  clearPendingAiTeardown: hoisted.clear,
  AI_TEARDOWN_CHANGED_EVENT: 'spert:forecaster-ai-teardown-changed',
}))

import { AiTeardownBanner } from './AiTeardownBanner'

beforeEach(() => {
  hoisted.getPending.mockReset()
  hoisted.retry.mockReset().mockResolvedValue(true)
  hoisted.clear.mockReset()
})

afterEach(cleanup)

// Native assertions only — this repo does not use @testing-library/jest-dom.
describe('AiTeardownBanner', () => {
  it('renders nothing when no teardown is pending', () => {
    hoisted.getPending.mockReturnValue(null)
    const { container } = render(<AiTeardownBanner />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('warns the user, in plain words, and uses accurate guidance only', async () => {
    hoisted.getPending.mockReturnValue('sid-1')
    hoisted.retry.mockResolvedValue(false)

    render(<AiTeardownBanner />)

    expect(await screen.findByText(/AI assistant may still be connected/i)).toBeTruthy()
    expect(screen.getByText(/could not reach the server to end your Connect AI session/i)).toBeTruthy()
    expect(screen.getByText(/keeps trying whenever you are online/i)).toBeTruthy()
    expect(screen.getByText(/ends on its own within 7 days/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    // NOT the false "reconnect then Disconnect ends it at once" claim.
    expect(screen.queryByText(/reconnect/i)).toBeNull()
    expect(screen.queryByText(/disconnect/i)).toBeNull()
  })

  it('hides once a teardown retry succeeds', async () => {
    let pending = true
    hoisted.getPending.mockImplementation(() => (pending ? 'sid-1' : null))
    hoisted.retry.mockImplementation(() => { pending = false; return Promise.resolve(true) })

    render(<AiTeardownBanner />)

    await waitFor(() => {
      expect(screen.queryByText(/AI assistant may still be connected/i)).toBeNull()
    })
    expect(hoisted.retry).toHaveBeenCalled()
  })
})
