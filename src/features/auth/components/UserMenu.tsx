// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'

function UserAvatar({ displayName, photoURL }: { displayName: string | null; photoURL: string | null }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={displayName || 'User'}
        className="w-7 h-7 rounded-full"
        referrerPolicy="no-referrer"
      />
    )
  }
  const initial = (displayName || '?')[0].toUpperCase()
  return (
    <div className="w-7 h-7 rounded-full bg-spert-blue text-white flex items-center justify-center text-xs font-semibold">
      {initial}
    </div>
  )
}

export function UserMenu() {
  const { user, signOut } = useAuth()
  const { mode } = useStorageMode()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  if (!user) return null

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-1 rounded transition-opacity opacity-80 hover:opacity-100 cursor-pointer"
        title={user.displayName || user.email || 'User menu'}
      >
        <UserAvatar displayName={user.displayName} photoURL={user.photoURL} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-spert-border dark:border-gray-600 py-1 z-50">
          <div className="px-3 py-2 border-b border-spert-border dark:border-gray-600">
            <p className="text-sm font-medium text-spert-text dark:text-gray-100 truncate">
              {user.displayName || 'User'}
            </p>
            <p className="text-xs text-spert-text-muted dark:text-gray-400 truncate">
              {user.email}
            </p>
            <p className="text-xs text-spert-text-muted dark:text-gray-400 mt-0.5">
              Storage: <span className="font-medium">{mode === 'cloud' ? 'Cloud' : 'Local'}</span>
            </p>
          </div>
          <button
            onClick={() => {
              setIsOpen(false)
              signOut()
            }}
            className="w-full text-left px-3 py-2 text-sm text-spert-text dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
