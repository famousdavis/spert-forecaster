// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * The header's SPERT® Forecaster is drawn as a gradient in Forecaster's favicon blue (HDR26, v0.51.1), and every point
 * of it stays readable on the page behind it, in both themes.
 *
 * ⚠️ jsdom has no paint, so nothing here is measured from a render: the end colours are read from `AppShell.tsx`'s
 * source, the background from the root `<div>`'s classes, resolved through the installed Tailwind's own `theme.css`,
 * and the contrast is computed here from the WCAG 2.x definition. The rendered page was measured in headless Chrome
 * when this was written. The colour maths is the HDR26 plan's Appendix A, typed; it is copied, not shared.
 *
 * The bar is 3 : 1, at every point of each ramp, because the title is large text at every width: bold, and at least
 * 24 px (the test below pins both). Both ramps clear the bar by a few hundredths, on purpose: the pinned backgrounds
 * below are what catches a change that would sink them.
 */
const APP_SHELL = join(import.meta.dirname, 'AppShell.tsx')
const GLOBALS_CSS = join(import.meta.dirname, '..', '..', 'app', 'globals.css')
const THEME_CSS = join(import.meta.dirname, '..', '..', '..', 'node_modules', 'tailwindcss', 'theme.css')

const BAR = 3
/** The root `<div>`'s background in each theme, measured in Chrome (`getComputedStyle`, read through a canvas). */
const PREMISE = { light: '#ffffff', dark: '#101828' } as const
/** "SPERT" and "Forecaster": one gradient per word, with the ® between them. */
const GRADIENT_SPANS = 2
/** The solid fallbacks' colours (HDR26 D10): the near-black for print and light, the near-white for dark. */
const NEAR_BLACK = 'gray-900'
const NEAR_WHITE = 'gray-100'
/** Large text at 3 : 1 needs at least 24 px, or 18.66 px bold; the title is bold, and this is its smallest size. */
const LARGE_PX = 24

// ---- Appendix A (HDR26 plan v6), typed ------------------------------------------------------------------------

type Triple = [number, number, number]

const lin = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const delin = (v: number) =>
  Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)))
const rgb = (h: string): Triple => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Triple
const hex = (a: number[]) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('')
const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map(lin) as Triple
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** A contrast ratio to two decimals, truncated: never rounded up across a bar. */
const trunc = (n: number) => (Math.floor(n * 100) / 100).toFixed(2)

const toOklab = (h: string): Triple => {
  const [r, g, b] = rgb(h).map(lin) as Triple
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const linFromOklab = ([lk, a, b]: Triple): Triple => {
  const l = (lk + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lk - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lk - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}
const fromOklab = (lab: Triple) => hex(linFromOklab(lab).map(delin))
const toLch = (h: string): Triple => {
  const [lk, a, b] = toOklab(h)
  return [lk, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}
const lab = ([lk, c, h]: Triple): Triple => [lk, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]
const inGamut = (lch: Triple) => linFromOklab(lab(lch)).every((v) => v >= -1e-6 && v <= 1 + 1e-6)
/** Fit to sRGB by cutting chroma at fixed lightness and hue; never by clamping channels, which turns the hue. */
const fromLch = ([lk, c, h]: Triple) => {
  let fit = c
  if (!inGamut([lk, c, h])) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (inGamut([lk, mid, h])) lo = mid
      else hi = mid
    }
    fit = lo
  }
  return fromOklab(lab([lk, fit, h]))
}

/** A colour as Tailwind's theme.css writes it: `#rgb`, `#rrggbb`, or `oklch(L% C H)` with H possibly `none`. */
function parseCssColor(value: string): string {
  const v = value.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(v)
  if (m) return '#' + Array.from(m[1]!).map((c) => c + c).join('').toLowerCase()
  m = /^#([0-9a-f]{6})$/i.exec(v)
  if (m) return '#' + m[1]!.toLowerCase()
  m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\s*\)$/i.exec(v)
  if (m) return fromOklab(lab([Number(m[1]) / 100, Number(m[2]), m[3] === 'none' ? 0 : Number(m[3])]))
  throw new Error('unreadable color: ' + v)
}

/**
 * The weakest contrast along a ramp, 41 samples. `oklab` is how Tailwind 4's `bg-gradient-to-r` interpolates
 * (`to right in oklab`); `srgb` is a plain gradient's. Both are checked, so a change of interpolation cannot pass.
 */
function weakest(e1: string, e2: string, ground: string, space: 'oklab' | 'srgb'): number {
  let min = Infinity
  const [a, b] = [toOklab(e1), toOklab(e2)]
  const [p, q] = [rgb(e1), rgb(e2)]
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const c =
      space === 'oklab'
        ? fromOklab(a.map((v, k) => v + (b[k]! - v) * t) as Triple)
        : hex(p.map((v, k) => Math.round(v + (q[k]! - v) * t)))
    min = Math.min(min, contrast(c, ground))
  }
  return min
}

