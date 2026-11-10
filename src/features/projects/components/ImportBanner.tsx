// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import type { ImportBannerState } from '../hooks/useImportState'

/**
 * What the last import did, on the Projects tab: an alert for an error, a status otherwise, with
 * its details listed and a × to dismiss. Moved out of ProjectsTab.tsx unchanged in v0.49.0,
 * apart from its `mt-6`, which keeps 24 px above it (see ProjectsTab's spacing note).
 */
export function ImportBanner({ banner, onDismiss }: { banner: ImportBannerState; onDismiss: () => void }) {
  return (
    <div
      role={banner.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'mt-6 flex justify-between rounded border px-4 py-3 text-sm',
        banner.details?.length ? 'items-start' : 'items-center',
        banner.kind === 'error'
          ? 'border-[#e53e3e] bg-[#fff3f3] text-spert-error-dark dark:bg-red-900/20 dark:text-red-100'
          : 'border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-900/30 dark:text-green-100',
      )}
    >
      <div className="min-w-0">
        <span>{banner.text}</span>
        {banner.details && banner.details.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {banner.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="border-none bg-transparent cursor-pointer font-bold text-base"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
