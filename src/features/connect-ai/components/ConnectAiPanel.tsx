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
  open: boolean
  onClose: () => void
  sessionState: AiSessionState
  onChangePermissions: (consentRead: boolean) => Promise<boolean>
  onDisconnect: () => Promise<void>
}

/** Ten minutes; a code expires in fifteen. */
const CODE_REFRESH_MS = 10 * 60 * 1000

/**
 * The paired-session panel: pairing code, Read Mode toggle, Disconnect.
 *
 * A modal opened from the header button, matching SPERT Story Map's
 * ConnectPanel and SPERT Scheduler's ConnectAiPanel. It was an inline block
 * inside a Settings section until v0.38.0; see ConnectAiLauncher for why that
 * moved.
 */
export function ConnectAiPanel({
  open, onClose, sessionState, onChangePermissions, onDisconnect,
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
    if (open && sessionId) void fetchCode()
  }, [open, sessionId, fetchCode])

  // Refresh while the panel is open and idle, but stop once the AI is
  // actually connected — rotating the code under a live pairing serves no
  // purpose, and a closed panel has no code on screen to rotate.
  useEffect(() => {
    if (!open || !sessionId || sessionState.aiConnected) return
    refreshTimerRef.current = setInterval(() => void fetchCode(), CODE_REFRESH_MS)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [open, sessionId, sessionState.aiConnected, fetchCode])

  // Escape closes, and the body does not scroll behind the modal — matching
  // ConfirmDialog, which is this app's modal reference.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

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
      // Nothing left to show once the pairing is gone.
      onClose()
    } finally {
      setDisconnecting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-ai-panel-title"
        className="relative z-10 mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
      <div className="mb-3 flex items-start justify-between">
        <h3
          id="connect-ai-panel-title"
          className="text-lg font-semibold text-spert-text dark:text-gray-100"
        >
          Connect AI
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded p-1 text-spert-muted hover:text-spert-text dark:text-gray-400 dark:hover:text-gray-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
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

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={disconnecting}
          className="rounded border border-spert-border px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:border-gray-600 dark:text-red-400"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-spert-border px-4 py-1.5 text-sm dark:border-gray-600 dark:text-gray-200"
        >
          Done
        </button>
      </div>
      </div>
    </div>
  )
}
