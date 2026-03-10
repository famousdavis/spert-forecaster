// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useCallback, useEffect } from 'react'
import { isFirebaseAvailable } from '@/shared/firebase/config'
import type { StorageMode } from '@/shared/firebase/types'
import { STORAGE_MODE_KEY } from '@/shared/state/storage'

function getPersistedMode(): StorageMode {
  if (typeof window === 'undefined') return 'local'
  return (localStorage.getItem(STORAGE_MODE_KEY) as StorageMode) || 'local'
}

export function useStorageMode() {
  const [mode, setModeState] = useState<StorageMode>(getPersistedMode)

  // Sync on mount (SSR → client hydration)
  useEffect(() => {
    setModeState(getPersistedMode())
  }, [])

  const setMode = useCallback((newMode: StorageMode) => {
    setModeState(newMode)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_MODE_KEY, newMode)
    }
  }, [])

  return {
    mode,
    setMode,
    isFirebaseAvailable,
  }
}

export { STORAGE_MODE_KEY }
