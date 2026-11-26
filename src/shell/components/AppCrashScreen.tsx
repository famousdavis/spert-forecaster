// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useLayoutEffect } from 'react'
import { applyStoredTheme } from '@/shared/hooks/useTheme'

/**
 * The outermost crash screen (v0.53.0, FRAME26 clean-up E; contract §7, "Errors"): what the root layout's boundary
 * shows when the frame itself, a provider or a notice fails. It stays OUTSIDE the frame on purpose: drawn inside it, a
 * fault in the frame would take the crash screen down too. It uses the page ground (#ffffff / #101828) and the frame's
 * heading and muted text colours, following the app's own theme (the `dark` class on <html>, which it re-applies from
 * the stored preference, since nothing else is left to), and offers a reload. One wording in every SPERT® app that has one (William,
 * 2026-11-26). Until v0.53.0 Forecaster had none: such a fault left Next's "Application error: a client-side exception
 * has occurred" page, with no way back but the browser's own reload.
 */
export function AppCrashScreen() {
  // The theme switch is gone with the frame, and a crash while the page hydrates renders the document again without
  // the `dark` class the pre-paint script set (measured on a forced crash: light in dark mode). Put it back, before paint.
  useLayoutEffect(() => {
    applyStoredTheme()
  }, [])
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8 text-center dark:bg-[#101828]">
      <h1 className="mb-2 text-xl font-bold text-[#333333] dark:text-[#e2e8f0]">Something went wrong</h1>
      <p className="mb-4 text-[#6a7282] dark:text-[#99a1af]">
        SPERT<span className="sf-mark">®</span> Forecaster could not display this page. Reload to try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 cursor-pointer"
      >
        Reload
      </button>
    </div>
  )
}
