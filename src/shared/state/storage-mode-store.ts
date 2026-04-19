// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StorageMode } from '@/shared/firebase/types'
import { storage, STORAGE_MODE_KEY } from './storage'

interface StorageModeState {
  mode: StorageMode
  setMode: (mode: StorageMode) => void
}

/**
 * Single source of truth for the app's storage mode ('local' | 'cloud').
 *
 * All React consumers subscribe via `useStorageMode()` (which now delegates
 * to this store) so a `setMode` call in one component propagates to every
 * other consumer — fixing the stale-state cascade that previously kept
 * `StorageProvider` in 'local' mode after a mid-session migration.
 *
 * External (non-React) callers use `useStorageModeStore.getState().setMode`.
 *
 * Legacy localStorage format: pre-v0.24.2 wrote the mode as a raw string
 * ('local' or 'cloud'). The custom `storage` adapter below reads both the
 * legacy raw-string format and the Zustand persist envelope, and continues
 * to write the raw string so `storage.getStorageMode()` — still used by
 * `project-store.exportData` — reads correctly without a second migration.
 */
export const useStorageModeStore = create<StorageModeState>()(
  persist(
    (set) => ({
      mode: 'local',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: STORAGE_MODE_KEY,
      storage: {
        getItem: (name) => {
          const raw = storage.getItem(name)
          if (!raw) return null
          // Legacy raw-string format (pre-v0.24.2)
          if (raw === 'local' || raw === 'cloud') {
            return { state: { mode: raw as StorageMode }, version: 0 }
          }
          // Zustand persist envelope
          try {
            return JSON.parse(raw)
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          // Preserve raw-string on-disk format for storage.getStorageMode() compat
          const mode = (value as { state: { mode: StorageMode } }).state.mode
          storage.setItem(name, mode)
        },
        removeItem: (name) => {
          storage.removeItem(name)
        },
      },
    }
  )
)
