// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WHERE THE CONNECTION IS OWNED — a wiring test, not a behaviour test.
//
// v0.37.0 shipped with useAiConnectivity called inside ConnectAiSection, which
// lives in the Settings tab. AppShell renders tabs conditionally, so leaving
// Settings unmounted the hook: the snapshot publisher and the heartbeat both
// stopped, and an AI kept reading the snapshot from before whatever the user
// did next. Found by a production smoke, invisible to every behaviour test —
// those render the hook directly, where it never unmounts.
//
// The assertion below is deliberately structural. If ConnectAiSection owns a
// connection of its own, it renders its controls with no provider present. If
// it consumes one from context, it renders nothing. That distinction is the
// whole defect, and nothing about the hook's own behaviour can express it.

import { vi } from 'vitest'

vi.mock('@/shared/firebase/config', () => ({
  db: { __fake: true },
  functionsInstance: { __fake: true },
  isFirebaseAvailable: true,
  auth: null,
}))

// If the section calls the hook directly, this mock is what it gets — a fully
// "connected" session, which would render the panel and make the assertion
// fail loudly rather than by accident.
vi.mock('../hooks/useAiConnectivity', () => ({
  useAiConnectivity: () => ({
    sessionState: {
      sessionActive: true, aiConnected: true, consentRead: true, sessionId: 'fake-session',
    },
    startSession: vi.fn(),
    stopSession: vi.fn(),
    changePermissions: vi.fn(),
  }),
}))

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useProjectStore } from '@/shared/state/project-store'
import { ConnectAiSection } from './ConnectAiSection'
import { AiConnectivityProvider } from '../AiConnectivityProvider'

beforeEach(() => {
  useProjectStore.setState({
    projects: [{
      id: 'p1',
      name: 'Test',
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2 as const,
      firstSprintStartDate: '2026-01-05',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    sprints: [],
    viewingProjectId: 'p1',
    forecastInputs: {},
    burnUpConfigs: {},
  })
})

describe('ConnectAiSection does not own the connection', () => {
  it('renders NOTHING without a provider above it', () => {
    // The load-bearing assertion. A section that called useAiConnectivity
    // itself would render "Connect AI" here, because the mock reports an
    // active session — and that is exactly the shipped defect.
    const { container } = render(<ConnectAiSection />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('Connect AI')).toBeNull()
  })

  it('renders its controls when a provider IS above it', () => {
    render(
      <AiConnectivityProvider>
        <ConnectAiSection />
      </AiConnectivityProvider>
    )
    expect(screen.getByText('Connect AI')).toBeTruthy()
  })
})
