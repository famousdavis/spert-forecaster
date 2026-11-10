// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Tile colour and archive through an import (v0.50.0), through the real hook and store, by file
// and by crosslink:
// - D34: entries follow the project id. A project new to this browser arrives with none; one that
//   keeps its id keeps its entry. No import clears entries.
// - D36: a name-conflict replace moves the displaced project's entry to the replacing id, exactly
//   (the target's own entry goes when the source has none), and only when the import succeeds.
// - D35 (and C-3): the message names every project the import wrote that is archived afterwards,
//   in the same words by file and by crosslink. Files themselves carry neither (D29).

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useImportState } from './useImportState'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { buildProjectSubsetExport } from '../lib/export-project'
import type { ProjectPrefs } from '@/shared/lib/project-prefs'
import type { ConflictAction } from '@/shared/state/import-utils'
import type { Project } from '@/shared/types'

type Transport = 'file' | 'crosslink'
const TRANSPORTS: readonly Transport[] = ['file', 'crosslink']
const T0 = '2026-01-01T00:00:00.000Z'
const project = (id: string, name: string): Project => ({ id, name, unitOfMeasure: 'pts', createdAt: T0, updatedAt: T0 })
const prefs = () => useSettingsStore.getState().projectPrefs

/** A Story Map send for one project (its real exporter's shape; see own-file-roundtrip.test.ts). */
function storyMapSend(projectId: string, name: string): string {
  return JSON.stringify({
    version: '1.0',
    exportedAt: '2026-10-02T00:00:00.000Z',
    source: 'spert-story-map',
    milestoneBacklog: 'remaining',
    projects: [{ id: projectId, name, unitOfMeasure: 'Story Points', createdAt: T0, updatedAt: T0, sprintCadenceWeeks: 2, firstSprintStartDate: '2026-01-01', milestones: [] }],
    sprints: [{ id: `${projectId}-sp1`, projectId, sprintNumber: 1, sprintStartDate: '2026-01-01', sprintFinishDate: '2026-01-14', doneValue: 0, backlogAtSprintEnd: 10, includedInForecast: true, createdAt: T0, updatedAt: T0 }],
  })
}

/** This app's own project file for these projects. */
function ownFile(projects: Project[]): string {
  return JSON.stringify(
    buildProjectSubsetExport(projects.map((p) => p.id), { projects, sprints: [], originRef: 'o', storageRef: 's', changeLog: [] }),
  )
}

/** Ingest, then (if a preview opened) apply it with these decisions, or as Replace all. */
async function ingest(content: string, transport: Transport, opts: { decide?: Record<string, ConflictAction>; replaceAll?: boolean; beforeApply?: () => void } = {}) {
  const { result } = renderHook(() => useImportState())
  await act(async () => {
    await result.current.ingestPayload(content, transport)
  })
  if (result.current.importPreview) {
    if (opts.replaceAll) {
      await act(async () => result.current.onModeChange('replace-all'))
      await act(async () => result.current.handleConfirmReplaceAll())
    } else {
      for (const [id, action] of Object.entries(opts.decide ?? {})) {
        await act(async () => result.current.onDecisionChange(id, action))
      }
      opts.beforeApply?.()
      await act(async () => result.current.handleConfirmMerge())
    }
  }
  return result.current.importBanner
}

function seed(projects: Project[], projectPrefs: ProjectPrefs) {
  useProjectStore.setState({ projects, sprints: [], viewingProjectId: null, forecastInputs: {}, burnUpConfigs: {}, _originRef: 'o', _changeLog: [] })
  useSettingsStore.setState({ projectPrefs, _isCloudUpdate: false })
}

beforeEach(() => {
  localStorage.clear()
  seed([], {})
})

