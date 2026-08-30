// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * AppShell had no test file at all until the crosslink transport moved import ownership into
 * it. These are WIRING facts — which component calls which hook, and what it hands down — so
 * they are asserted STRUCTURALLY against the source. Where a hook is mounted is not a
 * behaviour, and dressing it up as one produces a test that passes for the wrong reason: you
 * can move the hook back into ProjectsTab and still make a behavioural assertion go green.
 *
 * The behaviour that DOES matter — inert with a null opener, holding, expiring — is tested
 * where it lives, in `crosslinkProtocol.test.ts` and `useCrosslinkReceiver.test.tsx`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(import.meta.dirname, 'AppShell.tsx'), 'utf8')

describe('AppShell — crosslink wiring', () => {
  it('OWNS the import state rather than leaving it to the tab', () => {
    // ProjectsTab unmounts on every tab switch. If the hook lives there, a transfer arriving
    // mid-switch lands on nothing, and a held payload dies exactly while the user is looking
    // at a loading screen.
    expect(SOURCE).toMatch(/const importState = useImportState\(\)/)
  })

  it('mounts the crosslink receiver', () => {
    expect(SOURCE).toMatch(/useCrosslinkReceiver\(importState\)/)
  })

  it('passes the bundle down to ProjectsTab', () => {
    expect(SOURCE).toMatch(/<ProjectsTab[^>]*importState=\{importState\}/)
  })

  it('mounts the receiver OUTSIDE the per-tab ErrorBoundary', () => {
    // Which is why the receiver must be inert on failure: a throw here has nothing above it
    // to catch it, so a hand-typed URL could take down the whole shell.
    const hookAt = SOURCE.indexOf('useCrosslinkReceiver(importState)')
    const boundaryAt = SOURCE.indexOf('<ErrorBoundary>')
    expect(hookAt).toBeGreaterThan(-1)
    expect(boundaryAt).toBeGreaterThan(-1)
    expect(hookAt).toBeLessThan(boundaryAt)
  })

  it('keeps every tab reachable — the lift did not drop one', () => {
    for (const tab of ['ProjectsTab', 'SprintHistoryTab', 'ForecastTab', 'AboutTab', 'SettingsTab']) {
      expect(SOURCE, `${tab} is no longer rendered`).toContain(`<${tab}`)
    }
  })

  // ── The control. Without it every assertion above passes on an empty string ──
  it('CONTROL — the source really was read, and a false claim fails', () => {
    expect(SOURCE.length).toBeGreaterThan(1000)
    expect(SOURCE).not.toMatch(/useCrosslinkReceiver\(somethingElse\)/)
  })
})
