// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firestore CRUD operations for SPERT Forecaster data.
// Project/settings writes use mergeFields so cleared optional scalars are
// actually removed from Firestore rather than silently surviving (C1/C2).
// Saves are debounced at 200ms; flushed on both beforeunload AND pagehide
// (bfcache + iOS Safari compatibility — D1/D2).

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

// --- mergeFields constants (C1/C2) ---
//
// setDoc({ mergeFields: [...] }) wholesale-replaces each listed top-level key
// and leaves everything else on the server untouched. Critically — and unlike
// merge: true — a listed field that is ABSENT from the source object is
// DELETED from Firestore. That is precisely the behavior we want: when the
// user clears projectStartDate locally, sanitizeForFirestore strips the
// undefined value, the field is absent at write time, and mergeFields removes
// it from the server. Under merge: true the deep-merge preserved the old
// value and the date silently resurrected on the next browser refresh.
//
// owner/members are deliberately absent from PROJECT_MERGE_FIELDS so the
// debounced save path cannot overwrite ACL fields.

export const PROJECT_MERGE_FIELDS: (keyof Omit<FirestoreProjectDoc, 'owner' | 'members'>)[] = [
  'name', 'unitOfMeasure', 'sprintCadenceWeeks',
  'projectStartDate', 'projectFinishDate', 'firstSprintStartDate',
  'productivityAdjustments', 'milestones', 'sprints',
  'createdAt', 'updatedAt', '_originRef', '_changeLog', 'schemaVersion',
]
// Compile-time exhaustiveness: TypeScript errors if FirestoreProjectDoc gains
// a new writable field. Update PROJECT_MERGE_FIELDS to include it.
type _ProjectWriteKey = Exclude<keyof FirestoreProjectDoc, 'owner' | 'members'>
const _PROJECT_WRITE_KEYS_GUARD: Record<_ProjectWriteKey, true> = {
  name: true, unitOfMeasure: true, sprintCadenceWeeks: true,
  projectStartDate: true, projectFinishDate: true, firstSprintStartDate: true,
  productivityAdjustments: true, milestones: true, sprints: true,
  createdAt: true, updatedAt: true, _originRef: true, _changeLog: true,
  schemaVersion: true,
}
void _PROJECT_WRITE_KEYS_GUARD

// Settings: all fields always present when written — no clearable-to-undefined
// scalars. The mergeFields switch is symmetry-only with saveProject, not a
// data-resurrection fix.
export const SETTINGS_MERGE_FIELDS: (keyof FirestoreSettingsDoc)[] = [
  'autoRecalculate', 'trialCount', 'defaultChartFontSize',
  'defaultCustomPercentile', 'defaultCustomPercentile2',
  'defaultResultsPercentiles', 'distributionsEnabled',
]
type _SettingsWriteKey = keyof FirestoreSettingsDoc
const _SETTINGS_WRITE_KEYS_GUARD: Record<_SettingsWriteKey, true> = {
  autoRecalculate: true, trialCount: true, defaultChartFontSize: true,
  defaultCustomPercentile: true, defaultCustomPercentile2: true,
  defaultResultsPercentiles: true, distributionsEnabled: true,
}
void _SETTINGS_WRITE_KEYS_GUARD

// --- Debounce infrastructure ---

/**
 * Debounce delay for saveProject / saveSettings. Exported so the new-project
 * first-write timer in useCloudSync shares a single source of truth with
 * debouncedSave's default. Any change here propagates to all call sites.
 */
export const SAVE_DEBOUNCE_MS = 200

const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingSaveFns = new Map<string, () => Promise<void>>()

function debouncedSave(key: string, saveFn: () => Promise<void>, delayMs = SAVE_DEBOUNCE_MS): void {
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

/**
 * Save a project document (debounced, UPDATE PATH ONLY).
 *
 * Do NOT call for a project that does not yet exist in Firestore. This
 * function strips owner and members and writes with setDoc({ mergeFields }) —
 * the payload omits owner, which fails the create rule:
 *   allow create: if isAuth() && request.resource.data.owner == request.auth.uid
 * Result: PERMISSION_DENIED on first write. For first-ever writes, use
 * saveProjectImmediate. See pendingCreateTimers in useCloudSync.
 *
 * Uses mergeFields so cleared optional scalars are actually deleted from
 * Firestore (C1/C2). owner/members are stripped here AND excluded from
 * PROJECT_MERGE_FIELDS — belt-and-braces against accidentally writing ACL
 * fields from the debounced save path.
 */
export function saveProject(projectId: string, data: FirestoreProjectDoc): void {
  debouncedSave(`project:${projectId}`, async () => {
    if (!db) return
    const ref = doc(db, COLLECTIONS.projects, projectId)
    const { owner: _o, members: _m, ...dataWithoutOwnership } = data
    await setDoc(ref, sanitizeForFirestore(dataWithoutOwnership), { mergeFields: PROJECT_MERGE_FIELDS })
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

/** Save user settings (debounced). Uses mergeFields for symmetry with saveProject. */
export function saveSettings(uid: string, data: FirestoreSettingsDoc): void {
  debouncedSave('settings', async () => {
    if (!db) return
    const ref = doc(db, COLLECTIONS.settings, uid)
    await setDoc(ref, sanitizeForFirestore(data), { mergeFields: SETTINGS_MERGE_FIELDS })
  })
}

/** Save user settings immediately (no debounce). */
export async function saveSettingsImmediate(uid: string, data: FirestoreSettingsDoc): Promise<void> {
  if (!db) return
  const ref = doc(db, COLLECTIONS.settings, uid)
  await setDoc(ref, sanitizeForFirestore(data), { mergeFields: SETTINGS_MERGE_FIELDS })
}

// --- Profile operations ---
//
// Profile writes were moved to `./profileWrites.ts` (Lesson 62) so the
// dual-write contract is encapsulated in a unit-testable module. Consumers
// import `upsertProfile` / `upsertSuiteProfile` / `writeUserProfile` from
// there, not from this driver. Empty section retained as a navigation
// landmark.

export { stripFirestoreFields }
