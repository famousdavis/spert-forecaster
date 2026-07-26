// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { callGeneratePairingCode } from '@/shared/firebase/callables'
import { functionsInstance } from '@/shared/firebase/config'
import { buildPairingPrompt } from '../copyPrompt'
import type { AiSessionState } from '../hooks/useAiConnectivity'

interface ConnectAiPanelProps {
  sessionState: AiSessionState
  onChangePermissions: (consentRead: boolean) => Promise<boolean>
  onDisconnect: () => Promise<void>
}

/** Ten minutes; a code expires in fifteen. */
const CODE_REFRESH_MS = 10 * 60 * 1000

export function ConnectAiPanel({
  sessionState, onChangePermissions, onDisconnect,
}: ConnectAiPanelProps) {
  const [code, setCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState(false)
  const [copied, setCopied] = useState<'code' | 'prompt' | null>(null)
  const [permError, setPermError] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const sessionId = sessionState.sessionId

  const fetchCode = useCallback(async () => {
    if (!functionsInstance || !sessionId) { setCodeError(true); return }
    setCodeLoading(true)
    setCodeError(false)
    try {
      const { code: c } = await callGeneratePairingCode(sessionId)
      setCode(c)
    } catch {
      setCodeError(true)
    } finally {
      setCodeLoading(false)
    }
  }, [sessionId])

  // fetchCode is an async network call whose loading, error and result all
  // have to land in state; there is no render-time equivalent, and the
  // sibling app carries the same disable for the same reason.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (sessionId) void fetchCode()
  }, [sessionId, fetchCode])

  // Refresh while the panel is idle, but stop once the AI is actually
  // connected — rotating the code under a live pairing serves no purpose.
  useEffect(() => {
    if (!sessionId || sessionState.aiConnected) return
    refreshTimerRef.current = setInterval(() => void fetchCode(), CODE_REFRESH_MS)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [sessionId, sessionState.aiConnected, fetchCode])

  const copy = async (kind: 'code' | 'prompt') => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(kind === 'code' ? code : buildPairingPrompt(code))
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard blocked (permissions or an insecure context) — the code is
      // on screen and selectable.
    }
  }

  const handleToggleRead = async () => {
    setPermError(false)
    const ok = await onChangePermissions(!sessionState.consentRead)
    if (!ok) setPermError(true)
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await onDisconnect()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="mt-3 rounded border border-spert-border p-4 dark:border-gray-600">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            sessionState.aiConnected ? 'bg-green-500' : 'bg-gray-400'
          }`}
          aria-hidden="true"
        />
        <span className="text-spert-text dark:text-gray-200">
          {sessionState.aiConnected
            ? 'An AI assistant is connected.'
            : 'Waiting for an AI assistant to connect.'}
        </span>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-spert-muted dark:text-gray-400">
          Pairing code
        </div>
        {codeLoading && <p className="mt-1 text-sm text-spert-muted">Generating…</p>}
        {codeError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            Could not generate a pairing code.{' '}
            <button type="button" onClick={() => void fetchCode()} className="underline">
              Try again
            </button>
          </p>
        )}
        {code && !codeLoading && (
          <>
            <div className="mt-1 font-mono text-2xl tracking-widest text-spert-text dark:text-gray-100">
              {code}
            </div>
            <p className="mt-1 text-xs text-spert-muted dark:text-gray-400">
              Single-use, expires in 15 minutes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copy('code')}
                className="rounded border border-spert-border px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-200"
              >
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                onClick={() => void copy('prompt')}
                className="rounded bg-spert-blue px-3 py-1.5 text-sm font-medium text-white"
              >
                {copied === 'prompt' ? 'Copied' : 'Copy prompt for your AI'}
              </button>
            </div>
          </>
        )}
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={sessionState.consentRead}
          onChange={() => void handleToggleRead()}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-spert-text dark:text-gray-200">Read Mode</span>
          <span className="block text-spert-muted dark:text-gray-400">
            {sessionState.consentRead
              ? 'The assistant can read the project you have open. Turning this off deletes the uploaded copy and keeps the pairing.'
              : 'The assistant can explain how forecasting works but cannot see your project.'}
          </span>
        </span>
      </label>
      {permError && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
          Could not update Read Mode. Check your connection and try again.
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={disconnecting}
          className="rounded border border-spert-border px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:border-gray-600 dark:text-red-400"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  )
}
