// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// A tile's Tile color button and popover (v0.50.0), GanttApp's `ProjectColorControl.test.tsx` at
// d437e84 ported to Forecaster's two components. jsdom neither moves focus on a press nor turns an
// arrow key into a pick, so a mouse pick here is the events a browser sends (pointerdown on the
// label, then a click on it) and an arrow key's pick is a click with no pointerdown. The release's
// browser run checks the rest, including a real Escape with an import waiting.

import { useRef, useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup, act } from '@testing-library/react'
import { ProjectColorButton, ProjectColorPopover } from './ProjectColorControl'
import type { ProjectColor } from '@/shared/lib/project-prefs'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const COLORS: [ProjectColor, string][] = [
  ['blue', 'Blue'],
  ['teal', 'Teal'],
  ['slate', 'Slate'],
  ['purple', 'Purple'],
  ['pink', 'Pink'],
]

/** The button and the popover, wired as ProjectTile wires them. */
function Harness({
  initial,
  initiallyOpen = true,
  refuse = false,
  onPick,
  name = 'Alpha',
}: {
  initial?: ProjectColor
  initiallyOpen?: boolean
  refuse?: boolean
  onPick?: (color: ProjectColor | null) => void
  name?: string
}) {
  const [color, setColor] = useState<ProjectColor | undefined>(initial)
  const [open, setOpen] = useState(initiallyOpen)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button type="button">Before</button>
      <ProjectColorButton projectName={name} color={color} open={open} buttonRef={buttonRef} onOpenChange={setOpen} />
      {open && (
        <ProjectColorPopover
          color={color}
          buttonRef={buttonRef}
          onOpenChange={setOpen}
          onPick={(next) => {
            onPick?.(next)
            if (refuse) return false
            setColor(next ?? undefined)
            return true
          }}
        />
      )}
      <button type="button">After</button>
      <p>Outside</p>
    </div>
  )
}

const icon = () => screen.getByRole('button', { name: /^Tile color for / })
const popover = () => screen.queryByRole('dialog', { name: 'Tile color' })
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement
const focused = () => document.activeElement

/** The events of a mouse pick on a choice, in a browser's order. */
function mousePick(name: string) {
  const label = radio(name).closest('label')!
  fireEvent.pointerDown(label)
  fireEvent.mouseDown(label)
  fireEvent.click(label)
}

describe('the Tile color button', () => {
  it.each([...COLORS, [undefined, 'No color']] as const)('with %s names the project and its colour (D11)', (color, label) => {
    render(<Harness initial={color} initiallyOpen={false} />)
    const button = screen.getByRole('button', { name: `Tile color for Alpha: ${label}` })
    expect([button.getAttribute('title'), button.getAttribute('aria-haspopup'), button.getAttribute('aria-expanded')]).toEqual([
      'Tile color',
      'dialog',
      'false',
    ])
  })

  it('opens the popover, says so, and closes it again with focus on the button', () => {
    render(<Harness initiallyOpen={false} />)
    expect(popover()).toBeNull()
    fireEvent.click(icon())
    expect(popover()).not.toBeNull()
    expect(icon().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(icon())
    expect(popover()).toBeNull()
    expect(icon().getAttribute('aria-expanded')).toBe('false')
    expect(focused()).toBe(icon())
  })

  it('keeps focus in the popover when pressed while open, and only while open', () => {
    render(<Harness initiallyOpen={false} />)
    // fireEvent returns false when the default was prevented.
    expect(fireEvent.mouseDown(icon())).toBe(true)
    fireEvent.click(icon())
    expect(fireEvent.mouseDown(icon())).toBe(false)
  })
})

describe('the popover', () => {
  it('is a non-modal dialog with a title, six labelled radios in one group, and a hint', () => {
    render(<Harness />)
    const dialog = popover()!
    expect(dialog.hasAttribute('aria-modal')).toBe(false)
    expect(dialog.hasAttribute('data-modal-surface')).toBe(false)
    expect(within(dialog).getByRole('radiogroup', { name: 'Tile color' })).not.toBeNull()
    const radios = within(dialog).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(['Blue', 'Teal', 'Slate', 'Purple', 'Pink', 'No color'])
    expect(new Set(radios.map((r) => r.name)).size).toBe(1)
    expect(new Set(radios.map((r) => r.id)).size).toBe(6)
    expect(within(dialog).getByText('Arrow keys choose. Enter or Esc closes.')).not.toBeNull()
  })

  it.each([...COLORS, [undefined, 'No color']] as const)('with %s, opening focuses that radio', (color, label) => {
    render(<Harness initial={color} />)
    expect(radio(label).checked).toBe(true)
    expect(focused()).toBe(radio(label))
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).filter((r) => r.checked)).toHaveLength(1)
  })

  it("a project name holding quotes and a backslash changes nothing: the radios' names are the popover's own", () => {
    render(<Harness name={'Q"uote \\ back'} />)
    expect(screen.getByRole('button', { name: 'Tile color for Q"uote \\ back: No color' })).not.toBeNull()
    expect(radio('No color').name).toMatch(/^tile-color-/)
  })
})

