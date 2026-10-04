// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { ForecastDateBlock } from '@/shared/lib/forecast-derivations'
import { forecastBlockedNotice } from '@/shared/lib/sprint-date-texts'

interface ForecastDateBlockNoticeProps {
  block: ForecastDateBlock
  lastSprintNumber: number
  onGoToSprintHistory?: () => void
}

/** In place of the results while a date the forecast uses is bad (D12, D14). */
export function ForecastDateBlockNotice({ block, lastSprintNumber, onGoToSprintHistory }: ForecastDateBlockNoticeProps) {
  const [notice, fix] = forecastBlockedNotice(block, lastSprintNumber)
  return (
    <div
      role="status"
      className="mt-6 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-spert-text dark:text-gray-100"
    >
      <p>{notice}</p>
      <p className="mt-1">{fix}</p>
      {onGoToSprintHistory && (
        <button
          type="button"
          onClick={onGoToSprintHistory}
          className="mt-2 px-3 py-1 bg-spert-blue text-white border-0 rounded text-sm font-medium cursor-pointer"
        >
          Go to Sprint History
        </button>
      )}
    </div>
  )
}
