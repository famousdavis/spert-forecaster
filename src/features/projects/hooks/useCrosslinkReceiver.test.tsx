// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
}))

import { useCrosslinkReceiver } from './useCrosslinkReceiver'
import { ALLOWED_SENDER_ORIGINS } from '../lib/crosslinkProtocol'
import type { useImportState } from './useImportState'

type ImportBundle = ReturnType<typeof useImportState>

const ingestPayload = vi.fn(async () => ({ didApply: true }))

/**
 * Only the three members this hook reads. Cast because the bundle has 19 and building the
 * other 16 would say nothing — this is not the ProjectsTab harness, where the real hook is
 * the point; here the hook under test IS the receiver.
 */
const bundle = (ready = true): ImportBundle =>
  ({
    ingestPayload,
    assertIngestReady: () => (ready ? null : 'Cloud projects are still loading — please try again in a moment.'),
    cloudDataLoaded: ready,
  }) as unknown as ImportBundle

let opener: { postMessage: ReturnType<typeof vi.fn> } | null

beforeEach(() => {
  replace.mockClear()
  ingestPayload.mockClear()
  window.history.replaceState({}, '', '/')
  opener = { postMessage: vi.fn() }
  Object.defineProperty(window, 'opener', { value: opener, writable: true, configurable: true })
})

afterEach(() => {
  Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true })
})

describe('useCrosslinkReceiver — inert unless it was actually opened for a transfer', () => {
  it('does nothing at all on a normal tab (no latched parameters)', () => {
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: null, xid: null }))
    expect(opener!.postMessage).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not throw when window.opener is NULL', () => {
    // A hand-typed `/?crosslink=storymap&xid=x` reaches here with no opener. This hook is
    // mounted outside the per-tab ErrorBoundary, so an unguarded postMessage on null would
    // take down the entire shell from a URL.
    Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true })
    expect(() =>
      renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'x' })),
    ).not.toThrow()
  })
})

describe('useCrosslinkReceiver — announcing', () => {
  it('posts OPEN to each allowlisted origin, echoing the SENDER-minted id', () => {
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'abc' }))
    expect(opener!.postMessage).toHaveBeenCalledTimes(ALLOWED_SENDER_ORIGINS.length)
    expect(opener!.postMessage).toHaveBeenCalledWith(
      { opcode: 'crosslink-open', protocol: 1, exchangeId: 'abc' },
      ALLOWED_SENDER_ORIGINS[0],
    )
  })

  it('never posts to a wildcard target origin', () => {
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'abc' }))
    for (const call of opener!.postMessage.mock.calls) {
      expect(call[1]).not.toBe('*')
      expect(ALLOWED_SENDER_ORIGINS).toContain(call[1])
    }
  })
})

describe('useCrosslinkReceiver — the URL strip', () => {
  it('strips the parameters from an EFFECT, via the router', () => {
    // Not at module load: `inviteCapture.ts:14-17` records that a module-load
    // `history.replaceState` races Next's router state.
    window.history.replaceState({}, '', '/?crosslink=storymap&xid=abc')
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'abc' }))
    expect(replace).toHaveBeenCalledWith('/', { scroll: false })
  })

  it('keeps any unrelated parameters', () => {
    window.history.replaceState({}, '', '/?crosslink=storymap&xid=abc&tab=forecast')
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'abc' }))
    expect(replace).toHaveBeenCalledWith('/?tab=forecast', { scroll: false })
  })

  it('does not touch the URL on a normal tab', () => {
    window.history.replaceState({}, '', '/?tab=forecast')
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: null, xid: null }))
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('useCrosslinkReceiver — end to end over a real MessageEvent', () => {
  it('ingests an OFFER from the opener and ACKs the outcome', async () => {
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'abc' }))
    opener!.postMessage.mockClear()

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: ALLOWED_SENDER_ORIGINS[0],
        source: window.opener as Window,
        data: {
          opcode: 'crosslink-offer',
          protocol: 1,
          exchangeId: 'abc',
          exportText: '{"projects":[]}',
          senderDeadlineAt: Date.now() + 30_000,
        },
      }),
    )

    expect(ingestPayload).toHaveBeenCalledWith('{"projects":[]}', 'crosslink')
    await vi.waitFor(() =>
      expect(opener!.postMessage).toHaveBeenCalledWith(
        { opcode: 'crosslink-ack', protocol: 1, exchangeId: 'abc', didApply: true },
        ALLOWED_SENDER_ORIGINS[0],
      ),
    )
  })

  it('CONTROL — the same OFFER from a different origin is ignored', () => {
    renderHook(() => useCrosslinkReceiver(bundle(), { crosslink: 'storymap', xid: 'abc' }))
    opener!.postMessage.mockClear()
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example',
        source: window.opener as Window,
        data: {
          opcode: 'crosslink-offer',
          protocol: 1,
          exchangeId: 'abc',
          exportText: '{"projects":[]}',
          senderDeadlineAt: Date.now() + 30_000,
        },
      }),
    )
    expect(ingestPayload).not.toHaveBeenCalled()
    expect(opener!.postMessage).not.toHaveBeenCalled()
  })
})
