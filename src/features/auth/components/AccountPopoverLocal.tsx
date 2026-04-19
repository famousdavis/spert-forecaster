// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef, useState, RefObject } from 'react'
import type { User } from 'firebase/auth'

interface AccountPopoverLocalProps {
  user: User
  onSignOut: () => Promise<void>
  onSwitchToCloud: () => void
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}

/**
 * Account popover for the signed-in + local-storage state. Identical layout
 * and dismiss behavior to AccountPopover, with an additional "Switch to
 * Cloud Storage" primary action above Sign Out.
 */
export function AccountPopoverLocal({
  user,
  onSignOut,
  onSwitchToCloud,
  onClose,
  anchorRef,
}: AccountPopoverLocalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const signOutButtonRef = useRef<HTMLButtonElement>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    signOutButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (signingOut) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    function handleMouseDown(e: MouseEvent) {
      if (signingOut) return
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose, anchorRef, signingOut])

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await onSignOut()
      onClose()
    } finally {
      setSigningOut(false)
    }
  }

  const handleSwitchToCloud = () => {
    if (signingOut) return
    onSwitchToCloud()
    onClose()
  }

  const displayName = user.displayName ?? user.email ?? 'Signed in'

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Account menu"
      className="absolute right-0 mt-1 z-50 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
      style={{ width: 240, top: '100%' }}
    >
      <div className="px-4 py-3">
        <div
          className="text-gray-900 dark:text-gray-100 truncate"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {displayName}
        </div>
        {user.email && (
          <div
            className="text-gray-500 dark:text-gray-400 truncate"
            style={{ fontSize: 12 }}
          >
            {user.email}
          </div>
        )}
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700" />
      <div className="p-2 space-y-1">
        <button
          type="button"
          onClick={handleSwitchToCloud}
          disabled={signingOut}
          className="w-full text-left px-3 py-2 rounded text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          Switch to Cloud Storage
        </button>
        <button
          ref={signOutButtonRef}
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full text-left px-3 py-2 rounded text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  )
}
