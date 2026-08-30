// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { captureCrosslinkFromUrl, getLatchedCrosslink } from './crosslinkLatch'

const setSearch = (search: string) => {
  window.history.replaceState({}, '', `/${search}`)
}

afterEach(() => setSearch(''))

describe('captureCrosslinkFromUrl', () => {
  it('reads both parameters from the URL', () => {
    setSearch('?crosslink=storymap&xid=abc-123')
    expect(captureCrosslinkFromUrl()).toEqual({ crosslink: 'storymap', xid: 'abc-123' })
  })

  it('returns nothing for a plain URL', () => {
    setSearch('')
    expect(captureCrosslinkFromUrl()).toEqual({ crosslink: null, xid: null })
  })

  it('requires BOTH parameters — a half-specified URL is not a transfer', () => {
    setSearch('?crosslink=storymap')
    expect(captureCrosslinkFromUrl().xid).toBeNull()
    setSearch('?xid=abc-123')
    expect(captureCrosslinkFromUrl().crosslink).toBeNull()
  })

  it('rejects an unknown sender name', () => {
    setSearch('?crosslink=somewhere-else&xid=abc-123')
    expect(captureCrosslinkFromUrl()).toEqual({ crosslink: null, xid: null })
  })

  it('does not strip the URL — that is the effect\'s job, not module load\'s', () => {
    // `inviteCapture.ts` records why: a module-load `history.replaceState` races Next's
    // router state. Latch early, strip late.
    setSearch('?crosslink=storymap&xid=abc-123')
    captureCrosslinkFromUrl()
    expect(window.location.search).toContain('crosslink=storymap')
  })

  it('exposes the module-load latch', () => {
    // Latched when this module was first imported, i.e. with no parameters. The value is a
    // snapshot, which is the property the receiver depends on.
    expect(getLatchedCrosslink()).toEqual({ crosslink: null, xid: null })
  })
})
