// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import type { Ref } from 'react'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageMode } from '@/shared/hooks/useStorageMode'
import { firstNameFromDisplayName } from '@/features/auth/lib/display-name'

interface UserMenuProps {
  onRequestOpen: () => void
  /**
   * The button shown, whichever of the three it is (v0.50.4): the Cloud Storage window returns
   * focus to it, and signing in or out swaps one for another.
   */
  buttonRef?: Ref<HTMLButtonElement>
}

/** The avatar's fill: white initials on it measure 4.55 : 1. Used only as the avatar's background. */
const BRAND = '#0070f3'

function CloudIcon() {
  // currentColor: the chip's action segment draws it in the frame's link colour (5.25 / 6.73 : 1). Until v0.52.0 it was
  // a fixed #0070f3, 3.90 on the dark ground.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill="currentColor"
      />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  // currentColor, never a fixed grey: #9CA3AF measured 2.54 on white, under the 3:1 bar for a glyph that carries
  // state (the only sign of local storage in the signed-in chip). Signed out it takes the state segment's muted colour;
  // signed in it sits in the action segment, so it names the muted token itself.
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      className={className}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/*
 * The account chip, on the frame's `.sf-chip` (FRAME26, contract §3 and §7, v0.52.0): 30 px tall in every state,
 * min-width 163, max-width 240, its right edge at R. Its colours are the frame's, never this file's:
 *   - the state segment (`.sf-chip-state`) is the muted text colour: 4.84 : 1 on white, 6.82 on #101828;
 *   - the action segment (`.sf-chip-act`) is the link colour: 5.25 / 6.73;
 *   - on hover the whole chip takes `--sf-hover` (#f9fafb / #1e2939), where the same two measure 4.63 / 5.64 and
 *     5.02 / 5.56 (`.sf-chip:hover`, canonical).
 * No colour is set inline or by a hover utility on the chip or its segments: the stylesheet is unlayered, so it would
 * win anyway, and an inline colour would also beat the theme. Until v0.52.0 these were stage 0's classes (v0.51.2).
 * `UserMenu.contrast.test.tsx` holds this.
 */
export function UserMenu({ onRequestOpen, buttonRef }: UserMenuProps) {
  const { user } = useAuth()
  const { mode } = useStorageMode()

  const isCloudSignedIn = mode === 'cloud' && !!user
  const isSignedInLocal = !!user && mode === 'local'
  const firstName = firstNameFromDisplayName(user?.displayName, user?.email ?? '')
  const initial = firstName.charAt(0).toUpperCase() || '?'

  if ((isCloudSignedIn || isSignedInLocal) && user) {
    return (
      <button
        type="button"
        ref={buttonRef}
        onClick={onRequestOpen}
        aria-label="Account menu"
        className="sf-chip"
        data-sf="chip"
      >
        <span className="sf-chip-state">
          <span
            className="flex w-[22px] h-[22px] shrink-0 items-center justify-center rounded-full text-white text-[11px] font-medium"
            style={{ backgroundColor: BRAND }}
          >
            {initial}
          </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{firstName}</span>
        </span>
        <span className="sf-chip-act">
          {/* Cloud: the link colour. Local: the lock says "local only", muted like the signed-out chip's. */}
          {isCloudSignedIn ? <CloudIcon /> : <LockIcon className="text-(--sf-text-muted)" />}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onRequestOpen}
      aria-label="Sign in"
      className="sf-chip"
      data-sf="chip"
    >
      <span className="sf-chip-state">
        <LockIcon />
        <span>Local only</span>
      </span>
      <span className="sf-chip-act">Sign in</span>
    </button>
  )
}
