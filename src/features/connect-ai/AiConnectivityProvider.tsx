// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

// WHY THIS PROVIDER EXISTS — read before moving the hook.
//
// useAiConnectivity must be invoked ONCE, from AppShell, and must stay mounted
// for the life of the app. It owns three things that have to outlive any one
// tab: the snapshot publisher, the heartbeat, and the session-document
// listener.
//
// The Connect AI *controls* live in Settings, but AppShell renders tabs
// conditionally — so calling the hook inside the Settings section unmounts it
// the moment the user navigates away. That is precisely when it matters most:
// the user leaves Settings, goes to the Forecast tab, runs a forecast, and the
// AI keeps reading a snapshot from before the run, because the thing that
// publishes updates is no longer mounted. The heartbeat stops too, so the
// pairing reads as disconnected within 90 seconds.
//
// This was observed in production during the v0.37.0 smoke, not caught by any
// unit test — every test renders the hook directly, where it never unmounts.
// If you are tempted to move the hook back into ConnectAiSection to simplify
// the wiring, this paragraph is the reason not to.

import { createContext, useContext, type ReactNode } from 'react'
import { useAiConnectivity, type UseAiConnectivityResult } from './hooks/useAiConnectivity'

const AiConnectivityContext = createContext<UseAiConnectivityResult | null>(null)

export function AiConnectivityProvider({ children }: { children: ReactNode }) {
  const value = useAiConnectivity()
  return (
    <AiConnectivityContext.Provider value={value}>
      {children}
    </AiConnectivityContext.Provider>
  )
}

/**
 * Read the app-wide AI connectivity state.
 *
 * Returns null when no provider is mounted, which is the case in tests that
 * render a subtree in isolation. Callers render nothing in that case rather
 * than throwing.
 */
export function useAiConnectivityContext(): UseAiConnectivityResult | null {
  return useContext(AiConnectivityContext)
}
