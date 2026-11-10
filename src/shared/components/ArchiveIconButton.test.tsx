// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Archive and Unarchive (v0.50.0): the five shared icon buttons' base (IconButtons.test.tsx) with
// GanttApp's slate on hover and focus (`ArchiveIconButton.tsx` at d437e84: #475569 / #cbd5e1 on
// #f1f5f9 / rgba(148,163,184,.15), ring rgba(100,116,139,.5)). jsdom loads no Tailwind: the
// classes are pinned here, the colours were measured in a browser for the release. The expected
// tokens are written out, not imported from the style module.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ArchiveIconButton } from './ArchiveIconButton'

afterEach(() => cleanup())

const BASE = [
  'inline-flex', 'size-7', 'flex-none', 'items-center', 'justify-center', 'p-0', 'border-0', 'rounded-[6px]', 'cursor-pointer',
  'disabled:opacity-50', 'disabled:cursor-not-allowed', 'focus-visible:outline-2', 'focus-visible:outline-offset-2',
  'focus-visible:outline-[#0070f3]', 'dark:focus-visible:outline-[#60a5fa]',
]
const REST = ['bg-transparent', 'text-[#808080]', 'dark:text-[#9ca3af]']
const SLATE = ['hover', 'focus'].flatMap((s) => [
  `enabled:${s}:text-[#475569]`,
  `enabled:${s}:bg-[#f1f5f9]`,
  `enabled:${s}:shadow-[0_0_0_1.5px_rgba(100,116,139,0.5)]`,
  `dark:enabled:${s}:text-[#cbd5e1]`,
  `dark:enabled:${s}:bg-[rgba(148,163,184,0.15)]`,
])
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

describe.each(['archive', 'unarchive'] as const)('ArchiveIconButton %s', (variant) => {
  const label = variant === 'archive' ? 'Archive Alpha' : 'Unarchive Alpha'

  it('has the shared base, rests grey, and takes the slate on hover and focus in both themes', () => {
    render(<ArchiveIconButton variant={variant} onClick={vi.fn()} ariaLabel={label} title="t" />)
    const button = screen.getByRole('button', { name: label })
    expect(tokens(button)).toEqual(expect.arrayContaining([...BASE, ...REST, ...SLATE]))
    const svg = button.querySelector('svg')!
    expect([svg.getAttribute('width'), svg.getAttribute('height'), button.getAttribute('title')]).toEqual(['18', '18', 't'])
  })

  it('gates every hover and focus look on enabled:', () => {
    render(<ArchiveIconButton variant={variant} onClick={vi.fn()} ariaLabel={label} disabled />)
    const looks = tokens(screen.getByRole('button', { name: label })).filter((x) => /(^|:)(hover|focus):/.test(x))
    expect(looks.length).toBeGreaterThanOrEqual(10)
    expect(looks.filter((x) => !/^(dark:)?enabled:(hover|focus):/.test(x))).toEqual([])
  })

  it('falls back to a generic name only when given none', () => {
    render(<ArchiveIconButton variant={variant} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: variant === 'archive' ? 'Archive project' : 'Unarchive project' })).not.toBeNull()
  })
})

it('Archive and Unarchive draw different glyphs (the box with a bar; with an up arrow)', () => {
  render(<><ArchiveIconButton variant="archive" onClick={vi.fn()} ariaLabel="A" /><ArchiveIconButton variant="unarchive" onClick={vi.fn()} ariaLabel="U" /></>)
  const d = (name: string) => screen.getByRole('button', { name }).querySelector('path')!.getAttribute('d')
  expect([d('A')?.endsWith('M10 12h4'), d('U')?.endsWith('M12 18v-6M9 15l3-3 3 3')]).toEqual([true, true])
})
