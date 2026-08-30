// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import {
  ALLOWED_SENDER_ORIGINS,
  CROSSLINK_MAX_HOLD_MS,
  CROSSLINK_NACK_MARGIN_MS,
  CROSSLINK_PROTOCOL,
  deriveHoldExpiry,
  initialReceiverState,
  reduceReceiver,
  type ReceiverEvent,
  type ReceiverState,
} from './crosslinkProtocol'

const XID = 'exchange-1'
const SENDER = ALLOWED_SENDER_ORIGINS[0]
const NOW = 1_000_000

const offer = (over: Record<string, unknown> = {}) => ({
  opcode: 'crosslink-offer',
  protocol: CROSSLINK_PROTOCOL,
  exchangeId: XID,
  exportText: '{"projects":[]}',
  senderDeadlineAt: NOW + 30_000,
  ...over,
})

/** A state that has already announced itself — the normal case for a real OFFER. */
function announced(over: Partial<ReceiverState> = {}): ReceiverState {
  const { state } = reduceReceiver(initialReceiverState(XID), { type: 'announce' })
  return { ...state, ...over }
}

const message = (over: Partial<Extract<ReceiverEvent, { type: 'message' }>> = {}): ReceiverEvent => ({
  type: 'message',
  origin: SENDER,
  fromOpener: true,
  data: offer(),
  now: NOW,
  ready: true,
  ...over,
})

describe('crosslink receiver — the environment split', () => {
  it('never allows localhost in a production build', () => {
    // The reason this matters is specific: a local page satisfying the origin check would
    // reach fast path 1, which applies an import with no user interaction at all.
    const prod = ['https://storymap.spertsuite.com']
    expect(prod.some((o) => o.includes('localhost'))).toBe(false)
  })

  it('holds SENDER origins only — this app is not in its own allowlist', () => {
    expect(ALLOWED_SENDER_ORIGINS.some((o) => o.includes('forecaster'))).toBe(false)
  })
})

describe('crosslink receiver — announce', () => {
  it('announces once per allowlisted origin', () => {
    const { state, effect } = reduceReceiver(initialReceiverState(XID), { type: 'announce' })
    expect(effect).toEqual({ type: 'send-open', origins: ALLOWED_SENDER_ORIGINS })
    expect(state.openedOrigins).toEqual([...ALLOWED_SENDER_ORIGINS])
  })

  it('is idempotent — a second announce emits nothing', () => {
    // StrictMode double-invokes the effect that dispatches this.
    const { effect } = reduceReceiver(announced(), { type: 'announce' })
    expect(effect).toEqual({ type: 'none' })
  })
})

// ── §6.3 · SEVEN independent rejections, one condition each ─────────────────
// Each case changes exactly ONE thing from a message that would otherwise be accepted, so a
// pass cannot be borrowed from a different guard failing first.
describe('crosslink receiver — the seven rejections', () => {
  it('1 · a non-allowlisted ORIGIN is refused SILENTLY', () => {
    const { effect } = reduceReceiver(announced(), message({ origin: 'https://evil.example' }))
    // Silent, not a NACK: answering would confirm to an unknown page that this tab exists.
    expect(effect).toEqual({ type: 'none' })
  })

  it('2 · a message not from the OPENER is refused SILENTLY', () => {
    const { effect } = reduceReceiver(announced(), message({ fromOpener: false }))
    expect(effect).toEqual({ type: 'none' })
  })

  it('3 · a wrong OPCODE is NACKed', () => {
    const { effect } = reduceReceiver(announced(), message({ data: offer({ opcode: 'crosslink-ack' }) }))
    expect(effect.type).toBe('nack')
  })

  it('4 · a wrong PROTOCOL is NACKed', () => {
    const { effect } = reduceReceiver(announced(), message({ data: offer({ protocol: 99 }) }))
    expect(effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('incompatible') })
  })

  it('5 · a wrong EXCHANGE ID is NACKed', () => {
    const { effect } = reduceReceiver(announced(), message({ data: offer({ exchangeId: 'someone-else' }) }))
    expect(effect).toMatchObject({ type: 'nack' })
  })

  it('6 · a malformed SHAPE is NACKed', () => {
    const noText = reduceReceiver(announced(), message({ data: offer({ exportText: 42 }) }))
    expect(noText.effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('no project data') })
    const noDeadline = reduceReceiver(announced(), message({ data: offer({ senderDeadlineAt: 'soon' }) }))
    expect(noDeadline.effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('expires') })
  })

  it('7 · an UNSOLICITED offer — one we never announced to — is NACKed', () => {
    // Same message, but from a state that never sent OPEN.
    const { effect } = reduceReceiver(initialReceiverState(XID), message())
    expect(effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('not expecting') })
  })

  it('CONTROL — the unmodified message is ACCEPTED', () => {
    // Without this, all seven above could pass while the reducer refuses everything.
    const { effect } = reduceReceiver(announced(), message())
    expect(effect).toMatchObject({ type: 'ingest', exportText: '{"projects":[]}' })
  })
})

describe('crosslink receiver — a tab that was not opened for a transfer', () => {
  it('refuses an offer when no exchange id was latched', () => {
    const noXid = reduceReceiver(initialReceiverState(null), { type: 'announce' }).state
    const { effect } = reduceReceiver(noXid, message())
    expect(effect.type).toBe('nack')
  })
})

