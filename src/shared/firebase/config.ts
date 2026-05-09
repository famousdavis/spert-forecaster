// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Conditional Firebase initialization — only when env vars are present.
// Without env vars, the app operates in local-only mode with zero Firebase code executed.

import { type FirebaseApp, getApps, initializeApp } from 'firebase/app'
import { type Auth, getAuth } from 'firebase/auth'
import { type Firestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { type Functions, getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export const isFirebaseAvailable =
  typeof window !== 'undefined' && !!firebaseConfig.apiKey && !!firebaseConfig.projectId

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
// Module-level Functions instance. Consumed by `callables.ts` via
// `requireFunctions()` (Lesson 61) — do not call `httpsCallable(functions, ...)`
// directly with a non-null assertion at consumer sites; route through a named
// wrapper in `callables.ts` instead.
let functionsInstance: Functions | null = null

if (isFirebaseAvailable) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!
  // memoryLocalCache avoids stale IndexedDB cache across security rule deployments
  db = initializeFirestore(app, { localCache: memoryLocalCache() })
  auth = getAuth(app)
  // Region must match the deployed Cloud Function region (us-central1 — see
  // spert-landing-page/functions/src/invitationMailer.tsx).
  functionsInstance = getFunctions(app, 'us-central1')
}

export { app, db, auth, functionsInstance }
