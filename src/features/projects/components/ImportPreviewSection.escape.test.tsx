// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// v0.48.1: Escape pressed in a dialog must not also cancel an import preview waiting
// behind it. Before, the preview's document listener cancelled on any Escape, so
// Escape in the shortcuts help, the Cloud Storage dialog or Delete Project threw the
// staged import away (measured in a real browser).
//
// The preview's listener skips an Escape that is already handled
// (`defaultPrevented`) or that arrives while a modal surface is open. Both are needed
// because both listener orders happen:
// - preview's listener first: the dialog is still in the DOM, so its marker is there.
// - dialog's listener first: in a real browser React can remove the dialog between
//   the two listeners (microtasks run between them), so the marker is gone by the
//   time the preview asks; only `defaultPrevented` is left.
//
// jsdom runs no microtasks between listeners, so the second order is PRODUCED here:
// a document keydown listener registered BEFORE the preview mounts runs before the
// preview's own (same target, same bubble phase, registration order). It calls
// preventDefault and removes its marked element, standing in for a dialog that React
// closed between listeners.
// ===========================================================================

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ImportPreviewSection } from './ImportPreviewSection'
import { isModalSurfaceOpen, modalSurfaceProps, MODAL_SURFACE_ATTR } from '@/shared/lib/modal-surface'

function renderPreview(onCancel: () => void, extra: ReactNode = null) {
  return render(
    <>
      <ImportPreviewSection
        imported={{ exportType: 'spert-forecaster-project-export', projects: [], sprints: [] }}
        conflicts={[]}
        decisions={new Map()}
        mode="merge"
        applying={false}
        existingSprints={[]}
        idPrefix="t"
        accessOf={() => 'owner'}
        replaceAllBlocked={false}
        onModeChange={vi.fn()}
        onDecisionChange={vi.fn()}
        onConfirm={vi.fn()}
        onRequestReplaceAll={vi.fn()}
        onCancel={onCancel}
      />
      {extra}
    </>,
  )
}

const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' })

describe('ImportPreviewSection: Escape and dialogs', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => { cleanups.splice(0).forEach((f) => f()) })

  it('kept (B20): with nothing open and nothing handled, Escape cancels the preview once', () => {
    const onCancel = vi.fn()
    renderPreview(onCancel)
    expect(isModalSurfaceOpen()).toBe(false)
    expect(escape()).toBe(true) // not prevented
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('preview first: while a modal surface is open, Escape leaves the preview alone', () => {
    const onCancel = vi.fn()
    // A bare marked root: nothing calls preventDefault, so only the marker check stands.
    renderPreview(onCancel, <div {...modalSurfaceProps} />)
    expect(isModalSurfaceOpen()).toBe(true)
    escape()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('dialog first: an Escape the dialog handled and closed on leaves the preview alone', () => {
    // The stand-in dialog, mounted and listening BEFORE the preview.
    const dialogRoot = document.createElement('div')
    dialogRoot.setAttribute(MODAL_SURFACE_ATTR, '')
    document.body.appendChild(dialogRoot)
    const seenByDialog = vi.fn()
    const dialogListener = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      seenByDialog()
      e.preventDefault()
      dialogRoot.remove() // React closed it between listeners
    }
    document.addEventListener('keydown', dialogListener)
    cleanups.push(() => { document.removeEventListener('keydown', dialogListener); dialogRoot.remove() })

    const onCancel = vi.fn()
    renderPreview(onCancel)
    expect(isModalSurfaceOpen()).toBe(true)

    expect(escape()).toBe(false) // prevented
    expect(seenByDialog).toHaveBeenCalledTimes(1)
    // The marker was already gone when the preview's listener ran: only
    // defaultPrevented can have stopped it.
    expect(isModalSurfaceOpen()).toBe(false)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