describe('picking', () => {
  it.each(COLORS)('an arrow key picks %s and leaves the popover open', (color, label) => {
    const onPick = vi.fn()
    render(<Harness initial={color === 'blue' ? 'teal' : 'blue'} onPick={onPick} />)
    fireEvent.keyDown(screen.getByRole('radio', { checked: true }), { key: 'ArrowDown' })
    fireEvent.click(radio(label))
    expect(onPick).toHaveBeenCalledWith(color)
    expect(radio(label).checked).toBe(true)
    expect(popover()).not.toBeNull()
    expect(icon().getAttribute('aria-label')).toBe(`Tile color for Alpha: ${label}`)
  })

  it('No color clears the colour', () => {
    const onPick = vi.fn()
    render(<Harness initial="pink" onPick={onPick} />)
    fireEvent.click(radio('No color'))
    expect(onPick).toHaveBeenCalledWith(null)
    expect(icon().getAttribute('aria-label')).toBe('Tile color for Alpha: No color')
  })

  it.each([...COLORS, ['none', 'No color']] as const)(
    'a mouse pick of %s closes the popover and returns focus to the button (known-bad: focus to main)',
    (_c, label) => {
      render(<Harness initial={label === 'Teal' ? 'pink' : 'teal'} />)
      mousePick(label)
      expect(popover()).toBeNull()
      expect(icon().getAttribute('aria-label')).toBe(`Tile color for Alpha: ${label}`)
      expect(focused()).toBe(icon())
    },
  )

  it('a mouse pick of the colour already chosen changes nothing and still closes', () => {
    const onPick = vi.fn()
    render(<Harness initial="purple" onPick={onPick} />)
    mousePick('Purple')
    expect(onPick).not.toHaveBeenCalled()
    expect(popover()).toBeNull()
    expect(focused()).toBe(icon())
  })

  it('a key pressed after a press on a choice makes the next pick a keyboard pick', () => {
    render(<Harness initial="blue" />)
    fireEvent.pointerDown(radio('Teal').closest('label')!)
    fireEvent.keyDown(radio('Blue'), { key: 'ArrowDown' })
    fireEvent.click(radio('Teal'))
    expect(radio('Teal').checked).toBe(true)
    expect(popover()).not.toBeNull()
  })

  it('a press on the popover but not on a choice does not make the next pick a mouse pick', () => {
    render(<Harness initial="blue" />)
    fireEvent.pointerDown(screen.getByText('Arrow keys choose. Enter or Esc closes.'))
    fireEvent.click(radio('Teal'))
    expect(radio('Teal').checked).toBe(true)
    expect(popover()).not.toBeNull()
  })

  it('a press on a label or the title keeps focus in the popover; a press on a radio is left alone', () => {
    render(<Harness initial="blue" />)
    expect(fireEvent.mouseDown(radio('Teal').closest('label')!)).toBe(false)
    expect(fireEvent.mouseDown(screen.getByText('Tile color'))).toBe(false)
    expect(fireEvent.mouseDown(radio('Teal'))).toBe(true)
  })
})

