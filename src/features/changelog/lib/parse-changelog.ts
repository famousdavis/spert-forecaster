// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Parse CHANGELOG.md into structured data for the changelog page.
// This makes CHANGELOG.md the single source of truth — no hardcoded array to maintain.

export interface ChangelogEntry {
  version: string
  date: string
  sections: {
    title: string
    items: string[]
  }[]
}

/**
 * Parse a CHANGELOG.md string into an array of structured entries.
 *
 * Expected format:
 *   ## vX.Y.Z - YYYY-MM-DD
 *   ### Section Title
 *   - Item text (may include **bold**, `code`, links, etc.)
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let currentEntry: ChangelogEntry | null = null
  let currentSection: { title: string; items: string[] } | null = null

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd()

    // Version heading: ## vX.Y.Z - YYYY-MM-DD
    const versionMatch = line.match(/^## v(\d+\.\d+\.\d+)\s*-\s*(\d{4}-\d{2}-\d{2})/)
    if (versionMatch) {
      // Flush previous section/entry
      if (currentSection && currentEntry) {
        currentEntry.sections.push(currentSection)
      }
      if (currentEntry) {
        entries.push(currentEntry)
      }
      currentEntry = {
        version: versionMatch[1],
        date: versionMatch[2],
        sections: [],
      }
      currentSection = null
      continue
    }

    // Section heading: ### Title
    const sectionMatch = line.match(/^### (.+)/)
    if (sectionMatch && currentEntry) {
      if (currentSection) {
        currentEntry.sections.push(currentSection)
      }
      currentSection = { title: sectionMatch[1], items: [] }
      continue
    }

    // List item: - text (strip leading ** bold ** prefixes and markdown formatting for clean display)
    const itemMatch = line.match(/^- (.+)/)
    if (itemMatch && currentSection) {
      currentSection.items.push(stripMarkdown(itemMatch[1]))
      continue
    }
  }

  // Flush final section/entry
  if (currentSection && currentEntry) {
    currentEntry.sections.push(currentSection)
  }
  if (currentEntry) {
    entries.push(currentEntry)
  }

  return entries
}

/**
 * Strip markdown formatting for clean plain-text display:
 * - **bold text**: bold prefix → plain text (e.g. "**Foo**: bar" → "Foo: bar")
 * - `code`: backtick code → plain text
 * - Leaves everything else (em-dashes, arrows, quotes) as-is
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold** → bold
    .replace(/`([^`]+)`/g, '$1')          // `code` → code
}