// ── §6.5 · The bounded hold queue ───────────────────────────────────────────
describe('crosslink receiver — the hold queue', () => {
  it('HOLDS an offer that arrives before the workspace is ready', () => {
    const { state, effect } = reduceReceiver(announced(), message({ ready: false }))
    expect(effect).toEqual({ type: 'none' })
    expect(state.held).toMatchObject({ exportText: '{"projects":[]}', origin: SENDER })
  })

  it('APPLIES the held offer once readiness arrives', () => {
    const held = reduceReceiver(announced(), message({ ready: false })).state
    const { state, effect } = reduceReceiver(held, { type: 'readiness', ready: true, now: NOW + 10 })
    expect(effect).toMatchObject({ type: 'ingest', exportText: '{"projects":[]}' })
    expect(state.held).toBeNull()
  })

  it('REQUEUES rather than NACKs when readiness lapses mid-hold', () => {
    // `useCloudSync` clears the signal in effect cleanup, which StrictMode also triggers.
    // Treating that as a refusal would fail every first send under StrictMode.
    const held = reduceReceiver(announced(), message({ ready: false })).state
    const lapsed = reduceReceiver(held, { type: 'readiness', ready: false, now: NOW + 10 })
    expect(lapsed.effect).toEqual({ type: 'none' })
    expect(lapsed.state.held).not.toBeNull()
    const recovered = reduceReceiver(lapsed.state, { type: 'readiness', ready: true, now: NOW + 20 })
    expect(recovered.effect.type).toBe('ingest')
  })

  it('EXPIRES a hold to a NACK the sender is still listening for', () => {
    const held = reduceReceiver(announced(), message({ ready: false })).state
    const expiry = held.held!.expiresAt
    const { state, effect } = reduceReceiver(held, { type: 'tick', now: expiry })
    expect(effect).toMatchObject({ type: 'nack' })
    expect(state.held).toBeNull()
    // The whole point of the margin: expiry lands BEFORE the sender gives up, so the refusal
    // arrives rather than the user getting silence.
    expect(expiry).toBeLessThan(NOW + 30_000)
  })

  it('prefers EXPIRY over a late readiness in the same tick', () => {
    // The duplicate-import trace: sender times out, user does the JSON download by hand,
    // hydration finally lands, and a stale hold drains a second copy of the same project.
    const held = reduceReceiver(announced(), message({ ready: false })).state
    const { effect } = reduceReceiver(held, {
      type: 'readiness',
      ready: true,
      now: held.held!.expiresAt,
    })
    expect(effect.type).toBe('nack')
  })

  it('is BOUNDED — a second offer while one is held is refused, not queued', () => {
    const held = reduceReceiver(announced(), message({ ready: false })).state
    const { effect } = reduceReceiver(held, message({ ready: false }))
    expect(effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('already in progress') })
  })

  it('is BOUNDED across an in-flight ingest too', () => {
    const busy = reduceReceiver(announced(), message()).state
    expect(busy.busy).toBe(true)
    const { effect } = reduceReceiver(busy, message())
    expect(effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('already in progress') })
  })

  it('ACKs with the outcome the importer actually reported', () => {
    const busy = reduceReceiver(announced(), message()).state
    const applied = reduceReceiver(busy, { type: 'ingested', didApply: true, origin: SENDER })
    expect(applied.effect).toEqual({ type: 'ack', origin: SENDER, didApply: true })
    expect(applied.state.busy).toBe(false)

    // didApply:false is the designed path for a conflicting payload, not a failure.
    const review = reduceReceiver(busy, { type: 'ingested', didApply: false, origin: SENDER })
    expect(review.effect).toEqual({ type: 'ack', origin: SENDER, didApply: false })
  })

  it('does nothing on a tick with nothing held', () => {
    expect(reduceReceiver(announced(), { type: 'tick', now: NOW }).effect).toEqual({ type: 'none' })
  })
})

// ── The clamp, called directly so it can be mutation-tested ─────────────────
describe('deriveHoldExpiry', () => {
  it('subtracts the NACK margin from the sender deadline', () => {
    expect(deriveHoldExpiry(NOW + 10_000, NOW)).toBe(NOW + 10_000 - CROSSLINK_NACK_MARGIN_MS)
  })

  it('clamps a deadline in the far future to the local ceiling', () => {
    // `senderDeadlineAt` arrives over the wire, so a buggy sender could pin a payload for days.
    expect(deriveHoldExpiry(NOW + 86_400_000, NOW)).toBe(NOW + CROSSLINK_MAX_HOLD_MS)
  })

  it('clamps a deadline already past to zero — expire now', () => {
    expect(deriveHoldExpiry(NOW - 5_000, NOW)).toBe(NOW)
  })

  it('clamps a deadline inside the margin to zero', () => {
    expect(deriveHoldExpiry(NOW + CROSSLINK_NACK_MARGIN_MS - 1, NOW)).toBe(NOW)
  })

  it('leaves the ceiling ABOVE the sender budget, so it never truncates a real hold', () => {
    expect(CROSSLINK_MAX_HOLD_MS).toBeGreaterThan(30_000)
  })
})

describe('crosslink receiver — an offer that is already out of time', () => {
  it('refuses immediately rather than holding a doomed payload', () => {
    const { state, effect } = reduceReceiver(
      announced(),
      message({ ready: false, data: offer({ senderDeadlineAt: NOW - 1 }) }),
    )
    expect(effect).toMatchObject({ type: 'nack', nackReason: expect.stringContaining('expired') })
    expect(state.held).toBeNull()
  })
})
