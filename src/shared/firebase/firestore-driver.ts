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
  getDocsFromServer,
  setDoc,
  deleteDoc,
  deleteField,
  FieldPath,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from './config'
import { COLLECTIONS, type FirestoreProjectDoc, type FirestoreSettingsDoc } from './types'
import { sanitizeForFirestore, stripFirestoreFields } from './firestore-sanitize'
import { SAVE_FAILED_TEXT } from './firestore-errors'
import {
  isUnsafePrefKey,
  projectPrefOf,
  type ProjectPref,
  type ProjectPrefField,
  type ProjectPrefs,
} from '@/shared/lib/project-prefs'

// --- mergeFields constants (C1/C2) ---
//
// setDoc({ mergeFields: [...] }) wholesale-replaces each listed top-level key
// and leaves everything else on the server untouched.
//
// CRITICAL Web-SDK contract (fixed after a production regression): every path
// listed in mergeFields MUST be present in the data object, or the SDK throws
//   "Field 'X' is specified in your field mask but missing from your input data."
// This is the OPPOSITE of what an earlier version of this comment assumed. The
// Web SDK does NOT treat an absent masked field as a server-side delete — it
// rejects the whole write. A brand-new project created without the optional
// projectStartDate therefore crashed on its first debounced update: the field
// was in the mask but sanitizeForFirestore had stripped the undefined value.
//
// To actually delete a cleared optional scalar server-side (the original C1/C2
// intent — otherwise merge: true's deep-merge resurrects the old value on the
// next refresh) the field must be PRESENT in the data as a deleteField()
// sentinel. buildMergeWrite() below does exactly that for CLEARABLE_PROJECT_FIELDS
// and, as a backstop, drops any other masked field that is unexpectedly absent
// so a missing field can never re-trigger the throw.
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

// Optional project scalars that the user can clear back to undefined. When a
// value is present it is written normally; when it is absent (cleared →
// stripped by sanitizeForFirestore) buildMergeWrite substitutes a deleteField()
// sentinel so the field stays in the mask (no throw) AND is removed server-side.
// Every entry MUST also appear in PROJECT_MERGE_FIELDS.
export const CLEARABLE_PROJECT_FIELDS: (keyof FirestoreProjectDoc)[] = [
  'sprintCadenceWeeks', 'projectStartDate', 'projectFinishDate', 'firstSprintStartDate',
]

// Settings: all fields always present when written — no clearable-to-undefined
// scalars. The mergeFields switch is symmetry-only with saveProject, not a
// data-resurrection fix.
export const SETTINGS_MERGE_FIELDS: (keyof FirestoreSettingsDoc)[] = [
  'autoRecalculate', 'trialCount', 'defaultChartFontSize',
  'defaultCustomPercentile', 'defaultCustomPercentile2',
  'defaultResultsPercentiles', 'distributionsEnabled',
]
// `projectPrefs` is excluded, as `owner` and `members` are from the project guard: it is never
// in SETTINGS_MERGE_FIELDS, so an ordinary settings save cannot touch the map. It is written
// entry by entry, one FieldPath per (project id, field), by saveProjectPrefs and
// uploadProjectPrefs below.
type _SettingsWriteKey = Exclude<keyof FirestoreSettingsDoc, 'projectPrefs'>
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
/** v0.50.0: the tile colour and archive (project id, field) pairs changed since the last prefs write (saveProjectPrefs). */
const pendingPrefChanges = new Map<string, { projectId: string; field: ProjectPrefField }>()
// Writes handed to the SDK and not yet settled, per key. A COUNT, not a flag: a
// second write to the same key can be issued before the first one settles.
const inFlightSaves = new Map<string, number>()

async function runSave(key: string, saveFn: () => Promise<void>): Promise<void> {
  inFlightSaves.set(key, (inFlightSaves.get(key) ?? 0) + 1)
  try {
    await saveFn()
  } finally {
    // ⚠️ In `finally`, not on success only. The SDK settles a refused write's
    // promise BEFORE it dispatches the rollback snapshot (listeners run via
    // setTimeout(0)), so the project is no longer protected when the rollback
    // arrives, and the refused edit reverts in the store as it should.
    const left = (inFlightSaves.get(key) ?? 1) - 1
    if (left > 0) inFlightSaves.set(key, left)
    else inFlightSaves.delete(key)
  }
}

