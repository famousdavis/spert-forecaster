// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The header's account chip and Connect AI: the SPERT® Suite frame's colours since v0.52.0 (FRAME26), stage 0's
// classes before (v0.51.2, FC-2, FC-3, FC-4).
//
// The facts this file holds are stage 0's, unchanged: "Local only" and "Sign in" reach 4.5 : 1 and the lock glyph
// 3 : 1, at rest and on the chip's hover ground, in both themes. Before v0.51.2, "Local only" was gray-400 (2.60 on
// white, 3.96 on the dark hover ground), "Sign in" an INLINE #0070f3 (3.90 dark, 2.26 on the dark hover ground) and
// the lock a fixed #9CA3AF (2.54). Since v0.52.0 the chip is the frame's `.sf-chip`: the state segment draws in the
// muted token, the action segment in the link token, and the hover ground is `--sf-hover`, all set by the vendored
// stylesheet, which is unlayered. jsdom has no paint and no :hover, so the ratios are computed from the token values
// the vendored file ships; what the DOM must show is that each text takes them, with no colour of its own.
//
// Connect AI (contract §4 and §5, Orch-FRAME-1's D4): 13 / 18 text in the frame's muted token at rest and its text
// token on hover. Until v0.52.0 it was 12 px gray-400 / gray-500, 2.60 and 3.67 : 1.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
import { contrast, frameToken, readsToken, tailwindColour, type Theme } from '@/styles/frame-tokens.testkit'

const H = vi.hoisted(() => ({
  user: null as { uid: string; email: string; displayName: string } | null,
  mode: 'local' as 'local' | 'cloud',
}))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: H.user }) }))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: H.mode }) }))

import { UserMenu } from './UserMenu'
import { CONNECT_AI_AT_REST } from '@/features/connect-ai/components/ConnectAiLauncher'

afterEach(() => cleanup())

const SIGNED_IN = { uid: 'u1', email: 'ada@example.com', displayName: 'Ada Lovelace' }
const THEMES: Theme[] = ['light', 'dark']

function renderChip(user: typeof SIGNED_IN | null, mode: 'local' | 'cloud') {
  H.user = user
  H.mode = mode
  render(<UserMenu onRequestOpen={() => {}} />)
  const chip = screen.getByRole('button')
  return { chip, state: chip.querySelector(':scope > .sf-chip-state')!, act: chip.querySelector(':scope > .sf-chip-act')! }
}

/** The grounds the chip sits on: the page at rest, `.sf-chip:hover`'s token on hover. */
const grounds = (theme: Theme) => ({ rest: frameToken('--sf-page', theme), hover: frameToken(readsToken('.sf-chip:hover', 'background')!, theme) })
/** Contrast of a token on both grounds, in every theme and in prefers-contrast: more. */
const worst = (token: string) =>
  Math.min(...THEMES.flatMap((t) => (['no-preference', 'more'] as const).flatMap((c) => {
    const fg = frameToken(token, t, c)
    return [contrast(fg, frameToken('--sf-page', t, c)), contrast(fg, frameToken(readsToken('.sf-chip:hover', 'background')!, t, c))]
  })))

const STATES = [
  ['signed out', null, 'local'],
  ['signed in, local storage', SIGNED_IN, 'local'],
  ['signed in, cloud storage', SIGNED_IN, 'cloud'],
] as const

describe('the account chip is the frame’s chip', () => {
  it.each(STATES)('%s: .sf-chip with its hook, a state segment and an action segment, and no colour of its own', (_s, user, mode) => {
    const { chip, state, act } = renderChip(user, mode)
    expect([chip.className, chip.getAttribute('data-sf'), !!state, !!act]).toEqual(['sf-chip', 'chip', true, true])
    // No inline style anywhere in the chip except the avatar's fill (its white initial measures 4.55 : 1).
    const styled = [...chip.querySelectorAll<HTMLElement>('[style]')].map((e) => e.getAttribute('style'))
    expect(styled).toEqual(user ? ['background-color: rgb(0, 112, 243);'] : [])
    // No colour, ground or hover utility on the chip or its two segments: the stylesheet's tokens are their colours.
    for (const el of [chip, state, act]) expect((el.getAttribute('class') ?? '').split(/\s+/).filter((c) => /(^|:)(text|bg|border)-/.test(c)), el.className).toEqual([])
  })

  it('the stylesheet maps the segments to the muted and the link tokens, and the hover ground to --sf-hover', () => {
    expect([readsToken('.sf-chip-state', 'color'), readsToken('.sf-chip-act', 'color'), readsToken('.sf-chip:hover', 'background')]).toEqual(['--sf-text-muted', '--sf-link', '--sf-hover'])
  })
})

