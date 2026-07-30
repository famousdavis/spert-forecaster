// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * `public/CHANGELOG.md` is a static copy of the root `CHANGELOG.md`, served at
 * /CHANGELOG.md on the deployed site.
 *
 * Nothing in the app reads it — the changelog page reads the root file at build
 * time via `readFileSync` in `src/app/changelog/page.tsx` — so no build, type
 * check, lint run or other test touches the public copy. It can rot
 * indefinitely without anyone noticing, and it did: it fell four releases
 * behind before being resynced in v0.38.1. SPERT Scheduler had the same defect
 * at a far worse scale — its copy was stranded for 43 releases and served a
 * five-month-old changelog — which is what prompted guarding it there first,
 * in that repo's `changelog-public-sync.test.ts`.
 *
 * This test is what holds the two files together, since nothing else can.
 *
 * If this fails, the fix is: cp CHANGELOG.md public/CHANGELOG.md
 */
describe('CHANGELOG.md ↔ public/CHANGELOG.md sync', () => {
  const rootPath = join(process.cwd(), 'CHANGELOG.md')
  const publicPath = join(process.cwd(), 'public/CHANGELOG.md')

  it('both the root changelog and its public copy exist', () => {
    expect(existsSync(rootPath)).toBe(true)
    expect(existsSync(publicPath)).toBe(true)
  })

  it('the public copy is byte-identical to the root changelog', () => {
    const rootBuf = readFileSync(rootPath)
    const publicBuf = readFileSync(publicPath)

    if (!rootBuf.equals(publicBuf)) {
      const newestHeading = (buf: Buffer): string =>
        buf.toString('utf-8').match(/^## .*$/m)?.[0] ?? '(no version heading found)'

      throw new Error(
        'public/CHANGELOG.md has drifted from CHANGELOG.md.\n' +
          `  root:   ${rootBuf.length} bytes, newest entry ${newestHeading(rootBuf)}\n` +
          `  public: ${publicBuf.length} bytes, newest entry ${newestHeading(publicBuf)}\n` +
          'Fix with: cp CHANGELOG.md public/CHANGELOG.md',
      )
    }

    expect(publicBuf.equals(rootBuf)).toBe(true)
  })
})
