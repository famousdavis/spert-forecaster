// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The header account chip's colours (v0.51.2, FRAME26 FC-2, FC-3, FC-4).
//
// jsdom has no paint, so this file cannot measure contrast. The ratios were measured in headless
// Chrome and are recorded in the PR. Before v0.51.2:
// - "Local only" was gray-400 in both themes: 2.60 on white, and 3.96 on the dark hover ground.
// - "Sign in" was an INLINE #0070f3. An inline colour beats every dark: and hover class, so no class
//   on that span could have applied: 3.90 in dark, 4.36 on the light hover ground, 2.26 on the dark.
// - The lock glyph stroked a fixed #9CA3AF: 2.54 on white, under 3:1 for a glyph carrying state.
// What a test can pin is that each colour comes from classes the theme can reach, with no inline
// colour to override them.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const H = vi.hoisted(() => ({
  user: null as { uid: string; email: string; displayName: string } | null,
  mode: 'local' as 'local' | 'cloud',
}))
vi.mock('@/shared/providers/AuthProvider', () => ({ useAuth: () => ({ user: H.user }) }))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: H.mode }) }))

import { UserMenu } from './UserMenu'

afterEach(() => cleanup())

const SIGNED_IN = { uid: 'u1', email: 'ada@example.com', displayName: 'Ada Lovelace' }

function renderChip(user: typeof SIGNED_IN | null, mode: 'local' | 'cloud') {
  H.user = user
  H.mode = mode
  return render(<UserMenu onRequestOpen={() => {}} />)
}

const classesOf = (el: Element) => new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean))
const missing = (el: Element, want: string[]) => want.filter((c) => !classesOf(el).has(c))

describe('UserMenu chip colours are reachable by the theme', () => {
  it('the signed-out button is the hover group its labels step on', () => {
    renderChip(null, 'local')
    expect(classesOf(screen.getByRole('button', { name: 'Sign in' })).has('group')).toBe(true)
  })

  it('FC-2: "Local only" has a light colour, a dark colour and a dark hover step, none inline', () => {
    renderChip(null, 'local')
    const label = screen.getByText('Local only')
    expect(missing(label, ['text-gray-500', 'dark:text-gray-400', 'dark:group-hover:text-gray-300'])).toEqual([])
    expect(label.style.color).toBe('')
  })

  it('FC-3: "Sign in" takes every colour from a class, never an inline style', () => {
    renderChip(null, 'local')
    const label = screen.getByText('Sign in')
    expect(missing(label, [
      'text-spert-blue',
      'group-hover:text-blue-600',
      'dark:text-blue-400',
      'dark:group-hover:text-blue-300',
    ])).toEqual([])
    // The load-bearing half: an inline colour would silently win over all four.
    expect(label.style.color).toBe('')
    // Non-colour inline properties are kept.
    expect([label.style.fontSize, label.style.fontWeight]).toEqual(['12px', '500'])
  })

  it.each([
    ['signed out', null, 'local'],
    ['signed in, local storage', SIGNED_IN, 'local'],
  ] as const)('FC-4: the lock glyph strokes currentColor with themed classes (%s)', (_s, user, mode) => {
    const { container } = renderChip(user, mode)
    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const svg = svgs[0]
    const strokes = [...svg.querySelectorAll('[stroke]')].map((n) => n.getAttribute('stroke'))
    expect(strokes).toEqual(['currentColor', 'currentColor'])
    expect(missing(svg, ['text-gray-500', 'dark:text-gray-400'])).toEqual([])
  })
})