/**
 * TRUE while a save of this project waits in its debounce timer or has been
 * handed to the SDK and not yet settled. useCloudSync keeps the store's version
 * of such a project when a snapshot arrives (Brief 40): its newest state is not
 * in that snapshot yet.
 */
export function isProjectSaveOutstanding(projectId: string): boolean {
  const key = `project:${projectId}`
  return pendingSaveTimers.has(key) || inFlightSaves.has(key)
}

/**
 * `onError` (Brief 39): the caller's own report of a failed write. A project
 * save's refusal text depends on the user's access to that project, which only
 * useCloudSync knows; without one, the generic text.
 */
function debouncedSave(
  key: string,
  saveFn: () => Promise<void>,
  delayMs = SAVE_DEBOUNCE_MS,
  onError?: (err: unknown) => void,
): void {
  const existingTimer = pendingSaveTimers.get(key)
  if (existingTimer) clearTimeout(existingTimer)

  pendingSaveFns.set(key, saveFn)
  pendingSaveTimers.set(
    key,
    setTimeout(async () => {
      pendingSaveTimers.delete(key)
      pendingSaveFns.delete(key)
      try {
        await runSave(key, saveFn)
      } catch (err) {
        console.error(`Firestore save failed for ${key}:`, err)
        if (onError) onError(err)
        else toast.error(SAVE_FAILED_TEXT)
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
  // The tile colour and archive changes waiting for their write go too: otherwise a change
  // made before a sign-out would be written into the NEXT account's settings document.
  pendingPrefChanges.clear()
}

/**
 * Cancel the pending debounced saves of these projects only (Brief 39). An
 * import cancels the saves of the projects it is about to rewrite or delete —
 * a pre-import save firing after the import's own write would overwrite it —
 * and leaves every other project's pending save to fire on its own timer.
 */
export function cancelPendingProjectSaves(projectIds: Iterable<string>): void {
  for (const projectId of projectIds) {
    const key = `project:${projectId}`
    const timer = pendingSaveTimers.get(key)
    if (timer) clearTimeout(timer)
    pendingSaveTimers.delete(key)
    pendingSaveFns.delete(key)
  }
}

/** Flush all pending debounced writes immediately (call on beforeunload). */
export function flushPendingSaves(): void {
  for (const [key, timer] of pendingSaveTimers) {
    clearTimeout(timer)
    pendingSaveTimers.delete(key)
  }
  for (const [key, saveFn] of pendingSaveFns) {
    pendingSaveFns.delete(key)
    runSave(key, saveFn).catch((err) => console.error(`Flush save failed for ${key}:`, err))
  }
}

/**
 * Prepare a { payload, mask } pair for a setDoc({ mergeFields }) write that
 * satisfies the Web SDK invariant "every masked path is present in the data".
 *
 * - `clearable` fields absent from `data` are re-added as deleteField() so they
 *   remain in the mask and are deleted server-side (delete-on-clear, C1/C2).
 * - The returned mask is the requested `mergeFields` intersected with the keys
 *   actually present in the payload — a backstop so any non-clearable field
 *   that is unexpectedly missing is quietly dropped rather than crashing the
 *   whole write.
 *
 * `data` must already be sanitized (undefined values stripped) so that a
 * genuinely-absent optional field is distinguishable from a present one.
 */
function buildMergeWrite(
  data: object,
  mergeFields: readonly string[],
  clearable: readonly string[] = [],
): { payload: Record<string, unknown>; mask: string[] } {
  const payload: Record<string, unknown> = { ...(data as Record<string, unknown>) }
  for (const field of clearable) {
    if (!(field in payload)) payload[field] = deleteField()
  }
  const mask = mergeFields.filter((field) => field in payload)
  return { payload, mask }
}

// --- Project operations ---

/**
 * Load all projects where the user is owner or member, FROM THE SERVER.
 *
 * ⚠️ getDocsFromServer, not getDocs: offline, getDocs resolves from the local
 * cache — empty on a fresh page — and that empty answer used to count as "the
 * cloud has nothing". useCloudSync treats this load as the baseline that every
 * create decision rests on, so it must be the server's answer or a failure.
 * Offline it rejects with code `unavailable` (Brief 40).
 */
export async function loadProjects(uid: string): Promise<Map<string, FirestoreProjectDoc>> {
  if (!db) throw new Error('Firestore not available')

  const result = new Map<string, FirestoreProjectDoc>()

  // ⚠️ These filters' SHAPES are a security boundary, not a convenience.
  // firestore.rules constrains `list` on this collection to
  // owner == uid || members[uid] in ['editor', 'viewer'], and Firestore permits
  // a list query ONLY when its filter PROVES one branch of that. Drop or change
  // a filter and you do not get more rows — you get PERMISSION_DENIED, and no
  // project loads at all.
  // Forecaster deliberately keeps `owner` OUT of the members map, which is why
  // its rule is disjunctive and differs from the other six apps.
  // Until 2026-08-19 the rule was `allow list: if isAuth()`, which let any
  // signed-in SPERT user read every project in this collection.
  // ⚠️ The rule and these queries are pinned together by
  // rules-tests/project-collections-list.test.ts in the spert-landing-page
  // repo (`npm run test:rules`). That test encodes these queries AS WRITTEN and
  // lives in a DIFFERENT repository, so it will NOT fail when you edit these
  // lines. Change one, change the other.
  // Query owned projects
  const ownedQ = query(
    collection(db, COLLECTIONS.projects),
    where('owner', '==', uid)
  )
  const ownedSnap = await getDocsFromServer(ownedQ)
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
    const memberSnap = await getDocsFromServer(memberQ)
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
  // ⚠️ Same security-load-bearing filter as `loadProjects()` — see the note
  // there. The Firestore `list` rule only permits a query whose filter proves
  // owner == uid or membership, and the guard that pins rule and query together
  // lives in the spert-landing-page repo, where it cannot see edits made here.
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
 * Uses mergeFields (via buildMergeWrite) so cleared optional scalars are
 * actually deleted from Firestore — written as deleteField() sentinels rather
 * than dropped from the payload, which the Web SDK would reject (C1/C2).
 * owner/members are stripped here AND excluded from PROJECT_MERGE_FIELDS —
 * belt-and-braces against accidentally writing ACL fields from the debounced
 * save path.
 */
export function saveProject(
  projectId: string,
  data: FirestoreProjectDoc,
  onError?: (err: unknown) => void,
): void {
  debouncedSave(`project:${projectId}`, async () => {
    if (!db) return
    const ref = doc(db, COLLECTIONS.projects, projectId)
    const { owner: _o, members: _m, ...dataWithoutOwnership } = data
    const { payload, mask } = buildMergeWrite(
      sanitizeForFirestore(dataWithoutOwnership),
      PROJECT_MERGE_FIELDS,
      CLEARABLE_PROJECT_FIELDS,
    )
    await setDoc(ref, payload, { mergeFields: mask })
  }, SAVE_DEBOUNCE_MS, onError)
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

type QueryScope = 'owned' | 'editor' | 'viewer'

/**
 * Subscribe to real-time updates for all projects where user is owner or member.
 *
 * ⚠️ EVERY raise is applied, pending or not (Brief 40). The SDK raises nothing
 * when a write is acknowledged, so a dropped pending raise left that query's map
 * holding the pre-write document for good — and the next raise on ANY query
 * pushed it into the store. The caller decides what to keep, per project
 * (useCloudSync → mergeCloudView); this function never filters.
 *
 * ⚠️ ONE notify per burst of raises (Brief 40, B1). The SDK delivers each
 * listener's raise in its own setTimeout(0), editor before viewer, so a role
 * change — the project leaves one query and joins another — arrives as two
 * raises. Notifying on each handed the caller a view WITHOUT the project in
 * between: the merge dropped it, then appended it last, and the project on
 * screen changed. The notify is deferred by one deduplicated setTimeout(0),
 * which queues behind the sibling raises the SDK has already scheduled.
 */
export function subscribeToUserProjects(
  uid: string,
  callback: (projects: Map<string, FirestoreProjectDoc>) => void
): Unsubscribe {
  if (!db) return () => {}

  // Track results from each listener separately to avoid flicker on merge
  const results: Record<QueryScope, Map<string, FirestoreProjectDoc>> = {
    owned: new Map(), editor: new Map(), viewer: new Map(),
  }
  // Wait until all three listeners have delivered their first snapshot — of any
  // kind — before calling the callback, to prevent briefly dropping shared
  // projects. A first raise that is pending, or served from cache, counts:
  // waiting for a non-pending one deadlocked the listener whenever a write was
  // pending at subscribe.
  const ready: Record<QueryScope, boolean> = { owned: false, editor: false, viewer: false }
  // Per subscription, never module-level: a re-subscribe must not share it.
  let notifyTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribed = false

  function mergeAndNotify() {
    if (!ready.owned || !ready.editor || !ready.viewer) return

    const merged = new Map<string, FirestoreProjectDoc>()
    // Lower-priority first so owned takes precedence
    for (const [id, d] of results.viewer) merged.set(id, d)
    for (const [id, d] of results.editor) merged.set(id, d)
    for (const [id, d] of results.owned) merged.set(id, d)
    callback(merged)
  }

  function scheduleNotify() {
    if (notifyTimer !== null) return
    notifyTimer = setTimeout(() => {
      // ⚠️ Cleared BEFORE the callback runs. A callback that throws (a malformed
      // document does) would otherwise leave the handle set, and every later
      // raise would find a notify "already scheduled": sync silenced until a reload.
      notifyTimer = null
      if (!unsubscribed) mergeAndNotify()
    }, 0)
  }

  function handleSnapshot(scope: QueryScope) {
    return (snapshot: import('firebase/firestore').QuerySnapshot) => {
      const target = results[scope]
      target.clear()
      for (const docSnap of snapshot.docs) {
        target.set(docSnap.id, docSnap.data() as FirestoreProjectDoc)
      }
      ready[scope] = true
      scheduleNotify()
    }
  }

  function handleListenerError(scope: 'owned' | 'editor' | 'viewer') {
    return (error: Error) => {
      console.error(`Firestore listener error (${scope}):`, error)
      toast.error('Lost real-time connection to the cloud. Refresh to reconnect.')
    }
  }

  // ⚠️ These filters' SHAPES are a security boundary, not a convenience.
  // firestore.rules constrains `list` on this collection to
  // owner == uid || members[uid] in ['editor', 'viewer'], and Firestore permits
  // a list query ONLY when its filter PROVES one branch of that. Drop or change
  // a filter and you do not get more rows — you get PERMISSION_DENIED, and no
  // project loads at all.
  // Forecaster deliberately keeps `owner` OUT of the members map, which is why
  // its rule is disjunctive and differs from the other six apps.
  // Until 2026-08-19 the rule was `allow list: if isAuth()`, which let any
  // signed-in SPERT user read every project in this collection.
  // ⚠️ The rule and these queries are pinned together by
  // rules-tests/project-collections-list.test.ts in the spert-landing-page
  // repo (`npm run test:rules`). That test encodes these queries AS WRITTEN and
  // lives in a DIFFERENT repository, so it will NOT fail when you edit these
  // lines. Change one, change the other.
  const ownedQ = query(collection(db, COLLECTIONS.projects), where('owner', '==', uid))
  const unsubOwned = onSnapshot(ownedQ, handleSnapshot('owned'), handleListenerError('owned'))

  const editorQ = query(collection(db, COLLECTIONS.projects), where(`members.${uid}`, '==', 'editor'))
  const unsubEditor = onSnapshot(editorQ, handleSnapshot('editor'), handleListenerError('editor'))

  const viewerQ = query(collection(db, COLLECTIONS.projects), where(`members.${uid}`, '==', 'viewer'))
  const unsubViewer = onSnapshot(viewerQ, handleSnapshot('viewer'), handleListenerError('viewer'))

  return () => {
    // Nothing notifies after an unsubscribe (sign-out, mode switch, teardown).
    unsubscribed = true
    if (notifyTimer !== null) {
      clearTimeout(notifyTimer)
      notifyTimer = null
    }
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
    const { payload, mask } = buildMergeWrite(sanitizeForFirestore(data), SETTINGS_MERGE_FIELDS)
    await setDoc(ref, payload, { mergeFields: mask })
  })
}

// --- Tile colour and archive (v0.50.0) ---
//
// ⚠️ One FieldPath per (project id, field), with deleteField() for a field being cleared, and a
// payload built from the changed entries only. It NEVER passes through sanitizeForFirestore,
// which rebuilds every object from Object.entries and so turns the deleteField() sentinel into
// a plain map (stored as data; nothing deleted), nor through buildMergeWrite, which keeps a mask
// field only when `field in payload` and so drops every nested path (the write changes
// nothing). Both fail silently on the real SDK (R2 consequence review, probes 2 and 3). The
// Web SDK throws when a masked field is absent from the data, and silently drops a
// deleteField() outside the mask, so every masked path is given a value or deleteField().

const PREFS_SAVE_KEY = 'projectPrefs'

/** The payload and mask that write exactly these fields from `prefs`: each a value, or deleteField(). */
export function buildProjectPrefsWrite(
  changes: { projectId: string; field: ProjectPrefField }[],
  prefs: ProjectPrefs,
): { payload: { projectPrefs: Record<string, Record<string, unknown>> }; mask: FieldPath[] } {
  // A Map, not an object: a project id such as `hasOwnProperty` must not find an inherited member.
  const entries = new Map<string, Record<string, unknown>>()
  const mask: FieldPath[] = []
  const seen = new Set<string>()
  for (const { projectId, field } of changes) {
    if (isUnsafePrefKey(projectId)) continue
    const key = JSON.stringify([projectId, field])
    if (seen.has(key)) continue
    seen.add(key)
    const value = projectPrefOf(prefs, projectId)[field]
    const entry = entries.get(projectId) ?? {}
    entry[field] = value === undefined ? deleteField() : value
    entries.set(projectId, entry)
    mask.push(new FieldPath('projectPrefs', projectId, field))
  }
  return { payload: { projectPrefs: Object.fromEntries(entries) }, mask }
}

/**
 * Write changed tile colours and archives (debounced, coalesced). Debounced under its own key,
 * never `'settings'`: debouncedSave keeps one function per key, so a shared key would drop one
 * of the two writes. The buffer holds (id, field) pairs only; the values are read from
 * `readPrefs` when the timer fires, so the write carries the newest state. cancelPendingSaves
 * empties the buffer; flushPendingSaves sends it with the other saves.
 */
export function saveProjectPrefs(
  uid: string,
  changes: { projectId: string; field: ProjectPrefField }[],
  readPrefs: () => ProjectPrefs,
): void {
  for (const change of changes) pendingPrefChanges.set(JSON.stringify([change.projectId, change.field]), change)
  debouncedSave(PREFS_SAVE_KEY, async () => {
    const drained = [...pendingPrefChanges.values()]
    pendingPrefChanges.clear()
    if (!db || drained.length === 0) return
    const { payload, mask } = buildProjectPrefsWrite(drained, readPrefs())
    if (mask.length === 0) return
    await setDoc(doc(db, COLLECTIONS.settings, uid), payload, { mergeFields: mask })
  })
}

/**
 * The local → cloud upload's write of the uploaded projects' entries, immediate and awaited
 * (never debounced: a failure must reach the upload's errors, or the switch to cloud would
 * happen and the first cloud load would replace the local map with the cloud's). Both fields of
 * every entry are masked: a field the entry lacks is cleared, so an entry holding only a colour
 * clears the cloud's `archived`. Every other cloud entry is left alone. Throws on failure.
 */
export async function uploadProjectPrefs(
  uid: string,
  entries: { projectId: string; pref: ProjectPref }[],
): Promise<void> {
  if (!db || entries.length === 0) return
  const fields: ProjectPrefField[] = ['color', 'archived']
  const changes = entries.flatMap(({ projectId }) => fields.map((field) => ({ projectId, field })))
  const prefs = Object.fromEntries(entries.map(({ projectId, pref }) => [projectId, pref]))
  const { payload, mask } = buildProjectPrefsWrite(changes, prefs)
  if (mask.length === 0) return
  await setDoc(doc(db, COLLECTIONS.settings, uid), payload, { mergeFields: mask })
}

/** Save user settings immediately (no debounce). */
export async function saveSettingsImmediate(uid: string, data: FirestoreSettingsDoc): Promise<void> {
  if (!db) return
  const ref = doc(db, COLLECTIONS.settings, uid)
  const { payload, mask } = buildMergeWrite(sanitizeForFirestore(data), SETTINGS_MERGE_FIELDS)
  await setDoc(ref, payload, { mergeFields: mask })
}

// --- Profile operations ---
//
// Profile writes were moved to `./profileWrites.ts` (Lesson 62) so the
// dual-write contract is encapsulated in a unit-testable module. Consumers
// import `upsertProfile` / `upsertSuiteProfile` / `writeUserProfile` from
// there, not from this driver. Empty section retained as a navigation
// landmark.

export { stripFirestoreFields }
