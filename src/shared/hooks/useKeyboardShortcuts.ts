// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useCallback } from 'react'

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

      // Don't trigger shortcuts when typing in input fields
      if (isInputElement(event.target)) return

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const modifierMatch =
          shortcut.ctrl || shortcut.meta
            ? isModifierKey(event)
            : !event.ctrlKey && !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey

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
