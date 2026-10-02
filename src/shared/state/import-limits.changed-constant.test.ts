// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * ONE STATEMENT PER LIMIT. With import-limits.ts mocked to different values,
 * every site that enforces those limits must follow them — the validator's
 * per-file milestone limit, the refusal reasons, the export check's size check,
 * and both of the importer's size gates. A site holding its own literal stays
 * at the old number and fails here.
 *
 * (The importer's two size refusals keep their registered "10 MB" wording: they
 * are pinned by substring in the Story Map contract register. The GATE follows
 * the constant; that is what this checks.)
 */
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('./import-limits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./import-limits')>()),
  STORY_MAP_MILESTONE_LIMIT: 3,
  MILESTONE_CEILING: 7,
  MAX_FILE_SIZE: 1024 * 1024,
}))

import { validateImportData } from './import-validation'
import { checkExportedFile } from './export-check'
import { useImportState } from '@/features/projects/hooks/useImportState'

const milestones = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `m${k}`, name: `M${k}`, backlogSize: 1, color: '#000' }))
const file = (n: number, envelope: Record<string, unknown>) =>
  ({ ...envelope, projects: [{ id: 'p', name: 'P', unitOfMeasure: 'pts', milestones: milestones(n) }], sprints: [] })
const STORY_MAP = { source: 'spert-story-map' }
const OWN = { _originRef: 'origin-token', _storageRef: 'storage-token' }
const verdict = (p: unknown) => { try { validateImportData(p); return 'accepted' } catch (e) { return (e as Error).message } }

describe('changed limits reach every enforcing site', () => {
  it('the validator\'s per-file milestone limit', () => {
    expect(verdict(file(3, STORY_MAP))).toBe('accepted')
    expect(verdict(file(4, STORY_MAP))).toBe('Project at index 0 has more than 3 milestones.')
    expect(verdict(file(7, OWN))).toBe('accepted')
    expect(verdict(file(8, OWN))).toBe('Project at index 0 has more than 7 milestones.')
  })

  it('the export check and its reasons', () => {
    const result = checkExportedFile(JSON.stringify(file(8, OWN)))
    expect(result).toEqual({ ok: false, items: [{ kind: 'project', name: 'P', sprintNumber: undefined, reason: '8 milestones; a file from this app holds at most 7' }] })
    const big = JSON.stringify({ ...file(1, OWN), padding: 'x'.repeat(1024 * 1024) })
    expect(checkExportedFile(big)).toEqual({ ok: false, items: [{ kind: 'file', reason: 'the file is 1.1 MB; an import accepts at most 1 MB' }] })
  })

  it('both of the importer\'s size gates', async () => {
    const big = JSON.stringify({ ...file(1, OWN), padding: 'x'.repeat(1024 * 1024) })
    const { result } = renderHook(() => useImportState())
    let out: { nackReason?: string } | undefined
    await act(async () => { out = await result.current.ingestPayload(big, 'crosslink') })
    expect(out?.nackReason).toBe('Import failed: The project data exceeds the 10 MB limit')
    act(() => {
      result.current.handleFileChange({ target: { files: [new File([big], 'big.json', { type: 'application/json' })] } } as never)
    })
    expect(result.current.importBanner?.text).toBe('Import failed: File exceeds the 10 MB limit')
  })
})
