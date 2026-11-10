// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

// ProjectDialog — the modal New Project / Edit Project dialog (v0.49.0), around ProjectForm.
// Its behaviour is GanttApp's `src/features/projects/ProjectDialog.tsx` at d437e84:
// - rendered into document.body; while it is open every other child of body is `inert`, so the
//   page behind can be neither reached nor read, and only what this dialog made inert is
//   restored when it closes;
// - focus opens on the first enabled control (Project Name, selected for Edit; Close when read
//   only); Tab and Shift+Tab wrap at its ends, and bring focus back if it has left;
// - Escape closes it, and focus goes back where the caller says, after `inert` is removed.
//
// ⚠️ Escape is handled in ONE document keydown listener in the CAPTURE phase, which calls
// preventDefault and stopPropagation. Not a React onKeyDown with stopPropagation: Next hydrates
// `document` itself, so a React stop does not stop another listener on `document` (measured,
// plan review F1 / P2d). Not a bubble listener without preventDefault: the import preview's own
// listener (ImportPreviewSection.tsx) skips only an Escape that is already handled or that
// arrives while a modal surface is in the page, and a real key press runs microtasks between
// listeners, so a dialog that closed first would be gone before that listener looked. Without
// preventDefault, Escape here would close the dialog AND discard a waiting import (v0.48.1, D27).
//
// ⚠️ Focus returns in the close cleanup, after `inert` is removed. Focusing from a submit or
// cancel handler is a silent no-op in a browser: the page is still inert then (measured; jsdom
// does not enforce `inert`, so a test there passes either way).

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { modalSurfaceProps } from '@/shared/lib/modal-surface'
import { DIALOG, DIALOG_BG, DIALOG_TITLE, OVERLAY } from './dashboard-styles'

interface ProjectDialogProps {
  /**
   * Which dialog this is: 'new', or the id of the project being edited. Opening (inert, first
   * focus) and closing (restore, return focus) run once per identity, never on a re-render,
   * so the dialog turning read only mid-edit does not run the close path.
   */
  identity: string
  title: string
  /** The project may only be viewed. Turning true while open moves focus to Close. */
  readOnly: boolean
  /** Escape. Cancel and Close are the form's own buttons. */
  onCancel: () => void
  /** Where focus goes once the dialog has closed; null for nowhere. Read at close time. */
  returnFocusTo: () => HTMLElement | null
  children: ReactNode
}

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'

/** Make every other child of body inert; returns the undo, which restores only what it changed. */
function inertOthers(keep: HTMLElement): () => void {
  const changed = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el !== keep && !el.hasAttribute('inert'),
  )
  changed.forEach((el) => el.setAttribute('inert', ''))
  return () => changed.forEach((el) => el.removeAttribute('inert'))
}

/** Tab and Shift+Tab wrap at the dialog's ends; from outside it, they bring focus back in. */
function wrapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const inside = active instanceof HTMLElement && root.contains(active)
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault()
    first.focus()
  }
}

/** Focus the first enabled control; select it when it is a text field being edited. */
function focusFirst(root: HTMLElement | null, select: boolean) {
  const first = root?.querySelector<HTMLElement>(FOCUSABLE)
  first?.focus()
  if (select && first instanceof HTMLInputElement && first.type === 'text') first.select()
}

export function ProjectDialog({ identity, title, readOnly, onCancel, returnFocusTo, children }: ProjectDialogProps) {
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // The latest callbacks, read by the listener and the cleanup when they run.
  const cancelRef = useRef(onCancel)
  const returnFocusRef = useRef(returnFocusTo)
  useEffect(() => {
    cancelRef.current = onCancel
    returnFocusRef.current = returnFocusTo
  })

  // Open: the page inert, focus to the first enabled control. Close: inert removed, THEN focus back.
  useEffect(() => {
    const overlay = overlayRef.current
    const undoInert = overlay ? inertOthers(overlay) : () => {}
    focusFirst(dialogRef.current, identity !== 'new')
    return () => {
      undoInert()
      returnFocusRef.current()?.focus()
    }
  }, [identity])

  // Its own effect, so the turn never runs the close path above. A disabled field keeps focus in
  // jsdom, but a browser moves it out of the dialog, so the move is explicit.
  const wasReadOnly = useRef(readOnly)
  useEffect(() => {
    if (readOnly && !wasReadOnly.current) focusFirst(dialogRef.current, false)
    wasReadOnly.current = readOnly
  }, [readOnly])

  // Capture phase, registered once: this dialog's keys never reach the page's shortcuts or a
  // document listener belonging to a surface behind it. Removed with the same capture flag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = dialogRef.current
      if (!root) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelRef.current()
        return
      }
      if (e.key === 'Tab') wrapTab(e, root)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return createPortal(
    <div ref={overlayRef} {...modalSurfaceProps} className={OVERLAY}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn(DIALOG, DIALOG_BG)}>
        <h3 id={titleId} className={DIALOG_TITLE}>
          {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body,
  )
}
