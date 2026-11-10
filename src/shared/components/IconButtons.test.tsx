// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The five shared icon buttons, each rendered on its own (v0.48.2, D8 and D25). Share renders
// only for a cloud owner, so a guard written against a screen in local mode never sees it.
//
// jsdom loads no Tailwind, so these pin the CLASSES that carry the look, not the pixels: the
// 28 px box (`size-7`), the 18 px glyph, GanttApp's resting grey, each button's own hover and
// focus shade in both themes, the keyboard focus outline, and that every hover and focus look
// is `enabled:`-gated. The values themselves were measured in a browser for the release.
// The expected tokens are written out here, not imported, so a change to the shared style
// module cannot move the test with it.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'

import { TrashIconButton } from './TrashIconButton'
import { PencilIconButton } from './PencilIconButton'
import { ExportIconButton } from './ExportIconButton'
import { CloneIconButton } from './CloneIconButton'
import { ShareIconButton } from './ShareIconButton'

afterEach(() => cleanup())

interface Hue {
  light: string
  lightBg: string
  dark: string
  darkBg: string
  ring: string
}

interface Case {
  name: string
  label: string
  el: (props: { disabled?: boolean }) => ReactElement
  hue: Hue
}

const CASES: Case[] = [
  {
    name: 'Trash (Delete)',
    label: 'Delete Alpha',
    el: (p) => <TrashIconButton onClick={vi.fn()} ariaLabel="Delete Alpha" {...p} />,
    hue: { light: '#ef4444', lightBg: '#fef2f2', dark: '#f87171', darkBg: 'rgba(239,68,68,0.15)', ring: 'rgba(239,68,68,0.5)' },
  },
  {
    name: 'Pencil (Edit)',
    label: 'Edit Alpha',
    el: (p) => <PencilIconButton onClick={vi.fn()} ariaLabel="Edit Alpha" {...p} />,
    hue: { light: '#0070f3', lightBg: '#eff6ff', dark: '#60a5fa', darkBg: 'rgba(0,112,243,0.15)', ring: 'rgba(0,112,243,0.5)' },
  },
  {
    name: 'Export',
    label: 'Export Alpha',
    el: (p) => <ExportIconButton onClick={vi.fn()} ariaLabel="Export Alpha" {...p} />,
    hue: { light: '#047857', lightBg: '#ecfdf5', dark: '#34d399', darkBg: 'rgba(16,185,129,0.15)', ring: 'rgba(16,185,129,0.5)' },
  },
  {
    name: 'Clone',
    label: 'Clone Alpha',
    el: (p) => <CloneIconButton onClick={vi.fn()} ariaLabel="Clone Alpha" {...p} />,
    hue: { light: '#7c3aed', lightBg: '#f5f3ff', dark: '#a78bfa', darkBg: 'rgba(139,92,246,0.15)', ring: 'rgba(139,92,246,0.5)' },
  },
  {
    name: 'Share',
    label: 'Share project',
    el: (p) => <ShareIconButton onClick={vi.fn()} ariaLabel="Share project" {...p} />,
    hue: { light: '#0e7490', lightBg: '#ecfeff', dark: '#22d3ee', darkBg: 'rgba(6,182,212,0.15)', ring: 'rgba(6,182,212,0.5)' },
  },
]

/** The box, corners, cursor, disabled state and focus outline every one of the five carries. */
const BASE = [
  'inline-flex',
  'size-7',
  'flex-none',
  'items-center',
  'justify-center',
  'p-0',
  'border-0',
  'rounded-[6px]',
  'cursor-pointer',
  'disabled:opacity-50',
  'disabled:cursor-not-allowed',
  'focus-visible:outline-2',
  'focus-visible:outline-offset-2',
  'focus-visible:outline-[#0070f3]',
  'dark:focus-visible:outline-[#60a5fa]',
]

const REST = ['bg-transparent', 'text-[#808080]', 'dark:text-[#9ca3af]']

const ACTIVE = [
  'text-[#0070f3]',
  'bg-[#eff6ff]',
  'shadow-[0_0_0_1.5px_rgba(0,112,243,0.5)]',
  'dark:text-[#60a5fa]',
  'dark:bg-[rgba(0,112,243,0.15)]',
]

function hueTokens(h: Hue): string[] {
  const out: string[] = []
  for (const state of ['hover', 'focus']) {
    out.push(
      `enabled:${state}:text-[${h.light}]`,
      `enabled:${state}:bg-[${h.lightBg}]`,
      `enabled:${state}:shadow-[0_0_0_1.5px_${h.ring}]`,
      `dark:enabled:${state}:text-[${h.dark}]`,
      `dark:enabled:${state}:bg-[${h.darkBg}]`,
    )
  }
  return out
}

function tokens(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
}

