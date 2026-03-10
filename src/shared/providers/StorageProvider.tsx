// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { type ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { useCloudSync } from '@/shared/hooks/useCloudSync'

/**
 * StorageProvider activates cloud sync when the user is authenticated
 * and storage mode is 'cloud'. In local mode, this is a passthrough.
 */
export function StorageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { mode } = useStorageMode()

  // This hook handles all Firestore subscription/sync logic
  useCloudSync(user, mode)

  return <>{children}</>
}
