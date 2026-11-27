// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// F1 (FRAME26 pass 3, v0.54.0): every one of Forecaster's seven fixed-overlay dialogs holds the page's one counted
// scroll lock while it is open, and no other code writes body.style.overflow. Measured on v0.53.0
// (frame26-evidence About-FC-CFD/probes/f1-prod.json): cancelling the sign-in consent over the open Cloud Storage modal
// unlocked the page (a wheel scrolled it 100 → 122), and New Project and Keyboard Shortcuts took no lock at all.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

vi.mock('@/shared/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, isFirebaseAvailable: true, signOut: vi.fn(async () => {}) }),
}))
vi.mock('@/shared/hooks/useStorageMode', () => ({ useStorageMode: () => ({ mode: 'local', setMode: vi.fn(), isFirebaseAvailable: true }) }))
vi.mock('@/shared/firebase/sync-bus', () => ({ syncBus: { emit: vi.fn(), subscribe: () => () => {} } }))
vi.mock('@/shared/firebase/callables', () => ({ callGeneratePairingCode: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/features/projects/lib/export-backup', () => ({ exportWorkspaceBackup: vi.fn() }))
vi.mock('@/features/auth/components/UploadConfirmPanel', () => ({ UploadConfirmPanel: () => null }))

import { ConfirmDialog } from './ConfirmDialog'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { CloudStorageModal } from '@/features/auth/components/CloudStorageModal'
import { ConsentModal } from '@/features/auth/components/ConsentModal'
import { ConnectAiPanel } from '@/features/connect-ai/components/ConnectAiPanel'
import { ConnectAiConsentModal } from '@/features/connect-ai/components/ConnectAiConsentModal'
import { ProjectDialog } from '@/features/projects/components/ProjectDialog'
import { scrollLockHolds } from '@/shared/hooks/useScrollLock'

afterEach(() => { cleanup(); document.body.style.overflow = '' })
const noop = () => {}
const SESSION = { sessionActive: false, aiConnected: false, consentRead: false, sessionId: null }

const DIALOGS: [string, (open: boolean) => React.ReactElement | null][] = [
  ['ConfirmDialog', (o) => <ConfirmDialog isOpen={o} title="Delete" message="Sure?" onConfirm={noop} onCancel={noop} />],
  ['CloudStorageModal', (o) => <CloudStorageModal isOpen={o} onClose={noop} />],
  ['ConsentModal', (o) => (o ? <ConsentModal onAccept={noop} onCancel={noop} /> : null)],
  ['ConnectAiPanel', (o) => <ConnectAiPanel open={o} onClose={noop} sessionState={SESSION} onChangePermissions={async () => true} onDisconnect={async () => {}} />],
  ['ProjectDialog', (o) => (o ? <ProjectDialog identity="new" title="New Project" readOnly={false} onCancel={noop} returnFocusTo={() => null}><input /></ProjectDialog> : null)],
  ['KeyboardShortcutsHelp', (o) => <KeyboardShortcutsHelp isOpen={o} onClose={noop} shortcuts={[]} />],
  ['ConnectAiConsentModal', (o) => <ConnectAiConsentModal open={o} onCancel={noop} onConfirm={noop} />],
]

describe('every overlay dialog holds the page’s scroll lock (F1)', () => {
  it.each(DIALOGS)('%s: locked while open, released when closed', (_name, el) => {
    const r = render(<>{el(false)}</>)
    expect(document.body.style.overflow).toBe('')
    r.rerender(<>{el(true)}</>)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['hidden', 1])
    r.rerender(<>{el(false)}</>)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['', 0])
  })

  it('cancelling the sign-in consent over the open Cloud Storage modal keeps the page locked (the v0.53.0 defect)', () => {
    const page = (consent: boolean) => <><CloudStorageModal isOpen onClose={noop} />{consent && <ConsentModal onAccept={noop} onCancel={noop} />}</>
    const r = render(page(true))
    expect(scrollLockHolds()).toBe(2)
    r.rerender(page(false))
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['hidden', 1])
    r.rerender(<></>)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['', 0])
  })

  it('a confirmation rendered closed under an open modal does not unlock the page', () => {
    const page = (confirm: boolean) => <><CloudStorageModal isOpen onClose={noop} /><ConfirmDialog isOpen={confirm} title="Sign out" message="Sure?" onConfirm={noop} onCancel={noop} /></>
    const r = render(page(false))
    expect(document.body.style.overflow).toBe('hidden')
    r.rerender(page(true))
    r.rerender(page(false))
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['hidden', 1])
  })
})

describe('the census', () => {
  const SRC = join(__dirname, '..', '..')
  const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : [p] })
  const source = files(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  const rel = (f: string) => relative(SRC, f)

  it('the seven files with a fixed overlay dialog all take the lock, and no other file does', () => {
    const overlays = source.filter((f) => /fixed inset-0|\bOVERLAY\b/.test(readFileSync(f, 'utf8')) && !f.endsWith('dashboard-styles.ts')).map(rel).sort()
    const lockers = source.filter((f) => /useScrollLock\(/.test(readFileSync(f, 'utf8')) && !f.endsWith('useScrollLock.ts')).map(rel).sort()
    expect(overlays).toHaveLength(7)
    expect(lockers).toEqual(overlays)
  })

  it('no file but the hook writes body.style.overflow', () => {
    const writers = source.filter((f) => /body\.style\.overflow\s*=[^=]/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(writers).toEqual(['shared/hooks/useScrollLock.ts'])
  })
})
