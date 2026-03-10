// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest'
import { parseChangelog } from './parse-changelog'

describe('parseChangelog', () => {
  it('parses a single version entry', () => {
    const md = `# Changelog

## v1.0.0 - 2026-01-15

### Features

- First feature
- Second feature
`
    const entries = parseChangelog(md)
    expect(entries).toHaveLength(1)
    expect(entries[0].version).toBe('1.0.0')
    expect(entries[0].date).toBe('2026-01-15')
    expect(entries[0].sections).toHaveLength(1)
    expect(entries[0].sections[0].title).toBe('Features')
    expect(entries[0].sections[0].items).toEqual(['First feature', 'Second feature'])
  })

  it('parses multiple versions in order', () => {
    const md = `# Changelog

## v2.0.0 - 2026-02-01

### New

- Something new

## v1.0.0 - 2026-01-01

### Initial

- Initial release
`
    const entries = parseChangelog(md)
    expect(entries).toHaveLength(2)
    expect(entries[0].version).toBe('2.0.0')
    expect(entries[1].version).toBe('1.0.0')
  })

  it('parses multiple sections per version', () => {
    const md = `## v1.0.0 - 2026-01-01

### Bug Fixes

- Fix one
- Fix two

### Enhancements

- Enhancement one
`
    const entries = parseChangelog(md)
    expect(entries[0].sections).toHaveLength(2)
    expect(entries[0].sections[0].title).toBe('Bug Fixes')
    expect(entries[0].sections[0].items).toHaveLength(2)
    expect(entries[0].sections[1].title).toBe('Enhancements')
    expect(entries[0].sections[1].items).toHaveLength(1)
  })

  it('strips **bold** markdown from items', () => {
    const md = `## v1.0.0 - 2026-01-01

### Features

- **Bold prefix**: some description
- Normal item with **bold** in the middle
`
    const entries = parseChangelog(md)
    expect(entries[0].sections[0].items[0]).toBe('Bold prefix: some description')
    expect(entries[0].sections[0].items[1]).toBe('Normal item with bold in the middle')
  })

  it('strips `backtick` code formatting from items', () => {
    const md = `## v1.0.0 - 2026-01-01

### Refactoring

- Extracted \`useForecastState\` hook (410 → 186 LOC)
- Removed dead \`milestoneTotal\` from \`useForecastInputs\`
`
    const entries = parseChangelog(md)
    expect(entries[0].sections[0].items[0]).toBe('Extracted useForecastState hook (410 → 186 LOC)')
    expect(entries[0].sections[0].items[1]).toBe('Removed dead milestoneTotal from useForecastInputs')
  })

  it('returns empty array for empty or header-only input', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('# Changelog\n\nSome intro text')).toEqual([])
  })

  it('handles version with no sections', () => {
    const md = `## v1.0.0 - 2026-01-01

## v0.9.0 - 2025-12-01

### Features

- Something
`
    const entries = parseChangelog(md)
    expect(entries).toHaveLength(2)
    expect(entries[0].version).toBe('1.0.0')
    expect(entries[0].sections).toHaveLength(0)
    expect(entries[1].sections).toHaveLength(1)
  })

  it('preserves special characters in items', () => {
    const md = `## v1.0.0 - 2026-01-01

### Features

- Percentile sliders step by 5 (range P5–P95)
- Using the X distribution, there is a Y% chance…
- Arrow → test and em-dash — test
`
    const entries = parseChangelog(md)
    const items = entries[0].sections[0].items
    expect(items[0]).toContain('P5–P95')
    expect(items[2]).toContain('→')
    expect(items[2]).toContain('—')
  })
})
