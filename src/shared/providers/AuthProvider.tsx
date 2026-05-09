// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { toast } from 'sonner'
import { auth, isFirebaseAvailable, functionsInstance } from '@/shared/firebase/config'
import { callClaimPendingInvitations } from '@/shared/firebase/callables'
import { signInWithGoogle, signInWithMicrosoft, signOut, checkRedirectResult } from '@/shared/firebase/auth'
import { cancelPendingSaves } from '@/shared/firebase/firestore-driver'
import { writeUserProfile } from '@/shared/firebase/profileWrites'
import { useProjectStore } from '@/shared/state/project-store'
import { useStorageModeStore } from '@/shared/state/storage-mode-store'
import {
  isTosCached,
  cacheTos,
  clearTosCache,
  hasPendingWrite,
  clearPendingWrite,
  checkFirestoreTos,
  writeToSAcceptance,
} from '@/features/auth/lib/tos'
import { INVITATIONS_ENABLED } from '@/lib/feature-flags'
import type { SpertModelsChangedDetail } from '@/shared/firebase/types'

/** Must match the SESSION_KEY in useInvitationLanding. */
const INVITE_SESSION_KEY = 'spert_invite_token'

/**
 * Fire `claimPendingInvitations` and dispatch `spert:models-changed` on
 * success so the InvitationBanner can transition to its `claimed` state.
 *
 * No-op when the flag is off, Firebase is unavailable, OR the user's email
 * is not verified. The `emailVerified` guard (Lesson 26) prevents wasted
 * round-trips for Microsoft personal accounts (`@outlook.com`,
 * `@hotmail.com`), which Firebase reports with `emailVerified: false` —
 * `claimPendingInvitations` would otherwise throw `failed-precondition`
 * unconditionally for those users on every auth resolution.
 *
 * The `failed-precondition` toast remains gated on
 * `sessionStorage.getItem(INVITE_SESSION_KEY)` as a secondary layer for any
 * residual edge case where the CF still rejects after our guard (e.g., a
 * verified Google account whose token has been demoted server-side).
 *
 * The event name `spert:models-changed` is a suite-wide contract — do not
 * rename in any SPERT app.
 */
function claimPendingInvitationsAndNotify(firebaseUser: User): void {
  if (!INVITATIONS_ENABLED) return
  if (!firebaseUser.emailVerified) return
  if (!functionsInstance) return
  void callClaimPendingInvitations()
    .then((res) => {
      const claimed = res?.claimed ?? []
      if (claimed.length > 0 && typeof window !== 'undefined') {
        const detail: SpertModelsChangedDetail = { claimed }
        window.dispatchEvent(new CustomEvent('spert:models-changed', { detail }))
      }
    })
    .catch((err) => {
      const code = (err as { code?: string }).code ?? 'unknown'
      console.error('claimPendingInvitations failed:', code)
      if (
        code === 'functions/failed-precondition' &&
        typeof window !== 'undefined' &&
        sessionStorage.getItem(INVITE_SESSION_KEY)
      ) {
        toast.error(
          'Could not verify your email address. Microsoft personal accounts (@outlook.com, @hotmail.com) are not supported for invitations.'
        )
      }
    })
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isFirebaseAvailable: boolean
  signInWithGoogle: () => Promise<void>
  signInWithMicrosoft: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isFirebaseAvailable: false,
  signInWithGoogle: async () => {},
  signInWithMicrosoft: async () => {},
  signOut: async () => {},
})

const noopSubscribe = () => () => {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // `isFirebaseAvailable` is a module-level constant gated on `typeof window`,
  // so SSR reads false and CSR reads the real value. useSyncExternalStore
  // provides a hydration-safe snapshot without a setState-in-effect bridge.
  const firebaseReady = useSyncExternalStore(
    noopSubscribe,
    () => isFirebaseAvailable,
    () => false
  )

  /**
   * Handles an authenticated Firebase user:
   * - If a pending ToS write flag exists (fresh consent), write acceptance to Firestore (Item 4)
   * - Otherwise, verify the returning user's ToS version (Item 5)
   */
  async function handleAuthenticatedUser(firebaseUser: User) {
    const uid = firebaseUser.uid
    const authProvider = firebaseUser.providerData[0]?.providerId ?? 'unknown'

    // Item 4: Post-authentication Firestore write
    if (hasPendingWrite()) {
      try {
        await writeToSAcceptance(uid, authProvider)
      } catch (err) {
        console.error('Failed to write ToS acceptance:', err)
        toast.error('Failed to record your terms acceptance. You can continue using the app, but you may be asked again on your next sign-in.')
      }
      clearPendingWrite()
      void writeUserProfile(firebaseUser)
      claimPendingInvitationsAndNotify(firebaseUser)
      setUser(firebaseUser)
      setIsLoading(false)
      return
    }

    // Item 5: Returning user version check
    if (isTosCached()) {
      // localStorage has current version — proceed normally
      void writeUserProfile(firebaseUser)
      claimPendingInvitationsAndNotify(firebaseUser)
      setUser(firebaseUser)
      setIsLoading(false)
      return
    }

    // localStorage missing or outdated — check Firestore
    try {
      const status = await checkFirestoreTos(uid)
      if (status === 'current') {
        cacheTos()
        void writeUserProfile(firebaseUser)
        claimPendingInvitationsAndNotify(firebaseUser)
        setUser(firebaseUser)
        setIsLoading(false)
      } else {
        // Outdated or missing — sign out and force re-consent
        clearTosCache()
        await signOut()
        setUser(null)
        setIsLoading(false)
      }
    } catch (err) {
      console.error('ToS version check failed:', err)
      // On error, allow through to avoid blocking legitimate users
      void writeUserProfile(firebaseUser)
      claimPendingInvitationsAndNotify(firebaseUser)
      setUser(firebaseUser)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!auth) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no-Firebase boot path: finalize the initial "loading=true" state when auth is unavailable, so dependent UI can render local-mode immediately
      setIsLoading(false)
      return
    }
    // Check for pending redirect result (from signInWithRedirect fallback)
    checkRedirectResult().catch(() => {})
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        handleAuthenticatedUser(firebaseUser)
      } else {
        // Sign-out sequence — order matters:
        //   (a) cancel queued Firestore writes BEFORE credentials are gone
        //   (b) clear store + persisted localStorage snapshot (privacy)
        //   (c) reset storage mode to 'local' so next boot does not enter cloud
        //       mode before auth resolves; broadcasts to all useStorageMode
        //       consumers via Zustand subscriptions
        //   (d) flip React auth state, which triggers useCloudSync teardown
        cancelPendingSaves()
        useProjectStore.getState().clearProjectsOnSignOut()
        useStorageModeStore.getState().setMode('local')
        setUser(null)
        setIsLoading(false)
      }
    })
    return unsubscribe
  }, [])

  const handleSignInGoogle = useCallback(async () => {
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('Google sign-in failed:', err)
    }
  }, [])

  const handleSignInMicrosoft = useCallback(async () => {
    try {
      await signInWithMicrosoft()
    } catch (err) {
      console.error('Microsoft sign-in failed:', err)
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign-out failed:', err)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isFirebaseAvailable: firebaseReady,
        signInWithGoogle: handleSignInGoogle,
        signInWithMicrosoft: handleSignInMicrosoft,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
