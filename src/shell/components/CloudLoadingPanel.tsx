// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { StorageMode } from '@/shared/firebase/types'
import type { TabId } from './TabNavigation'

// The tabs that show or edit project data. Settings and About stay usable while
// the cloud loads: Settings holds sign-out and the storage mode.
export const PROJECT_DATA_TABS: ReadonlySet<TabId> = new Set<TabId>(['projects', 'sprint-history', 'forecast'])

/**
 * TRUE while the project tabs must wait (Brief 40, R2): cloud mode, and either
 * auth is still resolving (useCloudSync has not started) or a signed-in user's
 * first cloud load has not succeeded.
 */
export function awaitsFirstCloudLoad(s: {
  mode: StorageMode
  authLoading: boolean
  signedIn: boolean
  cloudDataLoaded: boolean
}): boolean {
  return s.mode === 'cloud' && (s.authLoading || (s.signedIn && !s.cloudDataLoaded))
}

// Owner-approved wording (Brief 40). Change it only with the owner.
export const PANEL_TEXT = {
  loading: 'Loading your projects from the cloud…',
  waitingLead: 'Waiting for the cloud.',
  waitingBody: 'Your projects will appear here once the connection is back; you can keep this tab open.',
  errorLead: "Your projects couldn't be loaded from the cloud.",
  refusedReason: "The cloud refused this account's request.",
  otherReason: (code: string) => `Something went wrong while reading them (${code}).`,
  notAffected: 'Your projects in the cloud are not affected.',
  contactBefore: 'If this keeps happening, tell us through the contact form at ',
  contactLink: 'spertsuite.com/contact',
  contactAfter: '.',
  tryAgain: 'Try again',
  exportBackup: 'Export a backup',
} as const

const CONTACT_URL = 'https://spertsuite.com/contact'
const REFUSED_CODES: ReadonlySet<string> = new Set(['permission-denied', 'unauthenticated'])

/** The error panel's reason sentence for a failed first load's code. */
export function errorReason(code: string): string {
  return REFUSED_CODES.has(code) ? PANEL_TEXT.refusedReason : PANEL_TEXT.otherReason(code)
}

interface CloudLoadingPanelProps {
  /** A transient failure: the load is being retried. */
  retrying: boolean
  /** Any other failure, waiting for Try again. Wins over `retrying`. */
  error: { code: string } | null
  onTryAgain: () => void
  onExportBackup: () => void
}

const buttonClass =
  'px-3 py-1.5 text-sm font-medium rounded border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700 text-spert-text dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer'

/**
 * Shown in place of the Projects, Sprint History and Forecast tabs while cloud
 * mode is on and the first cloud load has not yet succeeded (Brief 40). Until
 * then this browser holds only its own last copy, which may be stale, and an
 * edit made to it would be written over newer work. During an attempt started
 * by Try again the panel keeps its wording; a press while an attempt is in
 * flight does nothing.
 */
export function CloudLoadingPanel({ retrying, error, onTryAgain, onExportBackup }: CloudLoadingPanelProps) {
  const failed = error !== null || retrying
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto mt-12 max-w-md rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-600 dark:text-gray-300"
    >
      {error !== null && (
        <p data-testid="cloud-load-message">
          <strong className="font-medium text-gray-800 dark:text-gray-100">{PANEL_TEXT.errorLead}</strong>{' '}
          {errorReason(error.code)} {PANEL_TEXT.notAffected} {PANEL_TEXT.contactBefore}
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="underline text-spert-blue dark:text-blue-400">
            {PANEL_TEXT.contactLink}
          </a>
          {PANEL_TEXT.contactAfter}
        </p>
      )}
      {error === null && retrying && (
        <p data-testid="cloud-load-message">
          <strong className="font-medium text-gray-800 dark:text-gray-100">{PANEL_TEXT.waitingLead}</strong>{' '}
          {PANEL_TEXT.waitingBody}
        </p>
      )}
      {!failed && <p data-testid="cloud-load-message">{PANEL_TEXT.loading}</p>}
      {failed && (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onTryAgain} className={buttonClass}>
            {PANEL_TEXT.tryAgain}
          </button>
          <button type="button" onClick={onExportBackup} className={buttonClass}>
            {PANEL_TEXT.exportBackup}
          </button>
        </div>
      )}
    </div>
  )
}
