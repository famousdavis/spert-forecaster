// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

/*
 * v0.50.3. A colour declared in `@theme inline` is written into its utility as a literal
 * (`.text-spert-text-muted{color:#666}`), so a `.dark` override of the same variable can never
 * reach it. Until v0.50.3 every `spert-*` colour sat there: their 20 dark overrides were dead,
 * and light-theme greys and tints showed in dark mode.
 *
 * So this compiles globals.css with the app's own Tailwind and checks the outcome, whatever
 * the source looks like: for every colour the `.dark` rule overrides, a utility that uses it
 * must read `var(--color-…)`. (A first version read the source's block structure instead; a
 * one-line `@theme inline { … }` or `@theme static inline` slipped past it.)
 *
 * ⚠️ Tailwind scans this file too, and would add to the app's CSS any class or theme variable
 * written here in full that the app does not already use. So every class name and every
 * probe variable below is assembled at run time; the two `spert-*` names written out are
 * already used by the app.
 */

const HERE = import.meta.dirname
const GLOBALS = readFileSync(join(HERE, 'globals.css'), 'utf8')
const resolve = createRequire(join(HERE, 'theme-tokens.test.ts')).resolve

/** Compile CSS as the app's build does; `tw-animate-css` (keyframes only) is left out. */
async function build(css: string, candidates: string[]): Promise<string> {
  const compiler = await compile(css, {
    base: HERE,
    loadStylesheet: async (id: string, base: string) => {
      if (id === 'tw-animate-css') return { path: id, base, content: '' }
      if (id !== 'tailwindcss') throw new Error(`unexpected @import ${id}`)
      const path = resolve('tailwindcss/index.css')
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') }
    },
  })
  return compiler.build(candidates)
}

/** Every `--color-*` variable set inside a style rule whose selector names `.dark` (`.dark`,
 *  `html.dark`, …). The selector is the text after the previous `;`, so a statement before the
 *  rule, such as `@custom-variant dark (&:is(.dark *));`, is not read as part of it. */
function darkOverrides(css: string): string[] {
  const names: string[] = []
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = rule[1].split(';').pop()!.trim()
    if (!/\.dark(?![\w-])/.test(selector)) continue
    for (const m of rule[2].matchAll(/(--color-[\w-]+)\s*:/g)) names.push(m[1])
  }
  return [...new Set(names)]
}

/** The colours among `names` whose `text-…` utility does NOT read its variable. */
async function deadOverrides(css: string, names: string[]): Promise<string[]> {
  const suffix = (name: string) => name.slice('--color-'.length)
  const out = await build(css, names.map((n) => 'text-' + suffix(n)))
  return names.filter((n) => {
    const rule = out.match(new RegExp(`\\.text-${suffix(n)}\\s*\\{([^}]*)\\}`))
    return !rule || !rule[1].includes(`var(${n})`)
  })
}

describe('globals.css colour tokens', () => {
  const names = darkOverrides(GLOBALS)

  it('finds the dark overrides it checks (the reader is not silently empty)', () => {
    expect(names).toContain('--color-spert-text-muted')
    expect(names.length).toBeGreaterThan(10)
  })

  it('catches a colour declared inline (known-bad controls)', async () => {
    const probe = '--color-' + 'fcdtok-probe'
    const dark = `@custom-variant dark (&:is(.dark *));\nhtml.dark { ${probe}: #654321; }\n`
    // inline with a literal: the utility gets #123456
    const literal = `@import "tailwindcss";\n@theme inline { ${probe}: #123456; }\n${dark}`
    // inline pointing at another variable: the utility reads that one, not the overridden one
    const aliased = `@import "tailwindcss";\n@theme inline { ${probe}: var(--fcdtok-other); }\n${dark}`
    expect(darkOverrides(literal)).toEqual([probe])
    expect(await deadOverrides(literal, [probe])).toEqual([probe])
    expect(await deadOverrides(aliased, [probe])).toEqual([probe])
  })

  it('gives every dark-overridden colour a utility that reads its variable', async () => {
    expect(await deadOverrides(GLOBALS, names)).toEqual([])
  })
})

