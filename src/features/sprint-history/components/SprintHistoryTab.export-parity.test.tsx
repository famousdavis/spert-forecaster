// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The export check and Sprint History agree on what is bad (Brief 38 PR C).
 *
 * The export check names ONE refusal per project: the validator stops at its
 * first error, walking the file's sprints in ARRAY order. Sprint History marks
 * EVERY bad sprint, in sprint-number order. The seed's sprints are stored in
 * sprint order, so "the first" is the same sprint for both.
 *
 * ⚠️ Imports only modules that existed before PR C (see the fixture).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { SprintHistoryTab } from './SprintHistoryTab'
import { useProjectStore } from '@/shared/state/project-store'
import { checkExportedFile } from '@/shared/state/export-check'
import { T, seedStores } from '@/shared/state/fixtures/bad-sprint-dates'

const rowText = (k: number) =>
  screen.queryByRole('button', { name: `Edit Sprint ${k}` })?.closest('tr')?.querySelectorAll('td')[1]?.textContent ?? null

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('P13 (v) the export check and Sprint History agree on what is bad', () => {
  it('two_bad: the warning names the first marked sprint; Sprint History marks both', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seedStores('two_bad')
    render(<TooltipProvider><ErrorBoundary><SprintHistoryTab /></ErrorBoundary></TooltipProvider>)

    const { projects, sprints } = useProjectStore.getState()
    expect(sprints.map((s) => s.sprintNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // stored in sprint order
    const result = checkExportedFile(JSON.stringify({ version: '1.0', exportedAt: T, projects, sprints, _originRef: 'o', _storageRef: 'w' }))
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.items.map((item) => ('sprintNumber' in item ? item.sprintNumber : null))).toEqual([3])

    expect(rowText(3)).toContain('⚠')
    expect(rowText(5)).toContain('⚠')
  })
})