function renderButton(el: ReactElement, label: string): HTMLButtonElement {
  render(el)
  return screen.getByRole('button', { name: label }) as HTMLButtonElement
}

describe('shared icon buttons: GanttApp’s size and colours (v0.48.2)', () => {
  describe.each(CASES)('$name', ({ el, label, hue }) => {
    it('is a 28 px box (size-7, no padding) with 6 px corners and an 18 px glyph', () => {
      const button = renderButton(el({}), label)
      const t = tokens(button)
      expect(t).toEqual(expect.arrayContaining(BASE))
      expect(t).not.toContain('p-1.5')
      const svg = button.querySelector('svg')!
      expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['18', '18'])
    })

    it('rests grey (#808080, dark #9ca3af) on no background', () => {
      const t = tokens(renderButton(el({}), label))
      expect(t).toEqual(expect.arrayContaining(REST))
      expect(t).not.toContain('text-gray-400')
    })

    it('takes its own shade, tint and 1.5 px ring on hover and on focus, in both themes', () => {
      const t = tokens(renderButton(el({}), label))
      expect(t).toEqual(expect.arrayContaining(hueTokens(hue)))
    })

    it('gates every hover and focus look on `enabled:`, so a disabled button shows none', () => {
      const button = renderButton(el({ disabled: true }), label)
      expect(button.disabled).toBe(true)
      const t = tokens(button)
      const looks = t.filter((x) => /(^|:)(hover|focus):/.test(x))
      expect(looks.length).toBeGreaterThanOrEqual(10)
      expect(looks.filter((x) => !/^(dark:)?enabled:(hover|focus):/.test(x))).toEqual([])
      expect(t).toEqual(expect.arrayContaining(['disabled:opacity-50', 'disabled:cursor-not-allowed']))
    })
  })

  it('the five draw one look: the same base classes, and five different hover shades', () => {
    const lights = CASES.map(({ el, label, hue }) => {
      const t = tokens(renderButton(el({}), label))
      expect(t).toEqual(expect.arrayContaining([...BASE, ...REST]))
      return hue.light
    })
    expect(new Set(lights).size).toBe(5)
  })
})

describe('Pencil’s active state (the row being edited)', () => {
  it('holds Edit’s hover look, GanttApp’s blue in both themes, with none of the resting classes', () => {
    const t = tokens(renderButton(<PencilIconButton onClick={vi.fn()} ariaLabel="Edit Sprint 3" active />, 'Edit Sprint 3'))
    expect(t).toEqual(expect.arrayContaining(ACTIVE))
    // A resting class beside an active one is a tie the stylesheet's order settles; in v0.48.1
    // the resting classes won, so the active pencil's icon stayed grey in both themes, and its
    // background stayed transparent in the light theme.
    for (const rest of REST) expect(t).not.toContain(rest)
  })

  it('is overridden by disabled: an active, disabled pencil rests grey with no active look', () => {
    const button = renderButton(
      <PencilIconButton onClick={vi.fn()} ariaLabel="Edit Sprint 3" active disabled />,
      'Edit Sprint 3',
    )
    expect(button.disabled).toBe(true)
    const t = tokens(button)
    expect(t).toEqual(expect.arrayContaining(REST))
    for (const a of ACTIVE) expect(t).not.toContain(a)
  })

  it('without `active` rests grey', () => {
    const t = tokens(renderButton(<PencilIconButton onClick={vi.fn()} ariaLabel="Edit Sprint 3" />, 'Edit Sprint 3'))
    expect(t).toEqual(expect.arrayContaining(REST))
    for (const a of ACTIVE) expect(t).not.toContain(a)
  })
})

describe('names, titles and descriptions are unchanged (D11)', () => {
  it.each([
    ['Delete', () => <TrashIconButton onClick={vi.fn()} />],
    ['Edit', () => <PencilIconButton onClick={vi.fn()} />],
    ['Export', () => <ExportIconButton onClick={vi.fn()} />],
    ['Clone', () => <CloneIconButton onClick={vi.fn()} />],
    ['Share', () => <ShareIconButton onClick={vi.fn()} />],
  ])('%s keeps its default name and title', (name, el) => {
    expect(renderButton(el(), name).getAttribute('title')).toBe(name)
  })

  it.each([
    ['Delete Sprint 3', () => <TrashIconButton onClick={vi.fn()} ariaLabel="Delete Sprint 3" title="Only the latest" disabled describedBy="why" />],
    ['Edit Sprint 3', () => <PencilIconButton onClick={vi.fn()} ariaLabel="Edit Sprint 3" title="Only the latest" disabled describedBy="why" />],
  ])('%s passes its title and aria-describedby through', (name, el) => {
    const button = renderButton(el(), name)
    expect(button.getAttribute('title')).toBe('Only the latest')
    expect(button.getAttribute('aria-describedby')).toBe('why')
  })
})
