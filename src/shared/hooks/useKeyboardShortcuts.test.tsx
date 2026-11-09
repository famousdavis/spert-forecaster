// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// useKeyboardShortcuts had no test file before v0.48.1. That is how a digit key
// pressed inside the Delete Project dialog came to switch the tab behind it,
// unmount the dialog and drop focus to the page (measured in a real browser).
//
// Since v0.48.1 every page shortcut waits while a modal surface is open
// (`@/shared/lib/modal-surface`). Each "waits" case below presses the key with a
// dialog open, then closes the dialog and presses the SAME key again, which must
// now fire: a probe that never fires cannot pass a "nothing fired" assertion.
//
// Whether every `aria-modal` surface carries the marker is a separate, source-wide
// question; `modal-surface.test.ts` owns it. The surfaces rendered here are the
// ones that render without providers.
// ===========================================================================

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { useKeyboardShortcuts, type KeyboardShortcut } from './useKeyboardShortcuts'
import { isModalSurfaceOpen, modalSurfaceProps } from '@/shared/lib/modal-surface'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { KeyboardShortcutsHelp } from '@/shared/components/KeyboardShortcutsHelp'
import { ConsentModal } from '@/features/auth/components/ConsentModal'
import { ConnectAiConsentModal } from '@/features/connect-ai/components/ConnectAiConsentModal'

type Spies = Record<'1' | '3' | '?', ReturnType<typeof vi.fn>>

function makeShortcuts(): { spies: Spies; shortcuts: KeyboardShortcut[] } {
  const spies: Spies = { '1': vi.fn(), '3': vi.fn(), '?': vi.fn() }
  const shortcuts = (Object.keys(spies) as (keyof Spies)[]).map((key) => ({
    key,
    description: `probe ${key}`,
    action: () => spies[key](),
  }))
  return { spies, shortcuts }
}

function Probe({ shortcuts }: { shortcuts: KeyboardShortcut[] }) {
  useKeyboardShortcuts(shortcuts)
  return <button type="button">page button</button>
}

const KEYS = ['1', '3', '?'] as const
const press = (key: string, target: Element | Document = document.body) => fireEvent.keyDown(target, { key })

const SURFACES: Array<{ name: string; ariaModal: boolean; el: () => ReactElement }> = [
  { name: 'a bare modal surface', ariaModal: false, el: () => <div {...modalSurfaceProps} /> },
  {
    name: 'the confirmation dialog (Delete Project)',
    ariaModal: true,
    el: () => <ConfirmDialog isOpen title="Delete Project" message="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
  },
  { name: 'the keyboard shortcuts help', ariaModal: true, el: () => <KeyboardShortcutsHelp isOpen onClose={vi.fn()} shortcuts={[]} /> },
  { name: 'the cloud terms consent dialog', ariaModal: true, el: () => <ConsentModal onAccept={vi.fn()} onCancel={vi.fn()} /> },
  { name: 'the Connect AI consent dialog', ariaModal: true, el: () => <ConnectAiConsentModal open onCancel={vi.fn()} onConfirm={vi.fn()} /> },
]

describe('useKeyboardShortcuts', () => {
  it.each(KEYS)('with no dialog open, "%s" reaches its page shortcut', (key) => {
    const { spies, shortcuts } = makeShortcuts()
    render(<Probe shortcuts={shortcuts} />)
    expect(isModalSurfaceOpen()).toBe(false)
    press(key)
    expect(spies[key]).toHaveBeenCalledTimes(1)
    // Only that one.
    expect(Object.values(spies).reduce((n, s) => n + s.mock.calls.length, 0)).toBe(1)
  })

  describe.each(SURFACES)('while $name is open', ({ el, ariaModal }) => {
    it.each(KEYS)('"%s" waits, and reaches the page once the dialog closes', (key) => {
      const { spies, shortcuts } = makeShortcuts()
      const view = render(<><Probe shortcuts={shortcuts} />{el()}</>)
      expect(isModalSurfaceOpen()).toBe(true)
      // The rendered aria-modal dialog sits inside the marked root, not beside it.
      const modals = document.querySelectorAll('[aria-modal="true"]')
      expect(modals).toHaveLength(ariaModal ? 1 : 0)
      modals.forEach((m) => expect(m.closest('[data-modal-surface]')).not.toBeNull())

      press(key)
      Object.values(spies).forEach((s) => expect(s).not.toHaveBeenCalled())

      view.rerender(<Probe shortcuts={shortcuts} />)
      expect(isModalSurfaceOpen()).toBe(false)
      press(key)
      expect(spies[key]).toHaveBeenCalledTimes(1)
    })
  })

  it('the help dialog still closes on Escape and its close button while "?" waits', () => {
    // `?` no longer toggles the help closed (v0.48.1); Escape and the dialog's own
    // controls are the way out, and they must still work.
    const { spies, shortcuts } = makeShortcuts()
    const onClose = vi.fn()
    render(<><Probe shortcuts={shortcuts} /><KeyboardShortcutsHelp isOpen onClose={onClose} shortcuts={shortcuts} /></>)
    press('?')
    expect(spies['?']).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  describe('typing in a field never fires a page shortcut', () => {
    const FIELDS: Array<{ name: string; el: () => ReactElement; select: string }> = [
      { name: 'an input', el: () => <input aria-label="field" />, select: 'input' },
      { name: 'a textarea', el: () => <textarea aria-label="field" />, select: 'textarea' },
      { name: 'a select', el: () => <select aria-label="field"><option>a</option></select>, select: 'select' },
    ]
    it.each(FIELDS)('$name', ({ el, select }) => {
      const { spies, shortcuts } = makeShortcuts()
      const { container } = render(<><Probe shortcuts={shortcuts} />{el()}</>)
      press('3', container.querySelector(select)!)
      expect(spies['3']).not.toHaveBeenCalled()
      // Control: the same key from a button reaches the page.
      press('3', screen.getByRole('button', { name: 'page button' }))
      expect(spies['3']).toHaveBeenCalledTimes(1)
    })

    it('a contenteditable element', () => {
      // jsdom does not implement isContentEditable, so the property the hook reads is
      // set by hand: this pins the hook's branch, not the browser's computation.
      const { spies, shortcuts } = makeShortcuts()
      const { container } = render(<><Probe shortcuts={shortcuts} /><div data-testid="ce" /></>)
      const ce = container.querySelector('[data-testid="ce"]')!
      Object.defineProperty(ce, 'isContentEditable', { value: true })
      press('3', ce)
      expect(spies['3']).not.toHaveBeenCalled()
      press('3', screen.getByRole('button', { name: 'page button' }))
      expect(spies['3']).toHaveBeenCalledTimes(1)
    })
  })
})
