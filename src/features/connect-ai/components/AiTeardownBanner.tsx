// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getPendingAiTeardownSessionId,
  retryPendingAiTeardown,
  clearPendingAiTeardown,
  AI_TEARDOWN_CHANGED_EVENT,
} from '../lib/ai-session-teardown'

/**
 * Tells the user, in plain words, when sign-out could NOT end their Connect AI
 * session on the server (e.g. they were offline). Mounted once in AppShell, so
 * it shows wherever the user lands after signing out. Returns null when nothing
 * is pending. Retries on mount and when the browser comes back online, so the
 * common offline-then-online case clears itself with no user action.
 */
export function AiTeardownBanner() {
  const [pending, setPending] = useState<boolean>(
    () => getPendingAiTeardownSessionId() !== null,
  )
  const [retrying, setRetrying] = useState(false)

  const refresh = useCallback(() => {
    setPending(getPendingAiTeardownSessionId() !== null)
  }, [])

  const retry = useCallback(async () => {
    if (!getPendingAiTeardownSessionId()) {
      refresh()
      return
    }
    setRetrying(true)
    try {
      await retryPendingAiTeardown()
    } finally {
      setRetrying(false)
      refresh()
    }
  }, [refresh])

  useEffect(() => {
    let active = true
    const onChanged = () => refresh()
    const onOnline = () => { void retry() }
    window.addEventListener(AI_TEARDOWN_CHANGED_EVENT, onChanged)
    window.addEventListener('storage', onChanged)
    window.addEventListener('online', onOnline)
    // Retry on load, off the synchronous effect path so the only setState
    // (refresh) runs after the await, not synchronously inside the effect.
    void (async () => {
      await retryPendingAiTeardown()
      if (active) refresh()
    })()
    return () => {
      active = false
      window.removeEventListener(AI_TEARDOWN_CHANGED_EVENT, onChanged)
      window.removeEventListener('storage', onChanged)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh, retry])

  if (!pending) return null

  return (
    <div
      className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4 flex items-start gap-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
          Your AI assistant may still be connected.
        </p>
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Signing out could not reach the server to end your Connect AI session.
          Until it does, a paired AI assistant can still read your last-open
          project. Forecaster keeps trying whenever you are online, and you can
          retry now with Try again. Otherwise the session ends on its own within
          7 days.
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="text-xs font-medium px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white transition-colors"
        >
          {retrying ? 'Trying…' : 'Try again'}
        </button>
        <button
          type="button"
          onClick={() => { clearPendingAiTeardown(); refresh() }}
          className="text-xs text-amber-700 dark:text-amber-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
