// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * An import that is still refused names the project the refusal belongs to —
 * the same text by file and by crosslink (transport may change wording only, and
 * here it changes nothing). The crosslink sender shows this text after its own
 * prefix, so it must stand on its own.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useImportState } from './useImportState'
import { useProjectStore } from '@/shared/state/project-store'

const T = '2026-01-01T00:00:00.000Z'
const project = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, unitOfMeasure: 'pts', createdAt: T, updatedAt: T, ...extra })

async function refusal(payload: unknown, transport: 'file' | 'crosslink') {
  const { result } = renderHook(() => useImportState())
  let out: { didApply: boolean; nackReason?: string } | undefined
  await act(async () => { out = await result.current.ingestPayload(JSON.stringify(payload), transport) })
  return { nack: out?.nackReason, banner: result.current.importBanner?.text }
}

beforeEach(() => {
  localStorage.clear()
  useProjectStore.setState({ projects: [], sprints: [], viewingProjectId: null, _originRef: '', _changeLog: [] })
})

describe('ingestPayload names the project behind a refusal', () => {
  it.each(['file', 'crosslink'] as const)('a sprint refusal names THAT sprint\'s project (%s)', async (t) => {
    // sprints[0] belongs to "Second"; projects[0] is "First", which is valid.
    const payload = {
      version: '1.0', exportedAt: T,
      projects: [project('first', 'First'), project('second', 'Second')],
      sprints: [{ id: 's', projectId: 'second', sprintNumber: 1, doneValue: 1, includedInForecast: true, sprintFinishDate: '20276-09-04', customFinishDate: '20276-09-04' }],
    }
    const text = 'Import failed: "Second", sprint 1 — Finish Date "20276-09-04" is not a valid date.'
    expect(await refusal(payload, t)).toEqual({ nack: text, banner: text })
  })

  it.each(['file', 'crosslink'] as const)('a project refusal uses the approved template (%s)', async (t) => {
    const milestones = Array.from({ length: 13 }, (_, k) => ({ id: `m${k}`, name: `M${k}`, backlogSize: 1, color: '#000' }))
    const payload = { version: '1.0', source: 'spert-story-map', projects: [project('g', 'Growth Product', { milestones })], sprints: [] }
    const text = 'Import failed: "Growth Product" — 13 milestones; this file can hold at most 10 per project.'
    expect(await refusal(payload, t)).toEqual({ nack: text, banner: text })
  })

  it.each(['file', 'crosslink'] as const)('an unattributable refusal keeps the validator\'s text (%s)', async (t) => {
    const payload = { projects: [project('x', 'A'), project('x', 'B')], sprints: [] }
    const text = 'Import failed: Duplicate project ID "x" found at index 1.'
    expect(await refusal(payload, t)).toEqual({ nack: text, banner: text })
  })
})
