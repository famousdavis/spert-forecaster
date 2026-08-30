// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Crosslink — the RECEIVER half, in spert-forecaster.
 *
 * ⚠️ A file with this exact basename exists in BOTH repos:
 *   - `spert-forecaster/src/features/projects/lib/crosslinkProtocol.ts`   ← THIS FILE, the RECEIVER
 *   - `spert-story-map/src/lib/crosslinkProtocol.ts`                      ← the SENDER
 * The shared basename is deliberate — the two halves speak one protocol — but it means a bare
 * `crosslinkProtocol.ts` citation is ambiguous. Cite the path, and check which tree you are in.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * SPERT Story Map can hand a project straight to this app instead of making the user download
 * a JSON file and upload it again. This is a ONE-SHOT TRANSFER, not a connection: nothing
 * stays linked afterwards, nothing polls, and the JSON file route is unchanged and remains
 * the only way to move a project between devices.
 *
 *   OPEN   (this app → opener)  { opcode:'crosslink-open',  protocol, exchangeId }
 *   OFFER  (opener → this app)  { opcode:'crosslink-offer', protocol, exchangeId,
 *                                 exportText, senderDeadlineAt }
 *   ACK    (this app → opener)  { opcode:'crosslink-ack',   protocol, exchangeId, didApply }
 *   NACK   (this app → opener)  { opcode:'crosslink-nack',  protocol, exchangeId, nackReason }
 *
 * The SENDER mints `exchangeId` and puts it in our URL; we latch it and echo it. We never mint.
 *
 * ── WHY A PURE REDUCER ──────────────────────────────────────────────────────
 * Every decision — accept, hold, expire, refuse — is in `reduceReceiver`, which touches no
 * window, timer or React state. That is what makes the hold queue testable without a browser,
 * and it matters here because the queue's whole reason for existing is a timing window (cloud
 * hydration) that is miserable to reproduce by hand.
 */

/** Envelope version. NOT the export's `version: '1.0'`, which is the payload format. */
export const CROSSLINK_PROTOCOL = 1

/**
 * How far before the sender's own deadline we give up and refuse.
 *
 * Without a margin the hold expires at the same instant the sender stops listening, and the
 * NACK races that timeout — so the user gets silence instead of a reason. One second is ample
 * for a same-machine `postMessage`.
 */
export const CROSSLINK_NACK_MARGIN_MS = 1_000

/**
 * Sanity ceiling on a derived hold. `senderDeadlineAt` arrives over the wire, so a buggy or
 * hostile sender could name an instant days away and pin a payload in memory. Deliberately
 * ABOVE the sender's own 30s budget so it never truncates a legitimate hold — this bounds the
 * absurd, it does not participate in normal timing.
 */
export const CROSSLINK_MAX_HOLD_MS = 60_000

/**
 * Origins we accept a transfer FROM.
 *
 * ⚠️ SENDER origins only — this app's own origin is deliberately absent.
 * ⚠️ Production NEVER contains localhost. A local page that satisfied this check would reach
 * the zero-conflict fast path, which applies an import with NO user interaction at all.
 * The dev entry assumes Story Map's dev server is pinned (its vite config sets `strictPort`).
 */
export const ALLOWED_SENDER_ORIGINS: readonly string[] =
  process.env.NODE_ENV === 'production'
    ? ['https://storymap.spertsuite.com']
    : ['http://localhost:5173']

export interface CrosslinkOffer {
  opcode: 'crosslink-offer'
  protocol: number
  exchangeId: string
  exportText: string
  senderDeadlineAt: number
}

// ── The receiver's state machine ────────────────────────────────────────────

export interface HeldOffer {
  readonly exportText: string
  readonly origin: string
  /** Absolute `Date.now()` instant, already margin-adjusted and clamped. */
  readonly expiresAt: number
}

export interface ReceiverState {
  /** Latched from the URL at module load. `null` means this tab was not opened for a transfer. */
  readonly exchangeId: string | null
  /** Origins we have already announced ourselves to. */
  readonly openedOrigins: readonly string[]
  /** The bounded queue. Depth one, on purpose — see `reduceReceiver`. */
  readonly held: HeldOffer | null
  readonly busy: boolean
}

export type ReceiverEvent =
  | { type: 'announce' }
  /** `fromOpener` is computed by the caller: `event.source === window.opener` is not pure. */
  | { type: 'message'; origin: string; fromOpener: boolean; data: unknown; now: number; ready: boolean }
  | { type: 'readiness'; ready: boolean; now: number }
  | { type: 'tick'; now: number }
  | { type: 'ingested'; didApply: boolean; origin: string }

export type ReceiverEffect =
  | { type: 'none' }
  | { type: 'send-open'; origins: readonly string[] }
  | { type: 'ingest'; exportText: string; origin: string }
  | { type: 'ack'; origin: string; didApply: boolean }
  | { type: 'nack'; origin: string; nackReason: string }

