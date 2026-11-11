// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Focus in the keyboard shortcuts help (v0.50.4, F5). It opens on itself, as before; closed, focus
// now goes back to what had it when `?` opened it. Known-bad: <body>.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, createEvent } from '@testing-library/react'
import { useState } from 'react'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'

afterEach(() => cleanup())

/** A page with a button that had focus when `?` was pressed, and the help. */
function Page() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Somewhere</button>
      <KeyboardShortcutsHelp isOpen={open} onClose={() => setOpen(false)} shortcuts={[]} />
    </>
  )
}

const somewhere = () => screen.getByRole('button', { name: 'Somewhere' })
const help = () => screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })
const focused = () => document.activeElement
function open() {
  render(<Page />)
  somewhere().focus()
  fireEvent.click(somewhere())
  expect(help()).not.toBeNull()
  expect(help()!.contains(focused())).toBe(true)
}

describe('the keyboard shortcuts help returns focus (known-bad: <body>)', () => {
  it.each([
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
    ['Close', () => fireEvent.click(within(help()!).getByRole('button', { name: 'Close' }))],
    ['a click outside it', () => fireEvent.mouseDown(help()!)],
  ])('%s: back to what had focus', (_how, close) => {
    open()
    close()
    expect([help(), focused()]).toEqual([null, somewhere()])
  })

  it('a click outside it marks its mousedown handled, so the browser does not then move focus to <body>', () => {
    // jsdom has no mousedown default action; Chrome's ran after the close and undid the return
    // (measured on a production build). This pins the mechanism the browser check relies on.
    open()
    const event = createEvent.mouseDown(help()!)
    fireEvent(help()!, event)
    expect([help(), event.defaultPrevented]).toEqual([null, true])
  })

  it('control: a mousedown inside it is left alone, and it stays open', () => {
    open()
    const event = createEvent.mouseDown(screen.getByRole('heading', { name: 'Keyboard Shortcuts' }))
    fireEvent(screen.getByRole('heading', { name: 'Keyboard Shortcuts' }), event)
    expect([help() !== null, event.defaultPrevented]).toEqual([true, false])
  })
})
