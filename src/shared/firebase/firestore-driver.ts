// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firestore CRUD operations for SPERT Forecaster data.
// All writes use merge:true to preserve owner/members fields.
// Saves are debounced at 500ms with beforeunload flush.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from './config'
import { COLLECTIONS, type FirestoreProjectDoc, type FirestoreSettingsDoc } from './types'
import { sanitizeForFirestore, stripFirestoreFields } from './firestore-sanitize'

// --- Debounce infrastructure ---

const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingSaveFns = new Map<string, () => Promise<void>>()

function debouncedSave(key: string, saveFn: () => Promise<void>, delayMs = 500): void {
  const existingTimer = pendingSaveTimers.get(key)
  if (existingTimer) clearTimeout(existingTimer)

  pendingSaveFns.set(key, saveFn)
  pendingSaveTimers.set(
    key,
    setTimeout(async () => {
      pendingSaveTimers.delete(key)
      pendingSaveFns.delete(key)
      try {
        await saveFn()
      } catch (err) {
        console.error(`Firestore save failed for ${key}:`, err)
        toast.error('Failed to save changes to the cloud. Please check your connection.')
      }
    }, delayMs)
  )
}

/** Cancel all pending debounced writes without executing them. */
export function cancelPendingSaves(): void {
  for (const [key, timer] of pendingSaveTimers) {
    clearTimeout(timer)
    pendingSaveTimers.delete(key)
  }
  pendingSaveFns.clear()
}

/** Flush all pending debounced writes immediately (call on beforeunload). */
export function flushPendingSaves(): void {
  for (const [key, timer] of pendingSaveTimers) {
    clearTimeout(timer)
    pendingSaveTimers.delete(key)
  }
  for (const [key, saveFn] of pendingSaveFns) {
    pendingSaveFns.delete(key)
    saveFn().catch((err) => console.error(`Flush save failed for ${key}:`, err))
  }
}

// --- Project operations ---

/** Load all projects where the user is owner or member. */
export async function loadProjects(uid: string): Promise<Map<string, FirestoreProjectDoc>> {
  if (!db) throw new Error('Firestore not available')

  const result = new Map<string, FirestoreProjectDoc>()

  // Query owned projects
  const ownedQ = query(
    collection(db, COLLECTIONS.projects),
    where('owner', '==', uid)
  )
  const ownedSnap = await getDocs(ownedQ)
  for (const docSnap of ownedSnap.docs) {
    result.set(docSnap.id, docSnap.data() as FirestoreProjectDoc)
  }

  // Query shared projects (member)
  const memberRoles = ['editor', 'viewer']
  for (const role of memberRoles) {
    const memberQ = query(
      collection(db, COLLECTIONS.projects),
      where(`members.${uid}`, '==', role)
    )
    const memberSnap = await getDocs(memberQ)
    for (const docSnap of memberSnap.docs) {
      if (!result.has(docSnap.id)) {
        result.set(docSnap.id, docSnap.data() as FirestoreProjectDoc)
      }
    }
  }

  return result
}

/**
 * Load the set of project IDs owned by `uid`. Used to gate UI affordances
 * (e.g., the Share button on the Projects tab) that should only appear for
 * the project owner. One Firestore query, IDs only.
 */
export async function loadOwnedProjectIds(uid: string): Promise<Set<string>> {
  if (!db) return new Set()
  const ownedQ = query(
    collection(db, COLLECTIONS.projects),
    where('owner', '==', uid)
  )
  const snap = await getDocs(ownedQ)
  return new Set(snap.docs.map((d) => d.id))
}

/** Save a project document (debounced). Uses merge:true to preserve owner/members. */
export function saveProject(projectId: string, data: FirestoreProjectDoc): void {
  debouncedSave(`project:${projectId}`, async () => {
    if (!db) return
    const ref = doc(db, COLLECTIONS.projects, projectId)
    const { owner: _o, members: _m, ...dataWithoutOwnership } = data
    await setDoc(ref, sanitizeForFirestore(dataWithoutOwnership), { merge: true })
  })
}

/** Save a project document immediately (no debounce). For creation and migration. */
export async function saveProjectImmediate(projectId: string, data: FirestoreProjectDoc): Promise<void> {
  if (!db) return
  const ref = doc(db, COLLECTIONS.projects, projectId)
  await setDoc(ref, sanitizeForFirestore(data))
}

/** Delete a project document. */
export async function deleteProject(projectId: string): Promise<void> {
  if (!db) return
  const ref = doc(db, COLLECTIONS.projects, projectId)
  await deleteDoc(ref)
}