// ---- Reading the source ---------------------------------------------------------------------------------------

const source = () => readFileSync(APP_SHELL, 'utf8')
const classList = (raw: string) => raw.split(/\s+/).filter(Boolean)

/** Every `const NAME = '…'` (or `"…"`) in the file, so a `className={NAME}` can be resolved to its classes. */
function stringConstants(text: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const m of Array.from(text.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*=\s*(?:'([^'\n]*)'|"([^"\n]*)")/g))) {
    found.set(m[1]!, (m[2] ?? m[3])!)
  }
  return found
}

/** The header's `<h1 …>` up to its closing tag: the title. Exactly one, or it fails. */
function title(text: string): { classes: string[]; inner: string } {
  const header = text.indexOf('<header')
  const all = Array.from(text.slice(header).matchAll(/<h1\s+className="([^"]*)">([\s\S]*?)<\/h1>/g))
  if (header === -1 || all.length !== 1) throw new Error(`AppShell.tsx: expected one <h1> in the header, found ${all.length}`)
  return { classes: classList(all[0]![1]!), inner: all[0]![2]! }
}

interface Span {
  classes: string[]
  text: string
}

/**
 * Every `<span>` in the title, with its classes: a literal `className="…"`, or a `className={NAME}` resolved through
 * the file's string constants. Any other form (a template literal, a call, a spread) fails loudly: a class string
 * the guard cannot read is a class string it cannot check.
 */
function titleSpans(text: string): Span[] {
  const constants = stringConstants(text)
  return Array.from(title(text).inner.matchAll(/<span\b([^>]*)>([^<]*)<\/span>/g)).map((m) => {
    const attrs = m[1]!.trim()
    const literal = /^className="([^"]*)"$/.exec(attrs)
    const named = /^className=\{(\w+)\}$/.exec(attrs)
    const raw = literal ? literal[1] : named ? constants.get(named[1]!) : undefined
    if (raw === undefined) throw new Error(`AppShell.tsx: a title <span> whose classes cannot be read: <span ${attrs}>`)
    return { classes: classList(raw), text: m[2]! }
  })
}

/** The title's gradient spans: found by `bg-clip-text` in their classes, never by the constant's name. */
const gradientSpans = (text: string) => titleSpans(text).filter((s) => s.classes.includes('bg-clip-text'))

/** The one class with this exact variant and utility, e.g. `dark:` + `from-` → `#5f9fff`. Exactly one, or it fails. */
function endColor(classes: string[], variant: '' | 'dark:', utility: 'from' | 'to'): string {
  const pattern = new RegExp(`^${variant}${utility}-\\[(#[0-9a-f]{6})\\]$`, 'i')
  const hits = classes.map((c) => pattern.exec(c)?.[1]).filter((h): h is string => h !== undefined)
  if (hits.length !== 1) throw new Error(`${variant}${utility}-[#…]: found ${hits.length}, expected exactly 1`)
  return hits[0]!.toLowerCase()
}

interface Ends {
  light: [string, string]
  dark: [string, string]
}

const endsOf = (classes: string[]): Ends => ({
  light: [endColor(classes, '', 'from'), endColor(classes, '', 'to')],
  dark: [endColor(classes, 'dark:', 'from'), endColor(classes, 'dark:', 'to')],
})

/**
 * A class list's one colour class for a variant: `bg-white` → `white` for `bg-`, `dark:bg-gray-900` → `gray-900`.
 * Only colour shapes count, so `bg-gradient-to-r` or `text-2xl` is not read as a colour.
 */
function colorToken(classes: string[], head: string): string {
  const shape = new RegExp(`^${head}(?:white|black|[a-z]+-\\d{2,3})$`)
  const hits = classes.filter((c) => shape.test(c)).map((c) => c.slice(head.length))
  if (hits.length !== 1) throw new Error(`${head}…: found ${hits.length}, expected exactly 1`)
  return hits[0]!
}

const themeCss = () => readFileSync(THEME_CSS, 'utf8')

/** A Tailwind colour token's value in the installed theme.css (`white` → `#fff`), as #rrggbb. */
function themeColor(token: string): string {
  const m = new RegExp(`--color-${token}:\\s*([^;]+);`).exec(themeCss())
  if (!m) throw new Error(`theme.css: no --color-${token}`)
  return parseCssColor(m[1]!)
}

/** The root `<div>`, which paints the page behind the header: the one with `min-h-screen`. */
function rootDivClasses(text: string): string[] {
  const all = Array.from(text.matchAll(/<div\s+className="([^"]*\bmin-h-screen\b[^"]*)"/g))
  if (all.length !== 1) throw new Error(`AppShell.tsx: expected one min-h-screen <div>, found ${all.length}`)
  return classList(all[0]![1]!)
}

