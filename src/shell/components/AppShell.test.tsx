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
const HEADER = readFileSync(join(import.meta.dirname, 'AppHeader.tsx'), 'utf8')

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
      // The brand row is AppHeader since v0.52.0 (the SPERT® Suite frame); it was an inline <header> before.
      '<AppHeader',
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

  // v0.51.0 — keys 1–5 select the five tabs, in the tab bar's order, and no other shortcut
  // selects a tab. Nothing pinned this before: the hook's tests drive probe shortcuts, and the
  // test above reads the '?' entry only. The Help Center link at the end of the tab bar is a
  // link, not a tab, so it gets no key; a sixth digit or a swapped pair turns this red. A
  // WIRING fact, so structural, like the '?' entry. Read within the shortcuts array only.
  it('maps keys 1–5 to the five tabs, in order, and no other shortcut selects a tab', () => {
    const start = SOURCE.indexOf('const shortcuts: KeyboardShortcut[]')
    expect(start, 'the shortcuts array').toBeGreaterThan(-1)
    // v0.52.0: every tab choice goes through selectTab, which also leaves another route (the changelog) for "/".
    const block = SOURCE.slice(start, SOURCE.indexOf('], [selectTab])', start))
    const entries = [...block.matchAll(/\{\s*key: '([^']+)',([\s\S]*?)\n\s*\},?/g)].map((m) => ({
      key: m[1],
      body: m[2],
    }))
    const tabKeys = entries
      .filter((e) => e.body.includes('selectTab('))
      .map((e) => [e.key, e.body.match(/action: \(\) => selectTab\('([^']+)'\),/)?.[1]])
    expect(tabKeys).toEqual([
      ['1', 'projects'],
      ['2', 'sprint-history'],
      ['3', 'forecast'],
      ['4', 'settings'],
      ['5', 'about'],
    ])
    // Counted over the whole array too, so a tab shortcut shaped differently from the entries
    // above cannot slip past the parse.
    expect(block.split('selectTab(').length - 1).toBe(5)
    expect(block, 'a shortcut that bypasses selectTab').not.toContain('setActiveTab(')
    // The parse really saw the array: the '?' entry is in it and selects no tab.
    expect(entries.map((e) => e.key)).toContain('?')
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
    // v0.52.0: the chip is in the frame's brand row, AppHeader, which hands it both, unchanged.
    expect(SOURCE).toMatch(/^\s*onOpenAccount=\{\(\) => setCloudModalOpen\(true\)\}$/m)
    expect(SOURCE).toMatch(/^\s*accountButtonRef=\{userMenuRef\}$/m)
    expect(HEADER).toMatch(/^\s*<UserMenu buttonRef=\{accountButtonRef\} onRequestOpen=\{onOpenAccount\} \/>$/m)
    const modal = SOURCE.match(/^\s*<CloudStorageModal$([\s\S]*?)^\s*\/>$/m)?.[1] ?? ''
    expect(modal).toMatch(/^\s*returnFocusTo=\{\(\) => userMenuRef\.current\}$/m)
  })
})
