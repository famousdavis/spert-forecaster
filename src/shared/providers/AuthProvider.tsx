// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth, isFirebaseAvailable } from '@/shared/firebase/config'
import { signInWithGoogle, signInWithMicrosoft, signOut, checkRedirectResult } from '@/shared/firebase/auth'
import {
  isTosCached,
  cacheTos,
  clearTosCache,
  hasPendingWrite,
  clearPendingWrite,
  checkFirestoreTos,
  writeToSAcceptance,
} from '@/features/auth/lib/tos'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Start false to match SSR, then update after hydration to avoid mismatch
  const [firebaseReady, setFirebaseReady] = useState(false)

  useEffect(() => {
    setFirebaseReady(isFirebaseAvailable)
    if (!auth) {
      setIsLoading(false)
      return
    }
    // Check for pending redirect result (from signInWithRedirect fallback)
    checkRedirectResult().catch(() => {})
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        handleAuthenticatedUser(firebaseUser)
      } else {
        setUser(null)
        setIsLoading(false)
      }
    })
    return unsubscribe
  }, [])

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
      }
      clearPendingWrite()
      setUser(firebaseUser)
      setIsLoading(false)
      return
    }

    // Item 5: Returning user version check
    if (isTosCached()) {
      // localStorage has current version — proceed normally
      setUser(firebaseUser)
      setIsLoading(false)
      return
    }

    // localStorage missing or outdated — check Firestore
    try {
      const status = await checkFirestoreTos(uid)
      if (status === 'current') {
        cacheTos()
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
      setUser(firebaseUser)
      setIsLoading(false)
    }
  }

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
