// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.48.1: a modal surface's Escape handler calls preventDefault (modal-surface.ts).
// The import preview's Escape listener relies on it when the dialog's listener runs
// first and React has already removed the dialog (ImportPreviewSection.escape.test.tsx).
//
// Five of the seven modal surfaces are checked here. The help and the Connect AI
// panel did not call preventDefault before v0.48.1. ConfirmDialog, CloudStorageModal
// and ConsentModal already did, and are pinned here because ConfirmDialog is the one
// whose listener can run BEFORE the preview's: its onCancel is stable, so its listener
// is not re-registered when an import lands behind it (a Story Map handoff). Without
// its preventDefault, Escape in Delete Project would cancel that import (measured in
// a real browser by the v0.48.1 review). The other two also call preventDefault on
// Escape, and their own tests pin it: ProjectDialog (v0.49.0, ProjectDialog.test.tsx)
// and ConnectAiConsentModal (Escape since v0.50.4, ConnectAiLauncher.focus.test.tsx).

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, createEvent } from '@testing-library/react'
import type { ReactElement } from 'react'

import { KeyboardShortcutsHelp } from '@/shared/components/KeyboardShortcutsHelp'
import { ConnectAiPanel } from '@/features/connect-ai/components/ConnectAiPanel'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { ConsentModal } from '@/features/auth/components/ConsentModal'
import { CloudStorageModal } from '@/features/auth/components/CloudStorageModal'

const SURFACES: Array<{ name: string; el: (onClose: () => void) => ReactElement }> = [
  {
    name: 'the confirmation dialog (Delete Project)',
    el: (onClose) => <ConfirmDialog isOpen title="Delete Project" message="Delete?" onConfirm={vi.fn()} onCancel={onClose} />,
  },
  { name: 'the cloud storage terms consent dialog', el: (onClose) => <ConsentModal onAccept={vi.fn()} onCancel={onClose} /> },
  { name: 'the Cloud Storage dialog', el: (onClose) => <CloudStorageModal isOpen onClose={onClose} /> },
  { name: 'the keyboard shortcuts help', el: (onClose) => <KeyboardShortcutsHelp isOpen onClose={onClose} shortcuts={[]} /> },
  {
    name: 'the Connect AI panel',
    el: (onClose) => (
      <ConnectAiPanel
        open
        onClose={onClose}
        sessionState={{ sessionActive: false, aiConnected: false, consentRead: true, sessionId: null }}
        onChangePermissions={vi.fn(async () => true)}
        onDisconnect={vi.fn(async () => {})}
      />
    ),
  },
]

describe('modal surfaces mark their Escape as handled', () => {
  it.each(SURFACES)('$name closes on Escape and calls preventDefault', ({ el }) => {
    const onClose = vi.fn()
    render(el(onClose))
    const event = createEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent(document.body, event)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('control: an Escape nobody handles is not prevented', () => {
    const event = createEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent(document.body, event)
    expect(event.defaultPrevented).toBe(false)
  })
})
