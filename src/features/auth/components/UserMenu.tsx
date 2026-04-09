// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useRef, useState } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { AccountPopover } from './AccountPopover'

interface AuthChipProps {
  onNavigateToSettings: () => void
}

function CloudIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill="#0070f3"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="#9CA3AF" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function UserMenu({ onNavigateToSettings }: AuthChipProps) {
  const { user, signOut } = useAuth()
  const { mode } = useStorageMode()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const isCloudSignedIn = mode === 'cloud' && !!user
  const rawName = user?.displayName ?? ''
  const firstName = rawName.includes(',')
    ? rawName.split(',')[1]?.trim().split(' ')[0] ?? user?.email ?? ''
    : rawName.split(' ')[0] || user?.email || ''
  const initial = firstName.charAt(0).toUpperCase()

  if (isCloudSignedIn && user) {
    return (
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
          aria-label="Account menu"
          className="flex items-center rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          style={{ border: '0.5px solid #D1D5DB' }}
        >
          {/* Left segment: avatar + first name */}
          <div className="flex items-center gap-1.5 py-1 pl-1 pr-2.5">
            <div
              className="flex items-center justify-center rounded-full text-white shrink-0"
              style={{
                width: 26,
                height: 26,
                backgroundColor: '#0070f3',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {initial}
            </div>
            <span
              style={{ fontSize: 13, fontWeight: 500 }}
              className="text-gray-900 dark:text-gray-100"
            >
              {firstName}
            </span>
          </div>
          {/* Vertical divider */}
          <div
            className="self-stretch"
            style={{ width: '0.5px', backgroundColor: '#D1D5DB' }}
          />
          {/* Right segment: cloud icon */}
          <span className="flex items-center justify-center px-2.5 py-1">
            <CloudIcon />
          </span>
        </button>
        {popoverOpen && (
          <AccountPopover
            user={user}
            onSignOut={signOut}
            onClose={() => setPopoverOpen(false)}
            anchorRef={wrapperRef}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className="flex items-center rounded-full"
      style={{ border: '0.5px solid #D1D5DB' }}
    >
      {/* Left segment: lock icon + "Local only" */}
      <div className="flex items-center gap-1.5 py-1 pl-2.5 pr-2.5">
        <LockIcon />
        <span style={{ fontSize: 13 }} className="text-gray-400">
          Local only
        </span>
      </div>
      {/* Vertical divider */}
      <div
        className="self-stretch"
        style={{ width: '0.5px', backgroundColor: '#D1D5DB' }}
      />
      {/* Right segment: "Sign in" → Settings */}
      <button
        onClick={onNavigateToSettings}
        className="flex items-center justify-center px-2.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-r-full cursor-pointer"
        aria-label="Sign in"
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: '#0070f3' }}>
          Sign in
        </span>
      </button>
    </div>
  )
}
