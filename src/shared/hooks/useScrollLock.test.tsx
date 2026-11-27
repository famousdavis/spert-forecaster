// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// F1 (FRAME26 pass 3, v0.54.0): one counted lock for the page. Locked while any holder is active, restored with the
// last release, to the value found before the first hold.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useScrollLock, scrollLockHolds } from './useScrollLock'

function Holder({ active = true }: { active?: boolean }) { useScrollLock(active); return null }
afterEach(() => { cleanup(); document.body.style.overflow = '' })

describe('useScrollLock', () => {
  it('locks the page while held and restores it on release', () => {
    const r = render(<Holder />)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['hidden', 1])
    r.unmount()
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['', 0])
  })

  it('takes no hold while inactive, and one when it turns active', () => {
    const r = render(<Holder active={false} />)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['', 0])
    r.rerender(<Holder active />)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['hidden', 1])
    r.rerender(<Holder active={false} />)
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['', 0])
  })

  it('with two holders, releases only with the last', () => {
    const a = render(<Holder />)
    const b = render(<Holder />)
    expect(scrollLockHolds()).toBe(2)
    a.unmount()
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['hidden', 1])
    b.unmount()
    expect([document.body.style.overflow, scrollLockHolds()]).toEqual(['', 0])
  })

  it('restores the value it found, not an empty one', () => {
    document.body.style.overflow = 'clip'
    const r = render(<Holder />)
    expect(document.body.style.overflow).toBe('hidden')
    r.unmount()
    expect(document.body.style.overflow).toBe('clip')
  })
})
