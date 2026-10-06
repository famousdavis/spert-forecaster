// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The one workspace-export helper behind Export All and every "Export a backup"
// (Brief 40): it saves the file first, then runs the export check.
import { describe, it, expect, vi } from 'vitest'

const H = vi.hoisted(() => ({ order: [] as string[] }))
vi.mock('./export-project', () => ({
  downloadJson: vi.fn((name: string) => { H.order.push(`download ${name}`); return '{"saved":true}' }),
}))
vi.mock('@/shared/state/export-check-store', () => ({
  reportExportCheck: vi.fn(() => { H.order.push('check') }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn((m: string) => { H.order.push(`toast ${m}`) }) } }))
vi.mock('@/shared/lib/dates', async () => ({
  ...(await vi.importActual<typeof import('@/shared/lib/dates')>('@/shared/lib/dates')),
  today: () => '2026-10-06',
}))

import { exportWorkspaceBackup } from './export-backup'
import { downloadJson } from './export-project'
import { reportExportCheck } from '@/shared/state/export-check-store'
import { useProjectStore } from '@/shared/state/project-store'

describe('exportWorkspaceBackup', () => {
  it('saves the store\'s current copy as the workspace file, then checks it — never before the save', () => {
    const TS = '2026-01-01T00:00:00.000Z'
    useProjectStore.setState({ projects: [{ id: 'p', name: 'Kept', unitOfMeasure: 'pts', createdAt: TS, updatedAt: TS }], sprints: [] })
    exportWorkspaceBackup()
    expect(H.order).toEqual(['download spert-forecaster-2026-10-06.json', 'toast Project data exported', 'check'])
    const payload = vi.mocked(downloadJson).mock.calls[0][1] as { projects: { name: string }[] }
    expect(payload.projects.map((p) => p.name)).toEqual(['Kept'])
    expect(vi.mocked(reportExportCheck)).toHaveBeenCalledWith('{"saved":true}')
  })
})
