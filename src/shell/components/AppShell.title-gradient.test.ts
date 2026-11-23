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
 * Re-pinned on purpose at v0.52.0 (FRAME26, Orch-FRAME-1's D5), when the title moved onto the SPERT® Suite frame: the
 * frame's `.sf-grad` draws each word, the ramps are `--app-grad-light` / `--app-grad-dark` in `globals.css`, and the
 * ground is the frame's `--sf-page`. The ends, the ramps and the bar are HDR26's, unchanged; the premises now come from
 * the frame's files, so a change to any of them turns this red. The solid fallbacks are the frame's too: its heading
 * colour under `prefers-contrast: more` (one colour for every app), and black in print.
 *
 * ⚠️ jsdom has no paint, so nothing here is measured from a render: the end colours are read from `globals.css`, the
 * ground and the title's size from the vendored `spert-frame.css`, the census from `AppHeader.tsx`, and the contrast
 * is computed here from the WCAG 2.x definition. The rendered page is measured in headless Chrome by frame-check. The
 * colour maths is the HDR26 plan's Appendix A, typed; it is copied, not shared.
 *
 * The bar is 3 : 1, at every point of each ramp, because the title is large text: 24 px bold (pinned below). Both
 * ramps clear the bar by a few hundredths, on purpose: the pinned ground below is what catches a change that would
 * sink them.
 */
const APP_HEADER = join(import.meta.dirname, 'AppHeader.tsx')
const APP_SHELL = join(import.meta.dirname, 'AppShell.tsx')
const GLOBALS_CSS = join(import.meta.dirname, '..', '..', 'app', 'globals.css')
const FRAME_CSS = join(import.meta.dirname, '..', '..', 'styles', 'spert-frame.css')

const BAR = 3
/** The frame's page ground in each theme (`--sf-page`), painted by the app root and by the brand row. */
const PREMISE = { light: '#ffffff', dark: '#101828' } as const
/** HDR26's measured ends (v0.51.1), unchanged by the move onto the frame. A change needs a new measurement. */
const ENDS = { light: ['#4a93ff', '#0056bf'], dark: ['#5f9fff', '#0060d2'] } as const
/** "SPERT" and "Forecaster": one gradient per word, with the ® between them. */
const GRADIENT_SPANS = 2
/** Large text at 3 : 1 needs at least 24 px, or 18.66 px bold; the title is both. */
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

const read = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const frameCss = () => read(FRAME_CSS)

/** The frame's stylesheet in three parts: the base rules, the `prefers-contrast: more` block, the print block. */
function frameParts() {
  const [base, rest = ''] = frameCss().split('@media (prefers-contrast: more)')
  const [more, print = ''] = rest.split('@media print')
  return { base, more, print }
}

/** The declarations of the one rule whose whole selector is `selector` in `css`. Exactly one, or it fails. */
function rule(css: string, selector: string): string {
  const hits = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter((m) => m[1]!.trim() === selector)
  if (hits.length !== 1) throw new Error(`spert-frame.css: expected one rule ${selector}, found ${hits.length}`)
  return hits[0]![2]!
}

/** A custom property's value inside one rule: `--sf-page: #ffffff;` → `#ffffff`. */
function decl(body: string, name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body)
  if (!m) throw new Error(`no ${name}`)
  return m[1]!.trim()
}

