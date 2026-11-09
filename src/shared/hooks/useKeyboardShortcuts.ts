// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useCallback } from 'react'
import { isModalSurfaceOpen } from '@/shared/lib/modal-surface'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  description: string
  action: () => void
}

// Check if the event target is an input element
function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}

// One character that is not a letter: `?`, `1`, `/`. Not `k`, not `Escape`.
function isNonLetterCharacter(key: string): boolean {
  return key.length === 1 && !/\p{L}/u.test(key)
}

// Check if cmd/ctrl modifier is pressed (cmd on Mac, ctrl on Windows/Linux)
function isModifierKey(event: KeyboardEvent): boolean {
  // navigator.platform is deprecated but still works and is simpler than userAgentData
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  return isMac ? event.metaKey : event.ctrlKey
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Every page shortcut waits while a dialog is open (v0.48.1), `?` included: the
      // dialog handles its own keys, and nothing behind it may act. A digit here used
      // to switch the tab behind the Delete Project dialog and unmount it.
      if (isModalSurfaceOpen()) return

      // Don't trigger shortcuts when typing in input fields
      if (isInputElement(event.target)) return

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const modifierMatch =
          shortcut.ctrl || shortcut.meta
            ? isModifierKey(event)
            : !event.ctrlKey && !event.metaKey
        // A single non-letter key such as `?` or a digit already carries Shift in
        // `event.key`: a real `?` IS Shift+/ on most keyboards. Requiring Shift to be up
        // for it meant a real `?` never opened the help (fixed in v0.48.1). Letters keep
        // the Shift check, so Shift+K still does not fire a `k` shortcut.
        const shiftMatch = shortcut.shift
          ? event.shiftKey
          : !event.shiftKey || isNonLetterCharacter(shortcut.key)

        if (keyMatch && modifierMatch && shiftMatch) {
          event.preventDefault()
          shortcut.action()
          return
        }
      }
    },
    [shortcuts, enabled]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}

// Format shortcut for display (e.g., "Cmd+S" or "Ctrl+S")
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = []
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? 'Cmd' : 'Ctrl')
  }
  if (shortcut.shift) {
    parts.push('Shift')
  }
  parts.push(shortcut.key.toUpperCase())

  return parts.join('+')
}