describe('the chip’s contrast facts (stage 0’s, through the frame’s tokens)', () => {
  it('"Local only" (state segment, muted) and "Sign in" (action segment, link) take their segment’s colour', () => {
    const { state, act } = renderChip(null, 'local')
    const localOnly = screen.getByText('Local only')
    expect([state.contains(localOnly), localOnly.getAttribute('class')]).toEqual([true, null])
    expect([act.textContent, act.children.length]).toEqual(['Sign in', 0])
  })

  it('"Local only" reaches 4.5 : 1 at rest and on hover, light and dark, and with more contrast (4.63 at worst)', () => {
    expect(worst('--sf-text-muted')).toBeGreaterThanOrEqual(4.5)
    expect(THEMES.map((t) => [contrast(frameToken('--sf-text-muted', t), grounds(t).rest), contrast(frameToken('--sf-text-muted', t), grounds(t).hover)])).toEqual([[4.84, 4.63], [6.82, 5.64]])
  })

  it('"Sign in" reaches 4.5 : 1 at rest and on hover, light and dark, and with more contrast (5.02 at worst)', () => {
    expect(worst('--sf-link')).toBeGreaterThanOrEqual(4.5)
    expect(THEMES.map((t) => [contrast(frameToken('--sf-link', t), grounds(t).rest), contrast(frameToken('--sf-link', t), grounds(t).hover)])).toEqual([[5.25, 5.02], [6.73, 5.56]])
  })

  it.each([['signed out', null], ['signed in, local storage', SIGNED_IN]] as const)('the lock (%s) strokes currentColor in the muted token: 3 : 1 at rest and on hover', (_s, user) => {
    const { chip, state, act } = renderChip(user, 'local')
    const svgs = chip.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const svg = svgs[0]
    expect([...svg.querySelectorAll('[stroke]')].map((n) => n.getAttribute('stroke'))).toEqual(['currentColor', 'currentColor'])
    // Signed out it inherits the state segment's muted colour; signed in it sits in the action segment and names the
    // muted token itself (Tailwind's `text-(--sf-text-muted)` writes `color: var(--sf-text-muted)`).
    if (user) expect([act.contains(svg), svg.getAttribute('class')]).toEqual([true, 'text-(--sf-text-muted)'])
    else expect([state.contains(svg), svg.getAttribute('class')]).toEqual([true, null])
    expect(worst('--sf-text-muted')).toBeGreaterThanOrEqual(3)
  })

  it('the cloud icon (signed in, cloud storage) fills currentColor in the action segment: the link token, 3 : 1 and more', () => {
    const { chip, act } = renderChip(SIGNED_IN, 'cloud')
    const svg = chip.querySelector('svg')!
    expect([act.contains(svg), [...svg.querySelectorAll('[fill]')].map((n) => n.getAttribute('fill'))]).toEqual([true, ['currentColor']])
    expect(worst('--sf-link')).toBeGreaterThanOrEqual(3)
  })

  it('the signed-in name keeps its own near-black / near-white, 4.5 : 1 on both grounds', () => {
    renderChip(SIGNED_IN, 'local')
    expect(screen.getByText('Ada').getAttribute('class')).toBe('font-medium text-gray-900 dark:text-gray-100')
    const pairs = [[tailwindColour('gray-900'), 'light'], [tailwindColour('gray-100'), 'dark']] as const
    for (const [fg, t] of pairs) for (const g of Object.values(grounds(t))) expect(contrast(fg, g), `${t} ${fg} on ${g}`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('Connect AI in the utilities (contract §4 and §5)', () => {
  const SOURCE = readFileSync(join(import.meta.dirname, '..', '..', 'connect-ai', 'components', 'ConnectAiLauncher.tsx'), 'utf8')

  it('at rest it reads the muted token and on hover the text token: tokens, never fixed colours', () => {
    expect(CONNECT_AI_AT_REST).toBe('text-(--sf-text-muted) hover:text-(--sf-text)')
    expect(SOURCE).toMatch(/^\s*: CONNECT_AI_AT_REST$/m)
  })

  it.each(THEMES)('%s: its text reaches 4.5 : 1 at rest and on hover (the page ground), with more contrast too', (t) => {
    for (const c of ['no-preference', 'more'] as const) {
      expect(contrast(frameToken('--sf-text-muted', t, c), frameToken('--sf-page', t, c)), `rest ${c}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(frameToken('--sf-text', t, c), frameToken('--sf-page', t, c)), `hover ${c}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('its text is the frame’s 13 / 18 for the app’s text utilities, and so is "Connection failed"', () => {
    const sized = [...SOURCE.matchAll(/text-\[13px\] leading-\[18px\]/g)].length
    expect([sized, /\btext-xs\b/.test(SOURCE)]).toEqual([2, false])
  })
})
