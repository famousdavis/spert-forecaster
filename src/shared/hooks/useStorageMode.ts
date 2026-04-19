// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { isFirebaseAvailable } from '@/shared/firebase/config'
import type { StorageMode } from '@/shared/firebase/types'
import { STORAGE_MODE_KEY } from '@/shared/state/storage'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'

/**
 * Thin React wrapper over `useStorageModeStore` — preserves the legacy
 * return shape `{ mode, setMode, isFirebaseAvailable }` so all existing
 * consumers compile without modification. Because every consumer now
 * subscribes to the same Zustand store, `setMode` in any component
 * propagates to every other consumer on the same render cycle.
 */
export function useStorageMode() {
  const mode = useStorageModeStore((s) => s.mode)
  const setMode = useStorageModeStore((s) => s.setMode)
  return {
    mode,
    setMode,
    isFirebaseAvailable,
  }
}

/**
 * Non-React caller alias. Prefer this over `useStorageModeStore.getState().setMode`
 * when the call site reads better with an imperative verb (e.g. AuthProvider
 * sign-out sequence).
 */
export function broadcastStorageModeChange(mode: StorageMode): void {
  useStorageModeStore.getState().setMode(mode)
}

export { STORAGE_MODE_KEY }