/*
 * v0.50.5. Seven classes in the Connect AI dialogs named `spert-muted`, a colour that has never
 * existed (the real one is `spert-text-muted`). Tailwind writes no rule for a class it cannot
 * resolve, and nothing else complains, so in the light theme that text took its parent's colour
 * (`#333`, or `#0a0a0a` near black) instead of the muted grey it was written for.
 *
 * So: every colour name that a `<utility>-spert-<name>` class uses anywhere in the `.ts` and
 * `.tsx` files under `src` (tests included) must compile, with the app's Tailwind, to a rule.
 * A `var(--color-spert-<name>)` counts too. The same run-time assembly as above keeps this
 * file from adding anything to the app's CSS, and from tripping its own check.
 */

const SRC = join(HERE, '..')
// Any utility (`text-`, `bg-`, `border-t-`, `from-` …, or `color-` in a CSS variable) before
// `spert-`; a variant before it (`dark:hover:`) ends at the `:`, an `/opacity` after it ends the name.
const SPERT_CLASS = /[a-z]+(?:-[a-z]+)*?-spert-([a-z0-9-]+)/g

/** Each `spert-*` colour name used in `sources`, with the places (`file:line`) that use it. */
function spertColourNames(sources: Array<[string, string]>): Map<string, string[]> {
  const uses = new Map<string, string[]>()
  for (const [file, text] of sources) {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(SPERT_CLASS)) {
        uses.set(m[1], [...(uses.get(m[1]) ?? []), `${file}:${i + 1}`])
      }
    })
  }
  return uses
}

/** Every `.ts`/`.tsx` file under `src`. */
function appSources(): Array<[string, string]> {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => [relative(SRC, join(SRC, f)), readFileSync(join(SRC, f), 'utf8')])
}

/** The names among `names` for which `text-spert-<name>` compiles to no rule. */
async function undefinedColours(css: string, names: string[]): Promise<string[]> {
  const cls = (n: string) => 'text-' + 'spert-' + n
  const out = await build(css, names.map(cls))
  return names.filter((n) => !new RegExp(`\\.${cls(n)}\\s*\\{`).test(out)).sort()
}

describe('spert-* colour classes in the app source', () => {
  const used = spertColourNames(appSources())
  // Assembled at run time: written out in full, both of these are classes Tailwind would build.
  const TEXT_MUTED = 'text' + '-muted'
  const BG_HIGHLIGHT = 'bg' + '-highlight'

  it('finds the classes it checks (the reader is not silently empty)', () => {
    expect(used.get(TEXT_MUTED)?.some((at) => at.startsWith(join('shell', 'components', 'TabNavigation.tsx')))).toBe(true)
    expect(used.size).toBeGreaterThan(20)
  })

  it('reports a colour that does not exist (known-bad controls)', async () => {
    const fixture = [
      `<p className="mt-1 ${'text-' + 'spert-' + 'muted'}">`, // the typo v0.50.5 fixed
      `<b className="${'dark:hover:' + 'bg-' + 'spert-' + 'nope'}/50">`, // behind variants and an opacity
      `<i className="${'border-' + 'spert-' + TEXT_MUTED}/40">`, // real: must not be reported
      `<u className="${'bg-' + 'spert-' + 'bg'} ${'bg-' + 'spert-' + BG_HIGHLIGHT}">`, // cut short; the real one it starts
      `const c = 'var(--${'color-' + 'spert-' + 'gone'})'`, // read through the variable
    ].join('\n')
    const names = spertColourNames([['fixture.tsx', fixture]])
    expect([...names.keys()].sort()).toEqual(['bg', BG_HIGHLIGHT, 'gone', 'muted', 'nope', TEXT_MUTED])
    expect(await undefinedColours(GLOBALS, [...names.keys()])).toEqual(['bg', 'gone', 'muted', 'nope'])
  })

  it('uses only colours that globals.css defines', async () => {
    const missing = await undefinedColours(GLOBALS, [...used.keys()])
    expect(Object.fromEntries(missing.map((n) => [n, used.get(n)]))).toEqual({})
  })
})
