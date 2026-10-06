// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Brief 40: what the user sees while the first cloud load is outstanding, in
// the owner-approved wording, and AppShell's wiring of it.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CloudLoadingPanel, PROJECT_DATA_TABS, awaitsFirstCloudLoad, errorReason } from './CloudLoadingPanel'

afterEach(() => cleanup())

const base = { mode: 'cloud' as const, authLoading: false, signedIn: true, cloudDataLoaded: false }

describe('U-P1 awaitsFirstCloudLoad (known-bad: no gate)', () => {
  it('waits in cloud mode until the first load has succeeded', () => {
    expect(awaitsFirstCloudLoad(base)).toBe(true)
    expect(awaitsFirstCloudLoad({ ...base, cloudDataLoaded: true })).toBe(false)
  })
  it('waits while auth is still resolving in cloud mode', () => {
    expect(awaitsFirstCloudLoad({ ...base, authLoading: true, signedIn: false })).toBe(true)
  })
  it('never waits in local mode, or when signed out with auth resolved', () => {
    expect(awaitsFirstCloudLoad({ ...base, mode: 'local' })).toBe(false)
    expect(awaitsFirstCloudLoad({ ...base, mode: 'local', authLoading: true })).toBe(false)
    expect(awaitsFirstCloudLoad({ ...base, signedIn: false })).toBe(false)
  })
  it('gates the three project tabs and leaves Settings and About usable', () => {
    expect([...PROJECT_DATA_TABS].sort()).toEqual(['forecast', 'projects', 'sprint-history'])
  })
})

const handlers = () => ({ onTryAgain: vi.fn(), onExportBackup: vi.fn() })
const message = () => screen.getByTestId('cloud-load-message').textContent
const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent)

describe('U-P2 the panel texts, exactly (known-bad: any change to an approved text)', () => {
  it('T1 loading: one line, no buttons, as a polite status', () => {
    render(<CloudLoadingPanel retrying={false} error={null} {...handlers()} />)
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    expect(message()).toBe('Loading your projects from the cloud…')
    expect(buttons()).toEqual([])
  })

  it('T2 waiting (a transient failure): Try again and Export a backup', () => {
    render(<CloudLoadingPanel retrying error={null} {...handlers()} />)
    expect(message()).toBe(
      'Waiting for the cloud. Your projects will appear here once the connection is back; you can keep this tab open.',
    )
    expect(buttons()).toEqual(['Try again', 'Export a backup'])
  })

  it('T3 + T3a error, refused: no sign-out advice, the contact line, and the same two buttons', () => {
    render(<CloudLoadingPanel retrying={false} error={{ code: 'permission-denied' }} {...handlers()} />)
    expect(message()).toBe(
      "Your projects couldn't be loaded from the cloud. The cloud refused this account's request. Your projects in the cloud are not affected. If this keeps happening, tell us through the contact form at spertsuite.com/contact.",
    )
    expect(screen.getByRole('link', { name: 'spertsuite.com/contact' }).getAttribute('href')).toBe('https://spertsuite.com/contact')
    expect(buttons()).toEqual(['Try again', 'Export a backup'])
  })

  it('T3 + T3b error, anything else: the code in brackets; the error wins over retrying', () => {
    render(<CloudLoadingPanel retrying error={{ code: 'TypeError' }} {...handlers()} />)
    expect(message()).toBe(
      "Your projects couldn't be loaded from the cloud. Something went wrong while reading them (TypeError). Your projects in the cloud are not affected. If this keeps happening, tell us through the contact form at spertsuite.com/contact.",
    )
  })

  it('T3a covers unauthenticated too', () => {
    expect(errorReason('unauthenticated')).toBe("The cloud refused this account's request.")
    expect(errorReason('unknown')).toBe('Something went wrong while reading them (unknown).')
  })
})

describe('the panel buttons', () => {
  it('Try again and Export a backup call their handlers', () => {
    const h = handlers()
    render(<CloudLoadingPanel retrying={false} error={{ code: 'permission-denied' }} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export a backup' }))
    expect(h.onTryAgain).toHaveBeenCalledTimes(1)
    expect(h.onExportBackup).toHaveBeenCalledTimes(1)
  })
})

describe('U-P3 AppShell wiring (structural; known-bad: the panel unwired)', () => {
  const SOURCE = readFileSync(join(import.meta.dirname, 'AppShell.tsx'), 'utf8')
  it('renders the panel instead of a project tab while the first load is outstanding', () => {
    expect(SOURCE).toMatch(/awaitsFirstCloudLoad\(\{ mode, authLoading, signedIn: !!user, cloudDataLoaded \}\)/)
    expect(SOURCE).toMatch(/awaitingCloud && PROJECT_DATA_TABS\.has\(activeTab\) \?\s*\(\s*<CloudLoadingPanel/)
  })
  it('hands the panel the store\'s failure state, Try again and the shared export', () => {
    const panel = SOURCE.slice(SOURCE.indexOf('<CloudLoadingPanel'), SOURCE.indexOf('/>', SOURCE.indexOf('<CloudLoadingPanel')))
    expect(panel).toContain('retrying={cloudLoadRetrying}')
    expect(panel).toContain('error={cloudLoadError}')
    expect(panel).toContain('onTryAgain={requestCloudLoadRetry}')
    expect(panel).toContain('onExportBackup={exportWorkspaceBackup}')
  })
  it('CONTROL — the source was read, and a false claim fails', () => {
    expect(SOURCE.length).toBeGreaterThan(1000)
    expect(SOURCE).not.toMatch(/awaitsFirstCloudLoad\(\{ mode: 'local'/)
  })
})
