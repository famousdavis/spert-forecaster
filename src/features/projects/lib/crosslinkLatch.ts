// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Capture `?crosslink=storymap&xid=…` at MODULE LOAD, before any React effect can run.
 *
 * Modelled on `src/features/auth/lib/inviteCapture.ts`, which solves the same problem for
 * `?invite=`, and carrying the three parts of it that are load-bearing: the SSR guard, the
 * try/catch, and being callable so tests can drive it after setting `window.location.search`
 * rather than mocking a module.
 *
 * ⚠️ Capture only — this does NOT strip the URL, and that is deliberate. `inviteCapture.ts`
 * says why in its own words: stripping here with `window.history.replaceState` races Next.js's
 * router state. The house strips from an effect via `router.replace`, and so does
 * `useCrosslinkReceiver`. Latch early, strip late.
 *
 * Why module load at all: the sender opens this tab and immediately waits for us to announce
 * ourselves. Reading the parameter in an effect would be a race against our own first render;
 * module load precedes every effect by construction, so there is nothing to race.
 */

export interface CrosslinkParams {
  /** Which sender opened us. Only `'storymap'` is understood today. */
  readonly crosslink: string | null
  /** The exchange id the SENDER minted. We echo it; we never mint one. */
  readonly xid: string | null
}

const NONE: CrosslinkParams = { crosslink: null, xid: null }

export function captureCrosslinkFromUrl(): CrosslinkParams {
  if (typeof window === 'undefined') return NONE // SSR guard
  try {
    const params = new URLSearchParams(window.location.search)
    const crosslink = params.get('crosslink')
    const xid = params.get('xid')
    // Both or neither. A half-specified URL is not a transfer, and treating it as one would
    // leave us announcing to an opener that is not expecting us.
    if (crosslink !== 'storymap' || !xid) return NONE
    return { crosslink, xid }
  } catch {
    return NONE // jsdom edge cases / locked-down browsers
  }
}

// Module-load capture. Runs once when this module is first imported.
const latched: CrosslinkParams = captureCrosslinkFromUrl()

/** What was in the URL when this tab loaded, whatever the URL says now. */
export function getLatchedCrosslink(): CrosslinkParams {
  return latched
}
