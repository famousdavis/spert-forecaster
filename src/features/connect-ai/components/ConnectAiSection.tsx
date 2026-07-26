// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { isFirebaseAvailable } from '@/shared/firebase/config'
import { useIsClient } from '@/shared/hooks'
import { useProjectStore, selectViewingProject } from '@/shared/state/project-store'
import { useAiConnectivityContext } from '../AiConnectivityProvider'
import { ConnectAiConsentModal } from './ConnectAiConsentModal'
import { ConnectAiPanel } from './ConnectAiPanel'

/**
 * The Connect AI entry point, in Settings.
 *
 * Gated on isFirebaseAvailable via useIsClient: the Firebase config is
 * environment-dependent, so evaluating it during the server render and again
 * on the client produces a hydration mismatch. The app works fully without
 * Firebase configured, and in that case this section simply does not appear.
 *
 * This component owns the CONTROLS ONLY. The connection itself lives in
 * AiConnectivityProvider at AppShell level, because AppShell renders tabs
 * conditionally and the publisher and heartbeat must survive leaving Settings.
 * See that file's header for what breaks if the hook moves back in here.
 */
export function ConnectAiSection() {
  const isClient = useIsClient()
  const [consentOpen, setConsentOpen] = useState(false)
  const [startError, setStartError] = useState(false)
  const connectivity = useAiConnectivityContext()
  const hasProject = !!useProjectStore(selectViewingProject)

  if (!isClient || !isFirebaseAvailable || !connectivity) return null
  const { sessionState, startSession, stopSession, changePermissions } = connectivity

  const handleConfirm = async (consentRead: boolean) => {
    setConsentOpen(false)
    setStartError(false)
    const ok = await startSession(consentRead)
    if (!ok) setStartError(true)
  }

  return (
    <section className="mt-8">
      <h3 className="text-base font-semibold text-spert-text dark:text-gray-100">
        Connect AI
      </h3>
      <p className="mt-1 text-sm text-spert-muted dark:text-gray-400">
        Let an AI assistant read your open project so it can explain your
        forecast. Read-only — the assistant cannot change anything here.
      </p>

      {!sessionState.sessionActive ? (
        <>
          <button
            type="button"
            onClick={() => setConsentOpen(true)}
            disabled={!hasProject}
            className="mt-3 rounded bg-spert-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Connect an AI assistant
          </button>
          {!hasProject && (
            <p className="mt-2 text-sm text-spert-muted dark:text-gray-400">
              Create a project first — there is nothing to share yet.
            </p>
          )}
          {startError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Could not start the connection. Check your network and try again.
            </p>
          )}
        </>
      ) : (
        <ConnectAiPanel
          sessionState={sessionState}
          onChangePermissions={changePermissions}
          onDisconnect={stopSession}
        />
      )}

      <ConnectAiConsentModal
        open={consentOpen}
        onCancel={() => setConsentOpen(false)}
        onConfirm={(consentRead) => void handleConfirm(consentRead)}
      />
    </section>
  )
}
