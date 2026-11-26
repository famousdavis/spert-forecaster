// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SD-6, end to end: a Story Map send the user REPLACES an existing project
 * with keeps that project's productivity adjustments, project dates and unit
 * of measure — by file and by crosslink alike, through the real seam
 * (`ingestPayload` → preview → the user's Replace → `handleConfirmMerge`).
 *
 * The existing project holds a sprint the send lacks, so Update is withheld
 * (§4.1) and Replace is the user's only way to take the new progress — the
 * situation that erased adjustments before v0.52.2.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useImportState } from './useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import type { Project, Sprint } from '@/shared/types'

const T0 = '2026-01-01T00:00:00.000Z'
const PID = 'prod-growth'

const EXISTING: Project = {
  id: PID,
  name: 'Growth Product',
  unitOfMeasure: 'Hours',
  projectStartDate: '2026-01-05',
  projectFinishDate: '2026-12-18',
  sprintCadenceWeeks: 2,
  firstSprintStartDate: '2026-01-05',
  productivityAdjustments: [{
    id: 'adj-1', name: 'Holiday', startDate: '2026-12-21', endDate: '2027-01-01',
    factor: 0.4, enabled: true, createdAt: T0, updatedAt: T0,
  }],
  milestones: [],
  createdAt: T0,
  updatedAt: T0,
}

function sprint(id: string, n: number): Sprint {
  return {
    id, projectId: PID, sprintNumber: n, sprintStartDate: '2026-01-05', sprintFinishDate: '2026-01-16',
    doneValue: 10, includedInForecast: true, createdAt: T0, updatedAt: T0,
  }
}

/** Shaped as Story Map's `buildForecasterExport` writes it. */
const SEND = JSON.stringify({
  version: '1.0',
  exportedAt: '2026-11-20T00:00:00.000Z',
  source: 'spert-story-map',
  milestoneBacklog: 'remaining',
  projects: [{
    id: PID, name: 'Growth Product', unitOfMeasure: 'Story Points', createdAt: T0, updatedAt: T0,
    sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-05',
  }],
  sprints: [
    { ...sprint('sp-1', 1), doneValue: 12 },
    { ...sprint('sp-2', 2), sprintStartDate: '2026-01-19', sprintFinishDate: '2026-01-30', doneValue: 14 },
  ],
})

beforeEach(() => {
  localStorage.clear()
  useProjectStore.setState({
    projects: [EXISTING],
    // sp-LOCAL is not in the send, so Update is withheld (§4.1).
    sprints: [sprint('sp-1', 1), sprint('sp-LOCAL', 2)],
    viewingProjectId: null, forecastInputs: {}, burnUpConfigs: {},
    _originRef: '', _changeLog: [], cloudDataLoaded: false,
  })
})

describe.each(['file', 'crosslink'] as const)('SD-6 end to end (%s)', (transport) => {
  it('Replace takes Story Map\'s sprints and keeps the adjustments, project dates and unit', async () => {
    const { result } = renderHook(() => useImportState())
    await act(async () => { await result.current.ingestPayload(SEND, transport) })
    const preview = result.current.importPreview
    expect(preview, 'a conflict opens the preview').toBeTruthy()
    // Update is withheld, so the default is the safe skip.
    expect(preview!.decisions.get(PID)).toBe('skip')

    act(() => { result.current.onDecisionChange(PID, 'replace') })
    await act(async () => { result.current.handleConfirmMerge() })

    const { projects, sprints } = useProjectStore.getState()
    expect(projects).toHaveLength(1)
    const p = projects[0]
    expect(sprints.map((s) => s.id).sort()).toEqual(['sp-1', 'sp-2'])
    expect(p.productivityAdjustments).toEqual(EXISTING.productivityAdjustments)
    expect([p.projectStartDate, p.projectFinishDate, p.unitOfMeasure]).toEqual(['2026-01-05', '2026-12-18', 'Hours'])
    expect(result.current.importBanner?.text).toMatch(/1 replaced/)
  })
})
