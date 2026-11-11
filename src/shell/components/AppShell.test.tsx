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

  // v0.48.0 — the SPERT® suite's shared placement for the app-wide notices. Also a WIRING
  // fact: the caution's "Got it" lasts until the next page load only because the banner is
  // mounted here, outside the per-tab conditional inside <main>; mounted inside a tab, every
  // tab switch would bring it back.
  it('renders the app-wide notices below the navigation and above <main>, in order', () => {
    const at = (s: string) => {
      const i = SOURCE.indexOf(s)
      expect(i, `${s} not found`).toBeGreaterThan(-1)
      return i
    }
    const order = [
      '</header>',
      '<TabNavigation',
      '<InvitationBanner />',
      '<AiTeardownBanner />',
      '<FirstRunBanner />',
      '<LocalStorageWarningBanner />',
      '<ExportCheckWarning />',
      '<main',
    ].map(at)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // Each rendered exactly once.
    for (const banner of ['<InvitationBanner', '<AiTeardownBanner', '<FirstRunBanner', '<LocalStorageWarningBanner', '<ExportCheckWarning']) {
      expect(SOURCE.split(banner).length - 1, banner).toBe(1)
    }
  })

  // v0.48.1 — `?` is the help's only opener, and a WIRING fact: the shortcut's action sets
  // the state the help reads. The hook's tests prove a real `?` reaches a shortcut; this
  // proves that shortcut is the one that opens the help. Read within the `?` entry only, so
  // another shortcut's action cannot satisfy it.
  it("wires the '?' shortcut to open the keyboard shortcuts help", () => {
    const start = SOURCE.indexOf("key: '?',")
    expect(start, "the '?' shortcut entry").toBeGreaterThan(-1)
    const entry = SOURCE.slice(start, SOURCE.indexOf('}', start))
    expect(entry).toMatch(/action: \(\) => setIsShortcutsHelpOpen\(true\),/)
    expect(SOURCE).toMatch(/<KeyboardShortcutsHelp\s+isOpen=\{isShortcutsHelpOpen\}/)
  })

  // ── The control. Without it every assertion above passes on an empty string ──
  it('CONTROL — the source really was read, and a false claim fails', () => {
    expect(SOURCE.length).toBeGreaterThan(1000)
    expect(SOURCE).not.toMatch(/useCrosslinkReceiver\(somethingElse\)/)
  })
})

// v0.50.4 (F6) — a WIRING fact, so structural (see the header). The Cloud Storage window returns
// focus to the header's account button as it is when the window closes: signing out swaps that
// button for another element, so the element that opened the window can be gone. The behaviour
// (focus lands on the live button; with the opener alone it is lost) is CloudStorageModal.focus.test.tsx;
// UserMenu's ref naming whichever button is shown is UserMenu.test.tsx.
describe('AppShell — focus when Cloud Storage closes (v0.50.4)', () => {
  it('UserMenu fills the ref the window reads when it closes', () => {
    expect(SOURCE).toMatch(/^\s*const userMenuRef = useRef<HTMLButtonElement>\(null\)$/m)
    expect(SOURCE).toMatch(/^\s*<UserMenu buttonRef=\{userMenuRef\} onRequestOpen=\{\(\) => setCloudModalOpen\(true\)\} \/>$/m)
    const modal = SOURCE.match(/^\s*<CloudStorageModal$([\s\S]*?)^\s*\/>$/m)?.[1] ?? ''
    expect(modal).toMatch(/^\s*returnFocusTo=\{\(\) => userMenuRef\.current\}$/m)
  })
})