/** The two ramps in globals.css: exactly one declaration of each, `linear-gradient(to right in oklab, A, B)`. */
function ramps(): { light: [string, string]; dark: [string, string] } {
  const css = read(GLOBALS_CSS)
  const one = (theme: 'light' | 'dark'): [string, string] => {
    const all = Array.from(css.matchAll(new RegExp(`--app-grad-${theme}\\s*:\\s*([^;]+);`, 'g')))
    if (all.length !== 1) throw new Error(`globals.css: expected one --app-grad-${theme}, found ${all.length}`)
    const m = /^linear-gradient\(to right in oklab,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i.exec(all[0]![1]!.trim())
    if (!m) throw new Error(`--app-grad-${theme} is not a two-stop "to right in oklab" gradient: ${all[0]![1]}`)
    return [m[1]!.toLowerCase(), m[2]!.toLowerCase()]
  }
  return { light: one('light'), dark: one('dark') }
}

/** The title in AppHeader.tsx: the inner markup of `span.sf-title[data-sf=title]`. Exactly one, or it fails. */
function titleInner(): string {
  const all = Array.from(read(APP_HEADER).matchAll(/<span className="sf-title" data-sf="title">([\s\S]*?)<\/span>\s*<\/Link>/g))
  if (all.length !== 1) throw new Error(`AppHeader.tsx: expected one [data-sf=title], found ${all.length}`)
  return all[0]![1]!
}

/** The title's spans with their literal classes; any other class form fails loudly (a class the guard cannot read). */
function titleSpans(): { classes: string[]; text: string }[] {
  return Array.from(titleInner().matchAll(/<span\b([^>]*)>([^<]*)<\/span>/g)).map((m) => {
    const literal = /^\s*className="([^"]*)"\s*$/.exec(m[1]!)
    if (!literal) throw new Error(`AppHeader.tsx: a title <span> whose classes cannot be read: <span ${m[1]}>`)
    return { classes: literal[1]!.split(/\s+/).filter(Boolean), text: m[2]! }
  })
}
const gradientSpans = () => titleSpans().filter((s) => s.classes.includes('sf-grad'))

// ---- The guard --------------------------------------------------------------------------------------------------

