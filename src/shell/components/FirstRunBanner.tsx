// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useEffect } from 'react'
import { FIRST_RUN_SEEN_KEY } from '@/features/auth/lib/tos'

export function FirstRunBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(FIRST_RUN_SEEN_KEY) !== 'true') {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const handleDismiss = () => {
    localStorage.setItem(FIRST_RUN_SEEN_KEY, 'true')
    setVisible(false)
  }

  return (
    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg flex items-start justify-between gap-3">
      <p className="text-sm text-spert-text dark:text-gray-200">
        Statistical PERT<span className="text-gray-400 dark:text-gray-500 font-normal text-xs align-top">®</span> apps
        are free to use. No account is required. If you choose to enable optional Cloud Storage, you
        will be asked to review and agree to our Terms of Service and Privacy Policy.
      </p>
      <button
        onClick={handleDismiss}
        className="shrink-0 px-3 py-1 text-xs font-medium rounded border border-blue-300 dark:border-blue-600 text-spert-blue dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors cursor-pointer"
      >
        Got it
      </button>
    </div>
  )
}
