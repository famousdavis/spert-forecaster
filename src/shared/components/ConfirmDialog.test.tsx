// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The two-button dialog every existing caller uses must not change, and the
// optional third button (Brief 40's "Export a backup") must never make Enter
// run the destructive choice.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(() => cleanup())

const labels = () => screen.getAllByRole('button').map((b) => b.textContent)

describe('ConfirmDialog — two buttons, as every existing caller uses it', () => {
  function open() {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen title="Delete?" message="Gone for good." confirmLabel="Delete" cancelLabel="Keep" onConfirm={onConfirm} onCancel={onCancel} />)
    return { onConfirm, onCancel }
  }

  it('shows Cancel then Confirm, with focus on Cancel', () => {
    open()
    expect(labels()).toEqual(['Keep', 'Delete'])
    expect(document.activeElement?.textContent).toBe('Keep')
  })

  it('Escape cancels; Enter has no dialog-level shortcut', () => {
    const { onConfirm, onCancel } = open()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('traps Tab between its two buttons', () => {
    open()
    const [keep, del] = screen.getAllByRole('button')
    del.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(keep)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(del)
  })
})

describe('ConfirmDialog — with the optional third button (Brief 40)', () => {
  function open() {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const onExtra = vi.fn()
    render(
      <ConfirmDialog
        isOpen
        title="Switch to local storage?"
        message="m"
        confirmLabel="Switch anyway"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
        extraAction={{ label: 'Export a backup', onClick: onExtra }}
      />,
    )
    return { onConfirm, onCancel, onExtra }
  }

  it('shows [Export a backup] [Switch anyway] [Cancel], with focus on Cancel', () => {
    open()
    expect(labels()).toEqual(['Export a backup', 'Switch anyway', 'Cancel'])
    expect(document.activeElement?.textContent).toBe('Cancel')
  })

  it('the extra action runs without closing, confirming or cancelling', () => {
    const { onConfirm, onCancel, onExtra } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Export a backup' }))
    expect(onExtra).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('Enter never runs the destructive choice by default; Escape cancels', () => {
    const { onConfirm, onCancel } = open()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('traps Tab across all three buttons, in their on-screen order', () => {
    open()
    const [extra, , cancel] = screen.getAllByRole('button')
    cancel.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(extra)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
  })
})
