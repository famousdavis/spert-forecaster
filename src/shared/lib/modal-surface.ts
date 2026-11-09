// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Modal surfaces: the overlays that block the page behind them (v0.48.1).
//
// Each one spreads `modalSurfaceProps` onto its overlay root. The page shortcuts
// (`useKeyboardShortcuts`) ask `isModalSurfaceOpen()` at KEY TIME and wait while it
// is true. Before v0.48.1 a digit key pressed inside the Delete Project dialog
// switched the tab behind it, which unmounted the dialog and dropped focus to the
// page. Reading the DOM at key time keeps the answer in step with what is shown,
// with no open/close bookkeeping for a dialog to forget.
//
// ⚠️ A new modal (`aria-modal="true"`) must carry the marker too.
// `modal-surface.test.ts` scans the source and goes red when one does not.

export const MODAL_SURFACE_ATTR = 'data-modal-surface'

/** Spread onto a modal surface's overlay root. */
export const modalSurfaceProps = { [MODAL_SURFACE_ATTR]: '' } as const

export function isModalSurfaceOpen(doc: Document = document): boolean {
  return doc.querySelector(`[${MODAL_SURFACE_ATTR}]`) !== null
}
