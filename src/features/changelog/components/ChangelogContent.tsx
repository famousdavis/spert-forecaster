// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { cn } from '@/lib/utils'
import { formatDateLong } from '@/shared/lib/dates'
import type { ChangelogEntry } from '@/features/changelog/lib/parse-changelog'

interface ChangelogContentProps {
  entries: ChangelogEntry[]
}

export function ChangelogContent({ entries }: ChangelogContentProps) {
  return (
    <div className="space-y-10 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Changelog</h1>
        <p className="text-muted-foreground italic">
          Release history for SPERT® Forecaster
        </p>
      </div>

      {entries.map((entry, entryIndex) => (
        <section
          key={entry.version}
          className={cn(
            'space-y-4',
            entryIndex < entries.length - 1 && 'pb-6 border-b border-spert-border-light'
          )}
        >
          <div className="flex items-baseline gap-3">
            <h2
              className="font-semibold text-lg text-spert-blue"
            >
              v{entry.version}
            </h2>
            <span className="text-sm text-muted-foreground">{formatDateLong(entry.date)}</span>
          </div>

          {entry.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="space-y-2">
              <h3
                className="font-medium text-[0.925rem] text-spert-text"
              >
                {section.title}
              </h3>
              <ul className="list-disc text-sm text-muted-foreground space-y-1 pl-5">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
