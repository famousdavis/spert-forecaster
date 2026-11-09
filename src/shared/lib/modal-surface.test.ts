// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// v0.48.1: page shortcuts wait while a modal surface is open, and a surface is
// "open" when an element carrying the marker is in the DOM. So a modal that
// forgets the marker silently brings back the defect this release fixed: a digit
// key switching the tab behind it. This file goes red when that happens.
//
// The check is a SOURCE SCAN, like AppShell.test.tsx: in every non-test .tsx file
// under src/, each `aria-modal=` needs a `{...modalSurfaceProps}` spread. Two of
// the six surfaces at v0.48.1 (CloudStorageModal, ConnectAiPanel) depend on the
// auth context or Firebase, so the scan, not a render, is what reaches all of
// them. The four that render bare are also exercised for real in
// useKeyboardShortcuts.test.tsx.
//
// ⚠️ A scan that reads nothing passes "every file has its marker" perfectly. The
// control below requires the scan to have read many files and to have FOUND the
// two surfaces known to be modal, so a wrong root, a wrong extension filter or a
// broken pattern fails loudly instead.
// ===========================================================================

import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

import { MODAL_SURFACE_ATTR, isModalSurfaceOpen, modalSurfaceProps } from './modal-surface'

const SRC = join(import.meta.dirname, '..', '..')

function sourceTsx(): Array<{ rel: string; text: string }> {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((rel) => rel.endsWith('.tsx') && !rel.endsWith('.test.tsx'))
    .map((rel) => ({ rel: rel.split(sep).join('/'), text: readFileSync(join(SRC, rel), 'utf8') }))
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length
const ARIA_MODAL = /aria-modal=/g
const MARKER = /\{\.\.\.modalSurfaceProps\}/g

describe('isModalSurfaceOpen', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('is false with no marked element, true with one, false again once it is removed', () => {
    expect(isModalSurfaceOpen()).toBe(false)
    const el = document.createElement('div')
    el.setAttribute(MODAL_SURFACE_ATTR, '')
    document.body.appendChild(el)
    expect(isModalSurfaceOpen()).toBe(true)
    el.remove()
    expect(isModalSurfaceOpen()).toBe(false)
  })

  it('spreads exactly the marker attribute', () => {
    expect(modalSurfaceProps).toEqual({ 'data-modal-surface': '' })
  })
})

describe('every aria-modal surface carries the modal-surface marker', () => {
  const files = sourceTsx()
  const modal = files.filter((f) => count(f.text, ARIA_MODAL) > 0)

  // ── The control. Without it the assertion below passes on zero files ──
  it('the scan reads the source tree and finds the known modal surfaces', () => {
    expect(files.length, 'non-test .tsx files scanned').toBeGreaterThan(50)
    const found = modal.map((f) => f.rel)
    expect(found).toContain('shared/components/ConfirmDialog.tsx')
    expect(found).toContain('shared/components/KeyboardShortcutsHelp.tsx')
  })

  it('no aria-modal surface lacks the marker', () => {
    const missing = modal
      .filter((f) => count(f.text, MARKER) < count(f.text, ARIA_MODAL))
      .map((f) => `${f.rel}: ${count(f.text, ARIA_MODAL)} aria-modal, ${count(f.text, MARKER)} marker`)
    expect(missing, 'spread {...modalSurfaceProps} onto the overlay root of each').toEqual([])
  })
})