/** Every element with static classes between the root `<div>` and the title: the header and its wrappers. */
function elementsBetweenRootAndTitle(text: string): { tag: string; classes: string[] }[] {
  const start = text.search(/<div\s+className="[^"]*\bmin-h-screen\b/)
  const end = text.indexOf('<h1', start)
  const inner = text.slice(text.indexOf('>', start) + 1, end)
  return Array.from(inner.matchAll(/<(\w+)\s[^>]*?className="([^"]*)"/g)).map((m) => ({ tag: m[1]!, classes: classList(m[2]!) }))
}

/** What the gradient string may carry (R5): the gradient, its `dark:` ends, and the fallbacks. Nothing else. */
const ALLOWED = [
  /^bg-gradient-to-r$/,
  /^(?:dark:)?(?:from|to)-\[#[0-9a-f]{6}\]$/i,
  /^bg-clip-text$/,
  /^text-transparent$/,
  /^(?:print|contrast-more):bg-none$/,
  /^(?:print|dark:print|contrast-more|dark:contrast-more):text-[a-z]+-\d{2,3}$/,
]

/** A font-size class's size in px: `text-2xl` through the installed theme.css, or an arbitrary `text-[1.75rem]`. */
function fontSizePx(cls: string): number {
  const util = cls.slice(cls.lastIndexOf(':') + 1)
  const arbitrary = /^text-\[([\d.]+)(rem|px)\]$/.exec(util)
  if (arbitrary) return Number(arbitrary[1]) * (arbitrary[2] === 'rem' ? 16 : 1)
  const m = new RegExp(`--text-${util.slice('text-'.length)}:\\s*([\\d.]+)rem;`).exec(themeCss())
  if (!m) throw new Error(`theme.css: no size for ${cls}`)
  return Number(m[1]) * 16
}
const isFontSize = (cls: string) =>
  /^text-(?:xs|sm|base|lg|\d?xl|\[[\d.]+(?:rem|px)\])$/.test(cls.slice(cls.lastIndexOf(':') + 1))

// ---- The guard --------------------------------------------------------------------------------------------------

describe("the header's SPERT® Forecaster: a gradient in Forecaster's blue, readable in both themes (HDR26)", () => {
  describe('instrument self-checks', () => {
    it('the contrast formula: #767676 on white is 4.54 : 1', () => {
      expect(trunc(contrast('#767676', '#ffffff'))).toBe('4.54')
    })

    it('the OKLCH steps rebuild the suite\'s old blue gradient from #0070f3, with its hue turns', () => {
      // As Appendix A writes it. Algebraically this is a round trip of #0099ff and #0051cc through OKLCH and the
      // gamut fit, so it checks those conversions, not the steps themselves.
      const [p, g1, g2] = ['#0070f3', '#0099ff', '#0051cc'].map(toLch) as [Triple, Triple, Triple]
      const stepOf = (g: Triple): Triple => [g[0] - p[0], g[1] / p[1], g[2] - p[2]]
      const withTurn = (fav: string, d: Triple) => {
        const [lk, c, h] = toLch(fav)
        return fromLch([lk + d[0], c * d[1], h + d[2]])
      }
      expect(withTurn('#0070f3', stepOf(g1))).toBe('#0099ff')
      expect(withTurn('#0070f3', stepOf(g2))).toBe('#0051cc')
    })

    it("parseCssColor reads Tailwind's #fff and 'none'-hue forms, and refuses what it cannot read", () => {
      expect(parseCssColor('#fff')).toBe('#ffffff')
      expect(parseCssColor('oklch(98.5% 0 none)')).toBe('#fafafa')
      expect(parseCssColor('oklch(27.8% 0.033 256.848)')).toBe('#1e2939')
      expect(() => parseCssColor('rgb(1, 2, 3)')).toThrow(/unreadable/)
    })

    it('the ramp sampler fails a known-bad: the old blue gradient is 2.99 : 1 on white and 2.57 on gray-900', () => {
      // Vacuity control: a sampler that always passed would pass every row below.
      expect(trunc(weakest('#0099ff', '#0051cc', '#ffffff', 'oklab'))).toBe('2.99')
      expect(trunc(weakest('#0099ff', '#0051cc', '#101828', 'oklab'))).toBe('2.57')
    })
  })

  it('the title has exactly two gradient spans, SPERT and Forecaster, with no space inside either', () => {
    // Must-find, and the census: a reader that found nothing would pass every row below.
    const spans = gradientSpans(source())
    expect(spans.map((s) => s.text)).toEqual(['SPERT', 'Forecaster'])
    expect(spans).toHaveLength(GRADIENT_SPANS)
  })

  it("the space before Forecaster is the <h1>'s own text, between the ® and the second gradient span", () => {
    // HDR26 ruling F1: inside a span, jsdom's accessible-name computation trims a leading space. On the bold <h1>
    // the space also keeps the width it had inside the old bold span (ruling F-FC2).
    expect(title(source()).inner).toMatch(/>®<\/span>\{' '\}<span className=(?:\{\w+\}|"[^"]*")>Forecaster<\/span>/)
  })

  it('the weight is the <h1>\'s, and the title is large text at every width: bold, and never under 24 px', () => {
    const { classes } = title(source())
    expect(classes).toContain('font-bold')
    const sizes = classes.filter(isFontSize)
    expect(sizes, 'the <h1> has no font-size class').toContain('text-2xl')
    for (const cls of sizes) expect(fontSizePx(cls), cls).toBeGreaterThanOrEqual(LARGE_PX)
  })

  it('both gradient spans carry the same four end colours', () => {
    const [first, ...rest] = gradientSpans(source()).map((s) => endsOf(s.classes))
    expect(first).toBeDefined()
    for (const other of rest) expect(other).toEqual(first)
  })

  it('the gradient string carries only the gradient and its fallbacks: no size, weight or other class (R5)', () => {
    for (const span of gradientSpans(source())) {
      const stray = span.classes.filter((c) => !ALLOWED.some((re) => re.test(c)))
      expect(stray, `${span.text}: classes outside the gradient string's list`).toEqual([])
      expect(span.classes).toEqual(expect.arrayContaining(['bg-gradient-to-r', 'bg-clip-text', 'text-transparent']))
    }
  })

  it("the root <div>'s background resolves, through the installed Tailwind, to the pinned premise in each theme", () => {
    const root = rootDivClasses(source())
    expect(themeColor(colorToken(root, 'bg-'))).toBe(PREMISE.light)
    expect(themeColor(colorToken(root, 'dark:bg-'))).toBe(PREMISE.dark)
  })

  it('nothing between the root <div> and the title paints a ground of its own or fades it', () => {
    // The root <div> is the title's ground only while nothing in between has a background, and a fade would sink
    // a ramp that clears the bar by hundredths.
    const between = elementsBetweenRootAndTitle(source())
    expect(between.map((e) => e.tag), 'must-find: the <header> lies between them').toContain('header')
    const stray = between.flatMap((e) => e.classes).filter((c) => /(?:^|:)(?:bg-|opacity-)/.test(c) || c.startsWith('hover:'))
    expect(stray).toEqual([])
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: every point of the ramp meets ${BAR} : 1 on the root <div>, in Oklab and in sRGB`, () => {
      for (const span of gradientSpans(source())) {
        const [from, to] = endsOf(span.classes)[theme]
        for (const space of ['oklab', 'srgb'] as const) {
          const w = weakest(from, to, PREMISE[theme], space)
          expect(w, `${span.text} ${theme} ${from} → ${to} on ${PREMISE[theme]} (${space}): ${trunc(w)}`)
            .toBeGreaterThanOrEqual(BAR)
        }
      }
    })
  }

  it('falls back to solid near-black in print and under prefers-contrast: more, near-white in dark', () => {
    for (const span of gradientSpans(source())) {
      expect(span.classes, span.text).toEqual(
        expect.arrayContaining([
          'print:bg-none',
          `print:text-${NEAR_BLACK}`,
          'contrast-more:bg-none',
          `contrast-more:text-${NEAR_BLACK}`,
          `dark:contrast-more:text-${NEAR_WHITE}`,
        ]),
      )
    }
  })

  it('a dark-mode print from a system set to more contrast stays near-black: dark:print: is present', () => {
    // ⚠️ This app's dark variant is `&:is(.dark *)`, so every `dark:` class weighs one class more than a plain one,
    // and `dark:contrast-more:` would beat `print:` in a dark-mode print, putting near-white on paper (HDR26 F-FC1).
    // `dark:print:` ties it and is emitted later. The variant is pinned as this test's premise: if it changes,
    // re-check whether the class is still needed (under `:where(…)` it would be harmless, not required).
    expect(readFileSync(GLOBALS_CSS, 'utf8')).toMatch(/@custom-variant dark \(&:is\(\.dark \*\)\);/)
    for (const span of gradientSpans(source())) expect(span.classes, span.text).toContain(`dark:print:text-${NEAR_BLACK}`)
  })

  it('the solid colours meet the bar on the root <div> too', () => {
    expect(contrast(themeColor(NEAR_BLACK), PREMISE.light)).toBeGreaterThanOrEqual(BAR)
    expect(contrast(themeColor(NEAR_WHITE), PREMISE.dark)).toBeGreaterThanOrEqual(BAR)
  })
})
