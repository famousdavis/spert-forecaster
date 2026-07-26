// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WHERE THE CONNECTION IS OWNED — a wiring test, not a behaviour test.
//
// v0.37.0 shipped with useAiConnectivity called from the component that
// renders the Connect AI controls, and that component lived in the Settings
// tab. AppShell renders tabs conditionally, so leaving Settings unmounted the
// hook: the snapshot publisher and the heartbeat both stopped, and an AI kept
// reading the snapshot from before whatever the user did next. Found by a
// production smoke; invisible to every behaviour test, because those render
// the hook directly where it never unmounts.
//
// The controls moved to the header in v0.38.0, which makes the failure LESS
// likely to recur but no less possible — the header is one refactor away from
// being conditional too. This assertion is deliberately structural: if the
// launcher owns a connection of its own, it renders its button with no
// provider present. If it consumes one from context, it renders nothing.
// That distinction is the whole defect, and nothing about the hook's own
// behaviour can express it.

import { vi } from 'vitest'

vi.mock('@/shared/firebase/config', () => ({
  db: { __fake: true },
  functionsInstance: { __fake: true },
  isFirebaseAvailable: true,
  auth: null,
}))

// If the launcher calls the hook directly, this mock is what it gets — a
// fully "connected" session, which would render the button and make the
// assertion fail loudly rather than by accident.
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
import { ConnectAiLauncher } from './ConnectAiLauncher'
import { AiConnectivityProvider } from '../AiConnectivityProvider'

function seedProjects(count: number) {
  useProjectStore.setState({
    projects: Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `Project ${i}`,
      unitOfMeasure: 'points',
      sprintCadenceWeeks: 2 as const,
      firstSprintStartDate: '2026-01-05',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    sprints: [],
    viewingProjectId: count > 0 ? 'p0' : null,
    forecastInputs: {},
    burnUpConfigs: {},
  })
}

beforeEach(() => {
  seedProjects(1)
})

describe('ConnectAiLauncher does not own the connection', () => {
  it('renders NOTHING without a provider above it', () => {
    // The load-bearing assertion. A launcher that called useAiConnectivity
    // itself would render its button here, because the mock reports an active
    // session — and that is exactly the v0.37.0 defect.
    const { container } = render(<ConnectAiLauncher />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders the button when a provider IS above it', () => {
    // The provider consumes the same mock, which reports an ACTIVE session —
    // so the button renders in its paired state, labelled "AI".
    render(
      <AiConnectivityProvider>
        <ConnectAiLauncher />
      </AiConnectivityProvider>
    )
    const button = screen.getByRole('button', { name: 'AI session active' })
    expect(button.textContent).toContain('AI')
  })
})

describe('the button is hidden when there is nothing to share', () => {
  it('renders nothing with no projects', () => {
    // Both siblings render inside a project, so they cannot reach this state.
    // Forecaster's header is global and its empty state has no project at
    // all — a button that opens a dialog saying "create a project first"
    // would be a Forecaster-only wart.
    seedProjects(0)
    const { container } = render(
      <AiConnectivityProvider>
        <ConnectAiLauncher />
      </AiConnectivityProvider>
    )
    expect(container.innerHTML).toBe('')
  })

  it('appears once a project exists', () => {
    seedProjects(2)
    render(
      <AiConnectivityProvider>
        <ConnectAiLauncher />
      </AiConnectivityProvider>
    )
    expect(screen.getByRole('button', { name: 'AI session active' })).toBeTruthy()
  })
})
