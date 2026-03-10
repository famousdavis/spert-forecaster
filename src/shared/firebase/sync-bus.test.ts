// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest'
import { syncBus } from './sync-bus'

describe('syncBus', () => {
  it('delivers events to subscribers', () => {
    const listener = vi.fn()
    const unsub = syncBus.subscribe(listener)

    syncBus.emit({ type: 'project:save', projectId: 'p1' })
    expect(listener).toHaveBeenCalledWith({ type: 'project:save', projectId: 'p1' })

    unsub()
  })

  it('supports multiple subscribers', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    const unsub1 = syncBus.subscribe(listener1)
    const unsub2 = syncBus.subscribe(listener2)

    syncBus.emit({ type: 'settings:save' })
    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = syncBus.subscribe(listener)

    syncBus.emit({ type: 'project:delete', projectId: 'p1' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    syncBus.emit({ type: 'project:delete', projectId: 'p2' })
    expect(listener).toHaveBeenCalledTimes(1) // not called again
  })

  it('reports hasListeners correctly', () => {
    expect(syncBus.hasListeners()).toBe(false)
    const unsub = syncBus.subscribe(() => {})
    expect(syncBus.hasListeners()).toBe(true)
    unsub()
    expect(syncBus.hasListeners()).toBe(false)
  })

  it('is a no-op when no listeners', () => {
    // Should not throw
    syncBus.emit({ type: 'project:save', projectId: 'p1' })
  })
})
