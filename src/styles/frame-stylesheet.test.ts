// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The SPERT® Suite frame's stylesheet is VENDORED: a byte-for-byte copy of the canonical file in spert-suite-docs
// (suite/frame/spert-frame.css), the same in every app that adopts the frame (FRAME26, contract §9.1). Never edit this
// copy: a change goes to the canonical file, raises its --sf-version, and is copied into every app, one PR each, and
// then this pin changes with it. Checked like scripts/shipgate.mjs: by md5.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const HERE = import.meta.dirname
const SRC = join(HERE, '..')
const VENDORED = join(HERE, 'spert-frame.css')
const GLOBALS = join(SRC, 'app', 'globals.css')
/** The canonical file's md5 at spert-suite-docs 346d584, --sf-version "3" (FRAME26 v3: the Welcome panel, .sf-empty). */
const CANONICAL_MD5 = 'b00d0759ec0a0a4d2db6ba10b16678f0'

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p] })

describe('the vendored frame stylesheet', () => {
  it('is byte-identical to the canonical file (md5)', () => {
    expect(createHash('md5').update(readFileSync(VENDORED)).digest('hex')).toBe(CANONICAL_MD5)
  })

  it('declares version "3"', () => {
    expect(readFileSync(VENDORED, 'utf8')).toMatch(/--sf-version: "3";/)
  })

  it('is imported exactly once, by globals.css, unlayered (no layer() on the import)', () => {
    const globals = readFileSync(GLOBALS, 'utf8')
    expect(globals.match(/@import "\.\.\/styles\/spert-frame\.css";/g)).toHaveLength(1)
    // No other file imports it (a CSS @import, a JS/TS import or require). Comments and tests may name it.
    const IMPORTS = /@import[^;\n]*spert-frame\.css|\bimport\s[^;\n]*['"][^'"\n]*spert-frame\.css['"]|\bimport\s*['"][^'"\n]*spert-frame\.css['"]|require\([^)\n]*spert-frame\.css/
    const all = files(SRC).filter((p) => /\.(css|tsx?|mjs)$/.test(p) && IMPORTS.test(readFileSync(p, 'utf8')))
    expect(all.map((p) => relative(SRC, p))).toEqual([relative(SRC, GLOBALS)])
  })

  it('globals.css sets no overflow on the root: the frame’s scrollbar-gutter does that job, and the dialogs’ scroll lock needs it (F9)', () => {
    // Until v0.52.0 globals.css had `html { overflow-y: scroll }`. With the root's own overflow set, `body`'s does not
    // reach the viewport, so the four dialogs' `document.body.style.overflow = 'hidden'` was inert: the page scrolled
    // behind an open dialog (measured on production v0.51.2: scrollY 133). The frame sets `scrollbar-gutter: stable`.
    const css = readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/overflow(-y)?\s*:\s*scroll/)
    expect(css.match(/(^|[\s,}])(html|:root)\s*\{[^}]*overflow/g)).toBeNull()
    expect(readFileSync(VENDORED, 'utf8')).toMatch(/:root:has\(\.sf-app\) \{ scrollbar-gutter: stable; \}/)
  })
})
