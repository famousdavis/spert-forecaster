// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { Project } from '@/shared/types'
import type { DerivedSprintData } from '@/shared/lib/forecast-derivations'
import { isValidIsoDate } from '@/shared/lib/dates'
import { firstDateNotice, groupBySprint, spillFix, spillSentence, storedDatesNotice } from '@/shared/lib/sprint-date-texts'

/**
 * Sprint History's notice, in up to three blocks: a refused first sprint date
 * (D14), every refused stored sprint date (D12), and resolved dates past
 * December 31, 9999 (D15, D16). Each block's first line is its heading.
 */
export function SprintDateNotice({ project, data }: { project: Project; data: DerivedSprintData }) {
  const first = project.firstSprintStartDate
  const firstDateRefused = first !== undefined && !isValidIsoDate(first)
  const spill = data.resolvedDateSpill
  const blocks: string[][] = []
  if (firstDateRefused) blocks.push(firstDateNotice(first, data.projectSprints.length > 0))
  const stored = storedDatesNotice(groupBySprint(data.invalidStoredDates), {
    scheduleUsable: data.scheduleUsable,
    firstDateRefused,
    standardFinish: (n) => data.resolvedSprintDates?.get(n)?.finishDate,
    ownDatesPastMax: (n) => spill?.spilledSprints.includes(n) ?? false,
    spill,
  })
  if (stored) blocks.push(stored)
  if (spill) blocks.push([spillSentence(spill, data.completedSprintCount, first ?? ''), spillFix(spill)])
  if (blocks.length === 0) return null
  return (
    <div
      role="status"
      className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-spert-text dark:text-gray-100 space-y-2"
    >
      {blocks.map((lines) => (
        <div key={lines[0]}>
          <p className="font-semibold">{lines[0]}</p>
          {lines.slice(1).map((line) => <p key={line}>{line}</p>)}
        </div>
      ))}
    </div>
  )
}
