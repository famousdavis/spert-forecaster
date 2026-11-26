// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

/**
 * The outermost crash screen (v0.53.0, FRAME26 clean-up E; contract §7, "Errors"): what the root layout's boundary
 * shows when the frame itself, a provider or a notice fails. It stays OUTSIDE the frame on purpose: drawn inside it, a
 * fault in the frame would take the crash screen down too. It uses the page ground (#ffffff / #101828) and the frame's
 * heading and muted text colours, following the app's own theme (the `dark` class on <html>, set before the first
 * frame by the layout's script), and offers a reload. One wording in every SPERT® app that has one (William,
 * 2026-11-26). Until v0.53.0 Forecaster had none: such a fault left Next's "Application error: a client-side exception
 * has occurred" page, with no way back but the browser's own reload.
 */
export function AppCrashScreen() {
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
