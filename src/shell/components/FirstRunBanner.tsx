// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useSyncExternalStore } from 'react'
import { FIRST_RUN_SEEN_KEY, TOS_URL, PRIVACY_URL } from '@/features/auth/lib/tos'

function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function getFirstRunActive() {
  return localStorage.getItem(FIRST_RUN_SEEN_KEY) !== 'true'
}

export function FirstRunBanner() {
  // `storage` events fire cross-tab only. Same-tab dismissal uses `dismissed`
  // below (plus a localStorage write that persists + broadcasts to other tabs).
  const firstRunActive = useSyncExternalStore(
    subscribeStorage,
    getFirstRunActive,
    () => false
  )
  const [dismissed, setDismissed] = useState(false)
  if (!firstRunActive || dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(FIRST_RUN_SEEN_KEY, 'true')
    setDismissed(true)
  }

  // The frame's info notice (FRAME26, v0.52.0): `.sf-notice--info` gives the box, the 14 / 20 text and its colours
  // (8.11 : 1 light, 10.39 dark), and underlines the links in the text colour; "Got it" is the frame's dismiss button.
  // The ® inherits the notice's colour (it was gray-400, 2.39 : 1 on this ground) and keeps its small raised size.
  return (
    <div className="sf-notice sf-notice--info">
      <p>
        SPERT<span className="font-normal text-xs align-top">®</span> Suite web apps
        are free to use. No account is required to use them. By accessing or using this app, you agree to our{' '}
        <a href={TOS_URL} target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        . If you choose to enable optional Cloud Storage, you&apos;ll be asked to explicitly confirm
        your agreement.
      </p>
      <button type="button" onClick={handleDismiss} className="sf-notice-dismiss">
        Got it
      </button>
    </div>
  )
}
