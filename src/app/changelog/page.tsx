// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Link from 'next/link'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseChangelog } from '@/features/changelog/lib/parse-changelog'
import { ChangelogContent } from '@/features/changelog'

export default function ChangelogPage() {
  const markdown = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8')
  const entries = parseChangelog(markdown)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to SPERT Forecaster
          </Link>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 py-6">
        <ChangelogContent entries={entries} />
      </main>
    </div>
  )
}
