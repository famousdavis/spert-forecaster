// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// For tests only (never imported by the app): the SPERT® Suite frame's colour tokens and rules, read from the
// vendored stylesheet itself (src/styles/spert-frame.css), so a test measures the values the app ships, not a copy.
// jsdom has no paint and no :hover, so the tests that hold the frame's contrast facts read the token each element
// takes and compute WCAG 2 contrast from it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const FRAME_CSS_PATH = join(import.meta.dirname, 'spert-frame.css')
const CSS = readFileSync(FRAME_CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const [BASE, AFTER_MORE = ''] = CSS.split('@media (prefers-contrast: more)')
const MORE = AFTER_MORE.split('@media print')[0]

export type Theme = 'light' | 'dark'

/** The declarations of the first rule whose whole selector is `selector`, in the base (not the media) part. */
export function frameRule(selector: string, part: 'base' | 'more' = 'base'): string {
  for (const m of (part === 'base' ? BASE : MORE).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim() === selector) return m[2]
  }
  throw new Error(`no rule ${selector} in the vendored stylesheet (${part})`)
}

function tokens(body: string): Map<string, string> {
  return new Map([...body.matchAll(/(--sf-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const LIGHT = tokens(frameRule(':root'))
const DARK = tokens(frameRule(':root.dark, :root[data-theme="dark"]'))
const MORE_LIGHT = tokens(frameRule(':root', 'more'))
const MORE_DARK = tokens(frameRule(':root.dark, :root[data-theme="dark"]', 'more'))

/** A token's value as the app resolves it: dark overrides light, and `prefers-contrast: more` overrides both. */
export function frameToken(name: string, theme: Theme, contrast: 'no-preference' | 'more' = 'no-preference'): string {
  let v = theme === 'dark' ? DARK.get(name) ?? LIGHT.get(name) : LIGHT.get(name)
  if (contrast === 'more') v = (theme === 'dark' ? MORE_DARK.get(name) ?? MORE_LIGHT.get(name) : MORE_LIGHT.get(name)) ?? v
  if (!v) throw new Error(`no token ${name} (${theme}, ${contrast})`)
  return v
}

/** The custom property a rule's `property` reads: `color: var(--sf-link)` → `--sf-link`. */
export function readsToken(selector: string, property: string): string | null {
  const m = frameRule(selector).match(new RegExp(`(?:^|[;\\s{])${property}\\s*:\\s*var\\((--sf-[\\w-]+)\\)`))
  return m ? m[1] : null
}

const lin = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (h: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(h)) throw new Error(`not #rrggbb: ${h}`)
  const [r, g, b] = [1, 3, 5].map((i) => lin(Number.parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG 2 contrast ratio of two #rrggbb colours, rounded to hundredths. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100
}

/** A Tailwind colour from the installed `theme.css` (`--color-gray-900: oklch(…)`), as #rrggbb. */
export function tailwindColour(name: string): string {
  const theme = readFileSync(join(import.meta.dirname, '..', '..', 'node_modules', 'tailwindcss', 'theme.css'), 'utf8')
  const m = theme.match(new RegExp(`--color-${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`no --color-${name} in tailwindcss/theme.css`)
  const v = m[1].trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  const o = v.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\s*\)$/)
  if (!o) throw new Error(`cannot read ${v}`)
  const L = Number(o[1]) / 100, C = Number(o[2]), h = o[3] === 'none' ? 0 : (Number(o[3]) * Math.PI) / 180
  const [a, b] = [C * Math.cos(h), C * Math.sin(h)]
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m2 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m2 + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m2 - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m2 + 1.707614701 * s]
  const gam = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)))
  return '#' + rgb.map((x) => gam(x).toString(16).padStart(2, '0')).join('')
}
