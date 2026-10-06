// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { useProjectStore } from '@/shared/state/project-store'

/**
 * TRUE while a signed-in cloud user's first cloud load has not succeeded —
 * loading, waiting or failed alike (Brief 40). Inside this window the store
 * holds only this browser's own copy, so switching to local storage and signing
 * out, which both remove that copy, warn first and offer a backup. Outside it,
 * both behave exactly as they always have.
 */
export function isInsideFirstCloudLoadWindow(s: { mode: string; signedIn: boolean; cloudDataLoaded: boolean }): boolean {
  return s.mode === 'cloud' && s.signedIn && !s.cloudDataLoaded
}

export function useFirstCloudLoadWindow(): boolean {
  const { mode } = useStorageMode()
  const { user } = useAuth()
  const cloudDataLoaded = useProjectStore((s) => s.cloudDataLoaded)
  return isInsideFirstCloudLoadWindow({ mode, signedIn: !!user, cloudDataLoaded })
}
