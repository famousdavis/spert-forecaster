// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/shared/providers/AuthProvider'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import { useProjectStore } from '@/shared/state/project-store'
import { INVITATIONS_ENABLED } from '@/lib/feature-flags'
import type { SpertModelsChangedDetail } from '@/shared/firebase/types'
// Side-effect import: captureInviteTokenFromUrl runs once at module load and
// populates sessionStorage before this hook's lazy useState initializer reads
// SESSION_KEY (Lessons 58 + 66).
import { SESSION_KEY } from '@/features/auth/lib/inviteCapture'

const CLAIM_GRACE_MS = 10000

type InvitationState = 'idle' | 'pre_auth' | 'claimed'

interface UseInvitationLandingResult {
  state: InvitationState
  claimedNames: string[]
  dismiss: () => void
}

/**
 * Drives the InvitationBanner state machine for the bulk-invitation landing
 * flow:
 *
 *   idle      — nothing to show
 *   pre_auth  — invite token captured (URL or sessionStorage); user not yet
 *               signed in OR signed in with an email that didn't match
 *               (see grace timer)
 *   claimed   — claimPendingInvitations succeeded and dispatched
 *               spert:models-changed; banner shows "you've been added to X"
 *
 * Initial-state computation moved to a `useState` lazy initializer (Lesson 66)
 * so React 19's `react-hooks/set-state-in-effect` rule is not violated for the
 * mount-time check. URL-token capture happens at module load via
 * `captureInviteTokenFromUrl` (Lesson 58) — by the time the lazy initializer
 * runs, sessionStorage has already been populated.
 *
 * Three effects:
 *
 *   1. URL strip + cloud-mode flip on first mount. The token has already
 *      been captured by `captureInviteTokenFromUrl`; this effect's only
 *      remaining responsibilities are stripping `?invite=` from the URL via
 *      `router.replace` (App Router-friendly) and activating cloud mode
 *      when the local store is empty (F4 gate / Lesson 28). `hasRunRef`
 *      guards re-runs after the first execution.
 *
 *   2. 10-second grace timer. When `user` becomes non-null while in pre_auth,
 *      AuthProvider has already fired claimPendingInvitations. Wait up to
 *      CLAIM_GRACE_MS for the spert:models-changed event; on timeout,
 *      consume SESSION_KEY (Lesson 59) and fall back to idle so the banner
 *      doesn't stick around when the user signed in with a non-matching
 *      email. Cleanup clears the timer; if the user signs out (user → null)
 *      the cleanup fires and the state stays pre_auth.
 *
 *   3. spert:models-changed listener. Mounted once at component mount
 *      (deps=[]). Handler does NOT gate on state — AuthProvider only
 *      dispatches when claimed.length > 0, so any non-empty event is a
 *      legitimate transition to `claimed`. Dropping the state gate avoids
 *      the stale-closure race that would otherwise come with
 *      deps=[user, state].
 *
 * Known limitations (documented in PR body):
 *   - C1: setMode('cloud') only when localProjectCount === 0. Users with
 *     local content who click an invite link must migrate via Settings →
 *     Storage Mode to see the shared project. The banner shows a hint.
 *   - C3: signed-in user clicks an invite for a different email → banner
 *     auto-dismisses after 10 seconds with no visible error.
 *   - N9: capture-once design prevents handling a second invite link in the
 *     same session. Workaround: hard refresh.
 */
export function useInvitationLanding(): UseInvitationLandingResult {
  const { user, isFirebaseAvailable } = useAuth()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Lesson 66: lazy useState initializer reads sessionStorage at mount
  // synchronously, without needing setState in an effect. The
  // captureInviteTokenFromUrl module-load call has already run by this
  // point, so SESSION_KEY reflects the URL's invite= token (if any).
  const [state, setState] = useState<InvitationState>(() => {
    if (typeof window === 'undefined') return 'idle' // SSR guard
    if (!INVITATIONS_ENABLED) return 'idle'
    try {
      return sessionStorage.getItem(SESSION_KEY) ? 'pre_auth' : 'idle'
    } catch {
      return 'idle'
    }
  })

  const [claimedNames, setClaimedNames] = useState<string[]>([])
  const hasRunRef = useRef(false)

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_KEY)
    setState('idle')
    setClaimedNames([])
  }, [])

  // Effect 1: URL-strip + cloud-mode flip on first mount.
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return
    if (typeof window === 'undefined') return
    if (hasRunRef.current) return
    hasRunRef.current = true

    // Strip the `?invite=` param if it's still in the URL. Capture has
    // already persisted the token to sessionStorage at module load.
    if (searchParams.get('invite')) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('invite')
      const newUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname
      router.replace(newUrl, { scroll: false })
    }

    // O6 / Lesson 28: only auto-flip when the user has nothing to lose
    // locally. Users with local content must migrate via Settings → Storage
    // Mode to see the shared project — the InvitationBanner shows a hint
    // for that case in its `claimed` render branch.
    if (state === 'pre_auth' && isFirebaseAvailable) {
      const localProjectCount = useProjectStore.getState().projects.length
      if (localProjectCount === 0) {
        useStorageModeStore.getState().setMode('cloud')
      }
    }
  }, [searchParams, pathname, router, isFirebaseAvailable, state])

  // Effect 2: grace timer for the pre_auth → idle (no-match) transition.
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return
    if (typeof window === 'undefined') return
    if (state !== 'pre_auth') return
    if (!user) return

    const timeout = setTimeout(() => {
      sessionStorage.removeItem(SESSION_KEY)
      setState('idle')
    }, CLAIM_GRACE_MS)

    return () => clearTimeout(timeout)
  }, [state, user])

  // Effect 3: spert:models-changed listener (mount-only).
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SpertModelsChangedDetail>).detail
      const names = (detail?.claimed ?? []).map((c) => c.modelName).filter(Boolean)
      if (names.length === 0) return
      sessionStorage.removeItem(SESSION_KEY)
      setClaimedNames(names)
      setState('claimed')
    }

    window.addEventListener('spert:models-changed', handler)
    return () => window.removeEventListener('spert:models-changed', handler)
  }, [])

  return { state, claimedNames, dismiss }
}