export function initialReceiverState(exchangeId: string | null): ReceiverState {
  return { exchangeId, openedOrigins: [], held: null, busy: false }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

const NO_EFFECT = { type: 'none' } as const

/**
 * Derive how long we may hold this offer, from the sender's own deadline rather than from a
 * constant this app cannot see. There is only ONE number and it travels, so the two sides
 * cannot drift apart across independent releases.
 *
 * Exported for its own tests: the clamp is the guard, and a guard nobody can call directly is
 * a guard nobody can mutate-test.
 */
export function deriveHoldExpiry(senderDeadlineAt: number, now: number): number {
  const budget = senderDeadlineAt - CROSSLINK_NACK_MARGIN_MS - now
  const clamped = Math.min(Math.max(budget, 0), CROSSLINK_MAX_HOLD_MS)
  return now + clamped
}

export function reduceReceiver(
  state: ReceiverState,
  event: ReceiverEvent,
): { state: ReceiverState; effect: ReceiverEffect } {
  switch (event.type) {
    case 'announce': {
      // ⚠️ Idempotent means ONE OPEN PER ALLOWLISTED ORIGIN, not one OPEN total. A naive
      // "have we announced?" latch kills the dev handshake, because dev has its own origin.
      const unannounced = ALLOWED_SENDER_ORIGINS.filter((o) => !state.openedOrigins.includes(o))
      if (unannounced.length === 0) return { state, effect: NO_EFFECT }
      return {
        state: { ...state, openedOrigins: [...state.openedOrigins, ...unannounced] },
        effect: { type: 'send-open', origins: unannounced },
      }
    }

    case 'message':
      return reduceMessage(state, event)

    case 'readiness':
    case 'tick': {
      if (!state.held) return { state, effect: NO_EFFECT }
      // TTL first: an expired hold must refuse even if readiness arrived in the same tick.
      // Draining a stale payload is precisely the duplicate import this queue exists to stop —
      // the sender has already given up and the user has probably used the file route by now.
      if (event.now >= state.held.expiresAt) {
        const origin = state.held.origin
        return {
          state: { ...state, held: null },
          effect: {
            type: 'nack',
            origin,
            nackReason:
              'SPERT Forecaster was still loading your cloud projects and ran out of time to accept the transfer.',
          },
        }
      }
      const ready = event.type === 'readiness' ? event.ready : true
      // Not ready yet, or already ingesting: keep holding. Readiness is NOT monotonic — the
      // cloud-sync effect clears it on cleanup, which StrictMode's double-invoke also triggers
      // — so a lapse must requeue, never refuse.
      if (!ready || state.busy) return { state, effect: NO_EFFECT }
      return {
        state: { ...state, held: null, busy: true },
        effect: { type: 'ingest', exportText: state.held.exportText, origin: state.held.origin },
      }
    }

    case 'ingested':
      return {
        state: { ...state, busy: false },
        effect: { type: 'ack', origin: event.origin, didApply: event.didApply },
      }
  }
}

function reduceMessage(
  state: ReceiverState,
  event: Extract<ReceiverEvent, { type: 'message' }>,
): { state: ReceiverState; effect: ReceiverEffect } {
  // ── Silent through identity ──────────────────────────────────────────────
  // Answering an unrecognised page would tell it this exchange exists. These two checks are
  // what establish who is talking; everything after them gets a reason.
  if (!ALLOWED_SENDER_ORIGINS.includes(event.origin)) return { state, effect: NO_EFFECT }
  if (!event.fromOpener) return { state, effect: NO_EFFECT }

  const refuse = (nackReason: string) => ({
    state,
    effect: { type: 'nack' as const, origin: event.origin, nackReason },
  })

  const msg = asRecord(event.data)
  if (!msg) return refuse('The message was not an object.')
  if (msg.opcode !== 'crosslink-offer') return refuse('Unexpected message type.')
  if (msg.protocol !== CROSSLINK_PROTOCOL) {
    return refuse('SPERT Story Map and SPERT Forecaster are running incompatible versions.')
  }
  if (state.exchangeId === null || msg.exchangeId !== state.exchangeId) {
    return refuse('This transfer does not match the one this tab was opened for.')
  }
  // Shape. `exchangeId` is checked above by identity, so what remains is the cargo.
  if (typeof msg.exportText !== 'string' || msg.exportText.length === 0) {
    return refuse('The transfer carried no project data.')
  }
  if (typeof msg.senderDeadlineAt !== 'number' || !Number.isFinite(msg.senderDeadlineAt)) {
    return refuse('The transfer did not say when it expires.')
  }
  // Unsolicited: a well-formed OFFER from an origin we never announced ourselves to.
  if (!state.openedOrigins.includes(event.origin)) {
    return refuse('SPERT Forecaster was not expecting a transfer from this page.')
  }
  // Bounded at depth one. A second offer while one is in flight is either a duplicate or a
  // second sender; taking both is how the same project lands twice.
  if (state.held || state.busy) return refuse('A transfer is already in progress in this tab.')

  const expiresAt = deriveHoldExpiry(msg.senderDeadlineAt, event.now)
  if (expiresAt <= event.now) {
    // A non-positive budget: the sender is already out of time, or its deadline was nonsense.
    return refuse('The transfer expired before SPERT Forecaster could accept it.')
  }

  if (!event.ready) {
    return {
      state: { ...state, held: { exportText: msg.exportText, origin: event.origin, expiresAt } },
      effect: NO_EFFECT,
    }
  }
  return {
    state: { ...state, busy: true },
    effect: { type: 'ingest', exportText: msg.exportText, origin: event.origin },
  }
}