/** Subscribe to real-time updates for all projects where user is owner or member. */
export function subscribeToUserProjects(
  uid: string,
  callback: (projects: Map<string, FirestoreProjectDoc>) => void
): Unsubscribe {
  if (!db) return () => {}

  // Track results from each listener separately to avoid flicker on merge
  const ownedProjects = new Map<string, FirestoreProjectDoc>()
  const editorProjects = new Map<string, FirestoreProjectDoc>()
  const viewerProjects = new Map<string, FirestoreProjectDoc>()

  // Wait until all three listeners have delivered their first snapshot
  // before calling the callback, to prevent briefly dropping shared projects
  let ownedReady = false
  let editorReady = false
  let viewerReady = false

  function mergeAndNotify() {
    if (!ownedReady || !editorReady || !viewerReady) return

    const merged = new Map<string, FirestoreProjectDoc>()
    // Lower-priority first so owned takes precedence
    for (const [id, d] of viewerProjects) merged.set(id, d)
    for (const [id, d] of editorProjects) merged.set(id, d)
    for (const [id, d] of ownedProjects) merged.set(id, d)
    callback(merged)
  }

  function handleSnapshot(
    target: Map<string, FirestoreProjectDoc>,
    setReady: () => void
  ) {
    return (snapshot: import('firebase/firestore').QuerySnapshot) => {
      if (snapshot.metadata.hasPendingWrites) return
      target.clear()
      for (const docSnap of snapshot.docs) {
        target.set(docSnap.id, docSnap.data() as FirestoreProjectDoc)
      }
      setReady()
      mergeAndNotify()
    }
  }

  function handleListenerError(scope: 'owned' | 'editor' | 'viewer') {
    return (error: Error) => {
      console.error(`Firestore listener error (${scope}):`, error)
      toast.error('Lost real-time connection to the cloud. Refresh to reconnect.')
    }
  }

  const ownedQ = query(collection(db, COLLECTIONS.projects), where('owner', '==', uid))
  const unsubOwned = onSnapshot(ownedQ, handleSnapshot(ownedProjects, () => { ownedReady = true }), handleListenerError('owned'))

  const editorQ = query(collection(db, COLLECTIONS.projects), where(`members.${uid}`, '==', 'editor'))
  const unsubEditor = onSnapshot(editorQ, handleSnapshot(editorProjects, () => { editorReady = true }), handleListenerError('editor'))

  const viewerQ = query(collection(db, COLLECTIONS.projects), where(`members.${uid}`, '==', 'viewer'))
  const unsubViewer = onSnapshot(viewerQ, handleSnapshot(viewerProjects, () => { viewerReady = true }), handleListenerError('viewer'))

  return () => {
    unsubOwned()
    unsubEditor()
    unsubViewer()
  }
}

/** Check if a project document exists. */
export async function projectExists(projectId: string): Promise<boolean> {
  if (!db) return false
  const ref = doc(db, COLLECTIONS.projects, projectId)
  const snap = await getDoc(ref)
  return snap.exists()
}

// --- Settings operations ---

/** Load user settings from Firestore. */
export async function loadSettings(uid: string): Promise<FirestoreSettingsDoc | null> {
  if (!db) return null
  const ref = doc(db, COLLECTIONS.settings, uid)
  const snap = await getDoc(ref)
  return snap.exists() ? (snap.data() as FirestoreSettingsDoc) : null
}

/** Save user settings (debounced). */
export function saveSettings(uid: string, data: FirestoreSettingsDoc): void {
  debouncedSave('settings', async () => {
    if (!db) return
    const ref = doc(db, COLLECTIONS.settings, uid)
    await setDoc(ref, sanitizeForFirestore(data), { merge: true })
  })
}

/** Save user settings immediately (no debounce). */
export async function saveSettingsImmediate(uid: string, data: FirestoreSettingsDoc): Promise<void> {
  if (!db) return
  const ref = doc(db, COLLECTIONS.settings, uid)
  await setDoc(ref, sanitizeForFirestore(data), { merge: true })
}

// --- Profile operations ---
//
// Profile writes were moved to `./profileWrites.ts` (Lesson 62) so the
// dual-write contract is encapsulated in a unit-testable module. Consumers
// import `upsertProfile` / `upsertSuiteProfile` / `writeUserProfile` from
// there, not from this driver. Empty section retained as a navigation
// landmark.

export { stripFirestoreFields }