describe.each(TRANSPORTS)('by %s', (transport) => {
  it('D34: a project new to this browser arrives uncoloured and unarchived, and the message has no archived note', async () => {
    seed([project('a', 'Alpha')], { a: { color: 'teal', archived: true } })
    const banner = await ingest(ownFile([project('fresh', 'Fresh')]), transport)
    expect(banner?.kind).toBe('success')
    expect(prefs()).toEqual({ a: { color: 'teal', archived: true } })
    expect(banner?.details ?? []).not.toContainEqual(expect.stringMatching(/is archived/))
  })

  it('D34: an id-conflict replace (re-importing your own file) keeps the entry; D35 names it', async () => {
    seed([project('a', 'Alpha'), project('b', 'Bravo')], { a: { color: 'teal', archived: true }, b: { color: 'pink' } })
    const banner = await ingest(ownFile([project('a', 'Alpha'), project('b', 'Bravo')]), transport, { decide: { a: 'replace', b: 'replace' } })
    expect(prefs()).toEqual({ a: { color: 'teal', archived: true }, b: { color: 'pink' } })
    expect(banner?.details).toContain('"Alpha" is archived: Show archived lists it.')
    expect(banner?.details).not.toContain('"Bravo" is archived: Show archived lists it.')
  })

  it('D35: a Story Map Update into an archived project leaves it archived, and the message says so', async () => {
    await ingest(storyMapSend('sm-1', 'Growth'), transport) // added (fast path, no preview)
    useSettingsStore.getState().setProjectArchived('sm-1', true)
    useSettingsStore.getState().setProjectColor('sm-1', 'purple')
    const banner = await ingest(storyMapSend('sm-1', 'Growth'), transport) // preview, defaults to update
    expect(banner?.text).toMatch(/1 updated/)
    expect(prefs()).toEqual({ 'sm-1': { color: 'purple', archived: true } })
    expect(banner?.details).toContain('"Growth" is archived: Show archived lists it.')
  })

  it('D36: a name-conflict replace moves the entry to the replacing id, exactly', async () => {
    seed([project('old', 'Alpha')], { old: { color: 'slate', archived: true } })
    const banner = await ingest(ownFile([project('new', 'Alpha')]), transport, { decide: { new: 'replace' } })
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['new'])
    expect(prefs()).toEqual({ new: { color: 'slate', archived: true } })
    expect(banner?.details).toContain('"Alpha" is archived: Show archived lists it.')
  })

  it("D36: the replacing id's own orphan entry goes when the displaced project had none (C-4)", async () => {
    seed([project('old', 'Alpha')], { new: { color: 'pink', archived: true } })
    const banner = await ingest(ownFile([project('new', 'Alpha')]), transport, { decide: { new: 'replace' } })
    expect(prefs()).toEqual({})
    expect(banner?.details ?? []).not.toContainEqual(expect.stringMatching(/is archived/))
  })

  it('D36: nothing moves when the import is refused (the workspace changed under the preview)', async () => {
    seed([project('old', 'Alpha'), project('x', 'Xray')], { old: { color: 'slate', archived: true }, new: { color: 'pink' } })
    const banner = await ingest(ownFile([project('new', 'Alpha')]), transport, {
      decide: { new: 'replace' },
      beforeApply: () => useProjectStore.setState({ projects: [project('x', 'Xray')] }),
    })
    expect(banner?.kind).toBe('error')
    expect(prefs()).toEqual({ old: { color: 'slate', archived: true }, new: { color: 'pink' } })
  })

  it('D35: an add whose id already has an entry here is named', async () => {
    seed([project('a', 'Alpha')], { back: { archived: true } })
    const banner = await ingest(ownFile([project('back', 'Back Again')]), transport)
    expect(prefs()).toEqual({ back: { archived: true } })
    expect(banner?.details).toContain('"Back Again" is archived: Show archived lists it.')
  })

  it('D35: Replace all names each archived project it wrote, and keeps every entry (D34)', async () => {
    seed([project('a', 'Alpha'), project('b', 'Bravo'), project('c', 'Charlie')], { a: { archived: true }, c: { color: 'teal' }, gone: { archived: true } })
    const backup = JSON.stringify(useProjectStore.getState().exportData())
    useProjectStore.setState({ projects: [project('z', 'Zulu')] })
    const banner = await ingest(backup, transport, { replaceAll: true })
    expect(banner?.text).toMatch(/^All data replaced/)
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(prefs()).toEqual({ a: { archived: true }, c: { color: 'teal' }, gone: { archived: true } })
    expect(banner?.details).toEqual(['"Alpha" is archived: Show archived lists it.'])
  })
})

describe('the same by file and by crosslink', () => {
  it('the archived note reads identically on both transports', async () => {
    const details: Record<Transport, string[] | undefined> = { file: undefined, crosslink: undefined }
    for (const transport of TRANSPORTS) {
      seed([project('a', 'Alpha')], { a: { archived: true }, back: { archived: true } })
      details[transport] = (await ingest(ownFile([project('back', 'Back Again')]), transport))?.details
    }
    expect(details.file).toEqual(details.crosslink)
    expect(details.file).toContain('"Back Again" is archived: Show archived lists it.')
  })
})

describe('files carry neither colour nor archive (D29)', () => {
  it("this app's project file holds no projectPrefs, and no project in it has a colour or archive field", () => {
    seed([project('a', 'Alpha')], { a: { color: 'teal', archived: true } })
    const file = JSON.parse(ownFile(useProjectStore.getState().projects))
    expect('projectPrefs' in file).toBe(false)
    expect(JSON.stringify(file)).not.toMatch(/"archived"|"teal"/)
    // Control: the same check finds a field that is there.
    expect(JSON.stringify(file)).toMatch(/"Alpha"/)
  })
})
