// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { useSettingsStore } from '@/shared/state/settings-store'

export function LocalStorageWarningBanner() {
  const { mode } = useStorageMode()
  const suppressLocalStorageWarning = useSettingsStore((s) => s.suppressLocalStorageWarning)
  const shouldShow = mode === 'local' && !suppressLocalStorageWarning
  if (!shouldShow) return null
  // Remount via key so toggling the conditions off-then-on resets the
  // in-memory dismissal state (matches the pre-refactor effect behavior).
  return <DismissibleBanner key={`${mode}-${String(suppressLocalStorageWarning)}`} />
}

function DismissibleBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  // The frame's caution notice (FRAME26, v0.52.0): `.sf-notice--caution` gives the box, the text and its colours
  // (6.84 : 1 light, 12.25 dark); "Got it" is the frame's dismiss button.
  return (
    <div className="sf-notice sf-notice--caution">
      <p>
        <strong>Your data exists only in this browser</strong> and can be lost without warning.{' '}
        Export at the end of every session to protect your work.
      </p>
      <button type="button" onClick={() => setDismissed(true)} className="sf-notice-dismiss">
        Got it
      </button>
    </div>
  )
}
