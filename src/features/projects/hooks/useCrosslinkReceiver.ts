// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  CROSSLINK_PROTOCOL,
  initialReceiverState,
  reduceReceiver,
  type ReceiverEvent,
  type ReceiverState,
} from '../lib/crosslinkProtocol'
import { getLatchedCrosslink, type CrosslinkParams } from '../lib/crosslinkLatch'
import type { useImportState } from './useImportState'

/**
 * Receive a project handed over directly from SPERT Story Map.
 *
 * ⚠️ INERT unless this tab was opened for a transfer AND has an opener. A hand-typed
 * `/?crosslink=storymap&xid=x` reaches this code with `window.opener === null`; calling
 * `postMessage` on that throws, and this hook is mounted in the shell OUTSIDE the per-tab
 * `ErrorBoundary`, so an unguarded throw here takes down the whole app from a URL.
 *
 * All the decisions live in `../lib/crosslinkProtocol`. This file is the shell around them:
 * windows, timers, the router, and React.
 */
export function useCrosslinkReceiver(
  importState: ReturnType<typeof useImportState>,
  /** Test seam. Production always reads the module-load latch. */
  latched: CrosslinkParams = getLatchedCrosslink(),
): void {
  const { ingestPayload, assertIngestReady, cloudDataLoaded } = importState

  const router = useRouter()
  const pathname = usePathname()

  const stateRef = useRef<ReceiverState>(initialReceiverState(latched.xid))
  const strippedRef = useRef(false)

  /**
   * Reduce, then carry out whatever the reducer asked for.
   *
   * A NAMED function expression so the ingest branch can dispatch its own result back
   * without a ref or a dependency cycle. Every window touch in this hook is inside here; the
   * reducer above it stays pure.
   */
  const dispatch = useCallback(
    function dispatch(event: ReceiverEvent) {
      const { state, effect } = reduceReceiver(stateRef.current, event)
      stateRef.current = state

      const opener = typeof window === 'undefined' ? null : window.opener
      if (!opener) return
      const exchangeId = state.exchangeId
      if (!exchangeId) return

      const post = (body: Record<string, unknown>, origin: string) => {
        // ⚠️ Always a named origin, never '*'. The payload is the user's project data, and a
        // non-matching target is simply discarded by the browser — which is what makes
        // announcing to several allowlisted origins safe.
        opener.postMessage({ protocol: CROSSLINK_PROTOCOL, exchangeId, ...body }, origin)
      }

      switch (effect.type) {
        case 'none':
          return
        case 'send-open':
          for (const origin of effect.origins) post({ opcode: 'crosslink-open' }, origin)
          return
        case 'ack':
          post({ opcode: 'crosslink-ack', didApply: effect.didApply }, effect.origin)
          return
        case 'nack':
          post({ opcode: 'crosslink-nack', nackReason: effect.nackReason }, effect.origin)
          return
        case 'ingest':
          // ⚠️ The crosslink path's re-entrancy guard is the reducer's `busy` flag, set
          // synchronously before this runs. It has to live there rather than here: the file
          // path's `setApplying(true)` also disables the Import button, and this path
          // deliberately does not touch `applying`, so nothing in the UI holds the door.
          void ingestPayload(effect.exportText, 'crosslink').then((result) => {
            dispatch({ type: 'ingested', didApply: result.didApply, origin: effect.origin })
          })
          return
      }
    },
    [ingestPayload],
  )

  const isActive = latched.xid !== null

  // ── Strip the parameters, from an EFFECT ──────────────────────────────────
  // ⚠️ NOT at module load. `inviteCapture.ts:14-17` records why: a module-load
  // `history.replaceState` races Next.js's router state. The latch already happened at module
  // load — only the strip waits, and it goes through the router like the house pattern in
  // `useInvitationLanding.ts:117-121`. `strippedRef` is set BEFORE the read, matching that
  // hook's `hasRunRef` ordering.
  //
  // Read from `window.location` rather than `useSearchParams()`: this hook is mounted in the
  // shell, and `useSearchParams` there opts the whole page out of static prerendering unless
  // it is wrapped in Suspense. An effect never runs during prerender, so the window is both
  // available and simpler.
  useEffect(() => {
    if (!isActive) return
    if (strippedRef.current) return
    strippedRef.current = true
    const params = new URLSearchParams(window.location.search)
    if (!params.get('crosslink')) return
    params.delete('crosslink')
    params.delete('xid')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [isActive, pathname, router])

  // ── Listen, and announce ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return
    // Inert without an opener — see the warning at the top of this file.
    if (typeof window === 'undefined' || !window.opener) return

    const onMessage = (event: MessageEvent) => {
      dispatch({
        type: 'message',
        origin: event.origin,
        // Purity seam: comparing a `WindowProxy` cannot happen inside the reducer.
        fromOpener: event.source === window.opener,
        data: event.data,
        now: Date.now(),
        ready: assertIngestReady() === null,
      })
    }
    window.addEventListener('message', onMessage)
    // Idempotent under StrictMode's double-invoke: `openedOrigins` lives in a ref that
    // survives the remount, so the second pass announces to nothing. ⚠️ Idempotent means one
    // OPEN per allowlisted ORIGIN, not one OPEN in total — a naive "already announced" latch
    // would kill the dev handshake, whose origin differs from production's.
    dispatch({ type: 'announce' })
    return () => window.removeEventListener('message', onMessage)
  }, [isActive, dispatch, assertIngestReady])

  // ── Readiness is not monotonic ────────────────────────────────────────────
  // `useCloudSync` clears `cloudDataLoaded` in its effect cleanup, which StrictMode also
  // triggers. A lapse must REQUEUE, never refuse — the reducer owns that; this just tells it.
  useEffect(() => {
    if (!isActive) return
    dispatch({ type: 'readiness', ready: assertIngestReady() === null, now: Date.now() })
  }, [isActive, cloudDataLoaded, dispatch, assertIngestReady])

  // ── The hold's TTL ────────────────────────────────────────────────────────
  // Without this, a hold outlives the sender: it times out, the user falls back to the JSON
  // download and imports by hand, cloud hydration finally lands, and the stale payload drains
  // and imports the SAME project a second time.
  useEffect(() => {
    if (!isActive) return
    const timer = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 250)
    return () => window.clearInterval(timer)
  }, [isActive, dispatch])
}