describe('a refused pick', () => {
  it('by mouse changes nothing on screen: the popover stays and the same radio stays checked, with focus', () => {
    const onPick = vi.fn()
    render(<Harness initial="blue" refuse onPick={onPick} />)
    mousePick('Pink')
    expect(onPick).toHaveBeenCalledWith('pink')
    expect(popover()).not.toBeNull()
    expect([radio('Blue').checked, radio('Pink').checked]).toEqual([true, false])
    expect(focused()).toBe(radio('Blue'))
    expect(icon().getAttribute('aria-label')).toBe('Tile color for Alpha: Blue')
  })

  it('by arrow key puts focus back on the radio still checked', () => {
    render(<Harness initial="teal" refuse />)
    radio('Slate').focus() // a browser moves focus to the next radio before the pick
    fireEvent.click(radio('Slate'))
    expect(radio('Teal').checked).toBe(true)
    expect(focused()).toBe(radio('Teal'))
    expect(popover()).not.toBeNull()
  })
})

describe('closing', () => {
  it.each(['Enter', 'Escape'])('%s closes it, returns focus to the button, and is defaultPrevented (D27)', (key) => {
    render(<Harness initial="slate" />)
    // fireEvent returns false when the default was prevented: what keeps a waiting import.
    expect(fireEvent.keyDown(radio('Slate'), { key })).toBe(false)
    expect(popover()).toBeNull()
    expect(focused()).toBe(icon())
  })

  it('a native Escape keydown leaves the popover with defaultPrevented TRUE on the event itself', () => {
    // What the import preview's document listener reads in the app (D27). In jsdom the React root
    // is a div, so the popover's stopPropagation keeps that listener from running at all, and an
    // integration test there would pass without preventDefault: this assertion, and the release's
    // real Escape in a browser, are the guards.
    render(<Harness initial="slate" />)
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => {
      radio('Slate').dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(popover()).toBeNull()
  })

  it('any other key leaves it open', () => {
    render(<Harness initial="slate" />)
    fireEvent.keyDown(radio('Slate'), { key: 'ArrowUp' })
    fireEvent.keyDown(radio('Slate'), { key: ' ' })
    expect(popover()).not.toBeNull()
  })

  it('Tab out closes it and leaves focus where it went', () => {
    render(<Harness initial="pink" />)
    const after = screen.getByRole('button', { name: 'After' })
    fireEvent.blur(radio('Pink'), { relatedTarget: after })
    expect(popover()).toBeNull()
    expect(focused()).not.toBe(icon())
  })

  it('focus moving between its radios leaves it open; the window losing focus leaves it open', () => {
    render(<Harness initial="pink" />)
    fireEvent.blur(radio('Pink'), { relatedTarget: radio('No color') })
    expect(popover()).not.toBeNull()
    fireEvent.blur(radio('Pink'), { relatedTarget: null })
    expect(popover()).not.toBeNull()
  })

  it('a press outside closes it and leaves focus alone', () => {
    render(<Harness initial="blue" />)
    fireEvent.pointerDown(screen.getByText('Outside'))
    expect(popover()).toBeNull()
    expect(focused()).not.toBe(icon())
  })

  it('a press on the button or inside the popover is not a press outside', () => {
    render(<Harness initial="blue" />)
    fireEvent.pointerDown(icon())
    expect(popover()).not.toBeNull()
    fireEvent.pointerDown(screen.getByText('Tile color'))
    expect(popover()).not.toBeNull()
  })

  it('a press outside tells the latest onOpenChange, not the one it opened with', () => {
    const first = vi.fn()
    const latest = vi.fn()
    const ref = { current: null }
    const { rerender } = render(<ProjectColorPopover color={undefined} buttonRef={ref} onPick={() => true} onOpenChange={first} />)
    rerender(<ProjectColorPopover color={undefined} buttonRef={ref} onPick={() => true} onOpenChange={latest} />)
    fireEvent.pointerDown(document.body)
    expect(latest).toHaveBeenCalledWith(false)
    expect(first).not.toHaveBeenCalled()
  })

  it('stops listening for presses outside once closed', () => {
    const onOpenChange = vi.fn()
    const ref = { current: null }
    const { unmount } = render(<ProjectColorPopover color={undefined} buttonRef={ref} onPick={() => true} onOpenChange={onOpenChange} />)
    unmount()
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