describe("the header's SPERT® Forecaster: a gradient in Forecaster's blue, readable in both themes (HDR26, on the frame)", () => {
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

    it('the CSS readers find what they read, and refuse a gradient they cannot parse (the readers are not silently empty)', () => {
      // Must-find: a reader that found nothing would pass every row below.
      const { base, more, print } = frameParts()
      expect([base.length > 1000, more.includes('.sf-grad'), print.includes('.sf-grad')]).toEqual([true, true, true])
      expect(rule(base, '.sf-title')).toMatch(/font:/)
      expect(() => rule(base, '.sf-nope')).toThrow(/found 0/)
      expect(titleSpans().length).toBeGreaterThanOrEqual(3)
    })

    it('the ramp sampler fails a known-bad: the old blue gradient is 2.99 : 1 on white and 2.57 on gray-900', () => {
      // Vacuity control: a sampler that always passed would pass every row below.
      expect(trunc(weakest('#0099ff', '#0051cc', '#ffffff', 'oklab'))).toBe('2.99')
      expect(trunc(weakest('#0099ff', '#0051cc', '#101828', 'oklab'))).toBe('2.57')
    })
  })

  it('the title has exactly two gradient spans, SPERT and Forecaster, with no space inside either', () => {
    const spans = gradientSpans()
    expect(spans.map((s) => s.text)).toEqual(['SPERT', 'Forecaster'])
    expect(spans).toHaveLength(GRADIENT_SPANS)
    for (const s of spans) expect(s.classes, s.text).toEqual(['sf-grad'])
  })

  it("the space before Forecaster is the title's own text, between the ® mark and the second gradient span", () => {
    // HDR26 ruling F1: inside a span, jsdom's accessible-name computation trims a leading space.
    expect(titleInner().trim()).toMatch(/^<span className="sf-grad">SPERT<\/span><span className="sf-mark">®<\/span>\{' '\}<span className="sf-grad">Forecaster<\/span>$/)
  })

  it('the title is large text: the frame sets it bold (700) at 24 px', () => {
    const font = /font:\s*(\d{3})\s+([\d.]+)px\//.exec(rule(frameParts().base, '.sf-title'))
    expect(font, 'the .sf-title font shorthand').not.toBeNull()
    expect(Number(font![1])).toBe(700)
    expect(Number(font![2])).toBeGreaterThanOrEqual(LARGE_PX)
  })

  it('the ramps are HDR26\'s ends, one declaration each, interpolated in Oklab as bg-gradient-to-r did', () => {
    expect(ramps()).toEqual(ENDS)
  })

  it('.sf-grad draws --app-grad-light, and --app-grad-dark under the dark key, clipped to the text', () => {
    const { base } = frameParts()
    const grad = rule(base, '.sf-grad')
    expect(grad).toMatch(/background-image:\s*var\(--app-grad-light\)/)
    expect(grad).toMatch(/background-clip:\s*text/)
    expect(grad).toMatch(/-webkit-text-fill-color:\s*transparent/)
    expect(rule(base, ':root.dark .sf-grad, :root[data-theme="dark"] .sf-grad')).toMatch(/background-image:\s*var\(--app-grad-dark\)/)
  })

  it('the ground premise: --sf-page is #ffffff / #101828, and the app root and the brand row paint it', () => {
    const { base } = frameParts()
    expect(decl(rule(base, ':root'), '--sf-page')).toBe(PREMISE.light)
    expect(decl(rule(base, ':root.dark, :root[data-theme="dark"]'), '--sf-page')).toBe(PREMISE.dark)
    expect(rule(base, '.sf-app')).toMatch(/background:\s*var\(--sf-page\)/)
    expect(rule(base, '.sf-bar')).toMatch(/background:\s*var\(--sf-page\)/)
    // AppShell's root is the frame's app root and nothing else: no ground of its own.
    expect(read(APP_SHELL)).toMatch(/^\s*<div className="sf-app" data-sf="app">$/m)
  })

  it('nothing between the brand row and the title paints a ground of its own or fades it', () => {
    // The brand row is the title's ground only while nothing in between has a background, and a fade would sink a
    // ramp that clears the bar by hundredths. In the markup: the header, the column, the row, the brand link.
    const src = read(APP_HEADER)
    const between = src.slice(src.indexOf('<header'), src.indexOf('data-sf="title"'))
    const classes = Array.from(between.matchAll(/className="([^"]*)"/g)).flatMap((m) => m[1]!.split(/\s+/))
    expect(classes, 'must-find: the brand link').toContain('sf-brand')
    expect(classes.filter((c) => /(?:^|:)(?:bg-|opacity-)/.test(c) || c.startsWith('hover:'))).toEqual([])
    // In the stylesheet: the column, the row and the brand set no background or opacity.
    const { base } = frameParts()
    for (const sel of ['.sf-col', '.sf-bar-row', '.sf-brand']) expect(rule(base, sel), sel).not.toMatch(/background|opacity/)
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: every point of the ramp meets ${BAR} : 1 on the page ground, in Oklab and in sRGB`, () => {
      const [from, to] = ramps()[theme]
      for (const space of ['oklab', 'srgb'] as const) {
        const w = weakest(from, to, PREMISE[theme], space)
        expect(w, `${theme} ${from} → ${to} on ${PREMISE[theme]} (${space}): ${trunc(w)}`).toBeGreaterThanOrEqual(BAR)
      }
    })
  }

  it('falls back to the frame\'s solid heading colour under prefers-contrast: more, and to black in print', () => {
    const { more, print } = frameParts()
    const m = rule(more, '.sf-grad')
    expect(m).toMatch(/background-image:\s*none\s*!important/)
    expect(m).toMatch(/color:\s*var\(--sf-heading\)\s*!important/)
    const p = rule(print, '.sf-grad')
    expect(p).toMatch(/background-image:\s*none\s*!important/)
    expect(p).toMatch(/color:\s*#000\s*!important/)
  })

  it('the solid colours meet the bar on the page ground too: 12.63 light, 14.39 dark (truncated, as HDR26 reads), 21 in print', () => {
    const { base } = frameParts()
    const heading = { light: decl(rule(base, ':root'), '--sf-heading'), dark: decl(rule(base, ':root.dark, :root[data-theme="dark"]'), '--sf-heading') }
    expect([trunc(contrast(heading.light, PREMISE.light)), trunc(contrast(heading.dark, PREMISE.dark))]).toEqual(['12.63', '14.39'])
    expect(contrast('#000000', '#ffffff')).toBeGreaterThanOrEqual(BAR)
  })

  it('the header holds no heading: the page\'s one h1 is the heading row\'s (contract §2)', () => {
    expect(read(APP_HEADER)).not.toMatch(/<h[1-6]\b|role="heading"/)
  })
})
