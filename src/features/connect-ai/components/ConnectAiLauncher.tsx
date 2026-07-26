// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

// The Connect AI entry point: a header button, plus the two modals it opens.
//
// SUITE PARITY IS THE POINT. SPERT Story Map (ProductLayout) and SPERT
// Scheduler (ProjectPage) both expose Connect AI as a persistent button in
// the working surface's header, with an identical state machine — the label
// flips "Connect AI" → "AI" once paired, and a dot appears that pulses blue
// while an assistant is actually connected. Forecaster shipped v0.37.x with
// this buried in a Settings section instead, which meant the user could not
// see the pairing status without leaving their work, and the panel looked
// nothing like its siblings. v0.38.0 brings it into line.
//
// Deliberately NOT reproduced from the siblings: they show the project name
// beside the indicator, because their whole app is scoped to one project.
// Forecaster's header is global and one session follows whichever project is
// being viewed, so the button means "an assistant is paired to this browser"
// — which is the honest claim, and adding a project name would imply a
// per-project pairing that does not exist.

import { useCallback, useState } from 'react'
import { isFirebaseAvailable } from '@/shared/firebase/config'
import { useIsClient } from '@/shared/hooks'
import { useProjectStore } from '@/shared/state/project-store'
import { useAiConnectivityContext } from '../AiConnectivityProvider'
import { AI_CONSENT_KEY, AI_CONSENT_VERSION, AI_SESSION_ID_KEY } from '../constants'
import { ConnectAiConsentModal } from './ConnectAiConsentModal'
import { ConnectAiPanel } from './ConnectAiPanel'

export function ConnectAiLauncher() {
  const isClient = useIsClient()
  const connectivity = useAiConnectivityContext()
  const projectCount = useProjectStore((s) => s.projects.length)
  const [showConsent, setShowConsent] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [startError, setStartError] = useState(false)

  const sessionState = connectivity?.sessionState
  const startSession = connectivity?.startSession

  /**
   * The siblings' click handler, ported.
   *
   * Three branches: an active session opens the panel; a browser that has
   * already consented at the current version resumes SILENTLY and goes
   * straight to the panel; anything else asks for consent. The middle branch
   * is why re-pairing after a page reload does not re-prompt.
   */
  const handleClick = useCallback(() => {
    if (!startSession) return
    setStartError(false)
    if (sessionState?.sessionActive) {
      setShowPanel(true)
      return
    }
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(AI_CONSENT_KEY) ?? 'null') as
          | { version?: number; read?: boolean }
          | null
      } catch {
        return null
      }
    })()
    const sessionId = localStorage.getItem(AI_SESSION_ID_KEY)
    if (stored?.version === AI_CONSENT_VERSION && sessionId) {
      startSession(stored.read ?? false)
        .then((ok) => (ok ? setShowPanel(true) : setStartError(true)))
        .catch(() => setStartError(true))
      return
    }
    setShowConsent(true)
  }, [sessionState?.sessionActive, startSession])

  const handleConsentConnect = useCallback(
    async (consentRead: boolean) => {
      if (!startSession) return
      const ok = await startSession(consentRead)
      setShowConsent(false)
      if (ok) setShowPanel(true)
      else setStartError(true)
    },
    [startSession]
  )

  // Rendered only with Firebase configured AND at least one project to share.
  // The siblings cannot reach a no-project state — their headers live inside
  // a project — so a button that opens a dialog saying "create a project
  // first" would be a Forecaster-only wart.
  if (!isClient || !isFirebaseAvailable || !connectivity || projectCount === 0) return null

  const active = !!sessionState?.sessionActive

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={active ? 'AI session active' : 'Connect an AI assistant'}
        aria-label={active ? 'AI session active' : 'Connect an AI assistant'}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          active
            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
        }`}
      >
        {active && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              sessionState?.aiConnected ? 'animate-pulse bg-blue-500' : 'bg-gray-400'
            }`}
          />
        )}
        {active ? 'AI' : 'Connect AI'}
      </button>

      {startError && (
        <span className="text-xs text-red-600 dark:text-red-400">
          Connection failed
        </span>
      )}

      <ConnectAiConsentModal
        open={showConsent}
        onCancel={() => setShowConsent(false)}
        onConfirm={(consentRead) => void handleConsentConnect(consentRead)}
      />

      {sessionState && connectivity && (
        <ConnectAiPanel
          open={showPanel}
          onClose={() => setShowPanel(false)}
          sessionState={sessionState}
          onChangePermissions={connectivity.changePermissions}
          onDisconnect={connectivity.stopSession}
        />
      )}
    </>
  )
}
