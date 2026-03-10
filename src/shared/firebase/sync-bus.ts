// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Typed event bus for decoupling Zustand store mutations from Firestore writes.
// In local mode, no listeners are attached so emissions are no-ops.

import type { SyncEvent } from './types'

type Listener = (event: SyncEvent) => void

const listeners = new Set<Listener>()

export const syncBus = {
  /** Subscribe to sync events. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /** Emit a sync event to all listeners. No-op if no listeners (local mode). */
  emit(event: SyncEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  },

  /** Check if there are any active listeners. */
  hasListeners(): boolean {
    return listeners.size > 0
  },
}
