// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/state/project-store'
import { useSettingsStore } from '@/shared/state/settings-store'
import { syncBus } from '@/shared/firebase/sync-bus'
import {
  loadProjects,
  saveProject,
  saveProjectImmediate,
  deleteProject,
  cancelPendingSaves,
  subscribeToUserProjects,
  loadSettings,
  saveSettings,
  flushPendingSaves,
  isProjectSaveOutstanding,
  cancelPendingProjectSaves,
  SAVE_DEBOUNCE_MS,
} from '@/shared/firebase/firestore-driver'
import { mergeCloudView, type CloudMergeResult } from '@/shared/firebase/snapshot-merge'
import {
  createFailureText,
  deleteFailureText,
  importSaveFailureText,
  saveFailureText,
  NOT_IN_CLOUD_SAVE_TEXT,
} from '@/shared/firebase/firestore-errors'
import { accessFromState, roleFromDoc, type ProjectAccess } from '@/shared/state/project-access'
import { bumpSimulationGeneration } from '@/shared/lib/simulation-generation'
import { auth } from '@/shared/firebase/config'
import {
  projectToFirestoreDoc,
  firestoreDocToProject,
  firestoreDocToSprints,
  settingsToFirestoreDoc,
  firestoreDocToSettings,
} from '@/shared/firebase/firestore-converters'
import type { FirestoreProjectDoc, SyncEvent } from '@/shared/firebase/types'
import type { Project, Sprint } from '@/shared/types'
import { getWorkspaceId } from '@/shared/state/storage'

/**
 * Convert Firestore project docs into typed arrays for the Zustand store, and
 * the signed-in user's role on each (Brief 39), from the doc's owner/members.
 */
function processProjectDocs(
  projectDocs: Iterable<[string, FirestoreProjectDoc]>,
  docMetaRef: React.MutableRefObject<Map<string, FirestoreProjectDoc>>,
  uid: string
): { projects: Project[]; sprints: Sprint[]; roles: Record<string, ProjectAccess> } {
  const projects: Project[] = []
  const sprints: Sprint[] = []
  const roles: Record<string, ProjectAccess> = {}

  for (const [docId, doc] of projectDocs) {
    docMetaRef.current.set(docId, doc)
    roles[docId] = roleFromDoc(doc, uid)
    projects.push(firestoreDocToProject(docId, doc))
    sprints.push(...firestoreDocToSprints(doc))
  }

  return { projects, sprints, roles }
}

/**
 * Write a merged cloud view into the store. ⚠️ The roles go in on EVERY view
 * (Brief 39): a role change alters only `members`, which no store project
 * carries, so it arrives in a view whose merge changes nothing — writing roles
 * only when the projects changed would never deliver it. When the projects did
 * change, the roles ride in the same set(): one store write (each set()
 * re-persists the whole dataset), and the map is replaced wholesale, so a
 * project that left the view loses its entry in the write that drops it.
 */
function applyCloudView(merged: CloudMergeResult, roles: Record<string, ProjectAccess>): void {
  const store = useProjectStore.getState()
  if (merged.changed) store.replaceProjectsFromCloud(merged.projects, merged.sprints, roles)
  else store.setProjectRoles(roles)
}

/**
 * The entries for a store Brief 40's zero-project guard keeps (Brief 39, V1):
 * the cloud returned nothing for this account, so every project the store
 * holds is `not-in-cloud` — except one this browser is creating, which no view
 * can contain yet and which stays the user's own (no entry → `owner`).
 */
function notInCloudRoles(
  projects: Project[],
  isBeingCreated: (projectId: string) => boolean
): Record<string, ProjectAccess> {
  const roles: Record<string, ProjectAccess> = {}
  for (const p of projects) if (!isBeingCreated(p.id)) roles[p.id] = 'not-in-cloud'
  return roles
}

/**
 * Waits between attempts at the first cloud load after a TRANSIENT failure; the
 * last value repeats. A browser 'online' event, or Try again, cuts a wait short.
 */
export const FIRST_LOAD_RETRY_MS = [2000, 4000, 8000, 16000, 30000] as const

/**
 * First-load failures that a retry can cure (Brief 40, B2). Offline,
 * getDocsFromServer rejects with `unavailable`, and the SDK reports every stream
 * error it retries itself (deadline-exceeded, resource-exhausted, …) the same
 * way once it decides it is offline. Anything else — permission-denied, or a
 * data error thrown while applying the baseline — would fail the same way again,
 * so it waits for Try again instead of retrying.
 */
const TRANSIENT_LOAD_CODES: ReadonlySet<string> = new Set(['unavailable', 'deadline-exceeded', 'resource-exhausted'])

function errorField(err: unknown, field: 'code' | 'name'): string | undefined {
  const value = typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[field] : undefined
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * What the error panel shows for a failed first load: the error's Firestore
 * `code` if it has one, else its `name` (a malformed document throws a plain
 * TypeError), else `unknown`.
 */
export function loadErrorCode(err: unknown): string {
  return errorField(err, 'code') ?? errorField(err, 'name') ?? 'unknown'
}

const isTransientLoadError = (err: unknown): boolean => TRANSIENT_LOAD_CODES.has(errorField(err, 'code') ?? '')

const isProjectEvent = (event: SyncEvent): event is Extract<SyncEvent, { type: `project:${string}` }> =>
  event.type.startsWith('project:')

/**
 * Cloud sync hook — activates Firestore sync when in cloud mode.
 * Subscribes to:
 *   - Firestore onSnapshot for incoming changes (Firestore → Zustand)
 *   - Sync bus for outgoing changes (Zustand → Firestore)
 */
export function useCloudSync(user: User | null, mode: 'local' | 'cloud') {
  const isActive = mode === 'cloud' && !!user
  const userRef = useRef(user)
  // Intentional latest-value ref write during render. userRef is only consumed
  // inside sync-bus effect callbacks, never during render itself. Moving to
  // useEffect would introduce a stale-ref window between render commit and
  // effect run.
  // eslint-disable-next-line react-hooks/refs -- intentional latest-value ref write (see above): userRef is read only inside sync-bus effect callbacks, never during render
  userRef.current = user

  // Track Firestore doc metadata for proper saves (owner/members)
  const docMetaRef = useRef<Map<string, FirestoreProjectDoc>>(new Map())

  useEffect(() => {
    if (!isActive || !user) return

    const uid = user.uid
    let cancelled = false

    // Brief 39, V1. The stored projects are the cloud view of the account whose
    // first load last succeeded here (`cloudAccountId`). Another account must
    // never see them — whether or not anyone signed out in between — so they
    // are cleared before this account's first load, with what a sign-out clears
    // (performSignOutCleanup) except the storage mode: this account is mid-load.
    // The previous run's cleanup has already cancelled its pending saves.
    // docMetaRef is a component ref that outlives this effect: it is emptied
    // too, so no owner or members of a previous session can reach this one's
    // writes.
    docMetaRef.current.clear()
    const atStart = useProjectStore.getState()
    if (atStart.cloudAccountId !== '' && atStart.cloudAccountId !== uid) {
      bumpSimulationGeneration()                              // discard the previous account's runs
      atStart.clearProjectsOnAccountChange()
      useSettingsStore.getState().clearSettingsOnSignOut()    // Export Attribution: the next account must not export as this one
      // As at every other call site that clears the projects: the previous
      // account's AI pairing ends with its session.
      syncBus.emit({ type: 'ai:session-teardown', reason: 'signout' })
    }
    let unsubscribeSnapshot: (() => void) | null = null
    let unsubscribeSyncBus: (() => void) | null = null

    // First-write timers for projects not yet confirmed in Firestore.
    // docMetaRef is intentionally NOT populated while a timer is live — that
    // keeps every event in a rapid-fire burst (e.g. loadSampleProject's 14
    // synchronous mutations) resetting the timer, so the single write that
    // fires reads the fully-accumulated store state at fire time. The 200ms
    // debounce window is shared with saveProject via SAVE_DEBOUNCE_MS.
    const pendingCreateTimers = new Map<string, ReturnType<typeof setTimeout>>()

    // Promises for saveProjectImmediate calls currently in flight. Saves and
    // deletes arriving during the Firestore create round-trip chain behind
    // this promise to prevent PERMISSION_DENIED-on-update (mergeFields write
    // against a non-existent doc) and the zombie-reappear UX (delete races
    // ahead of create → snapshot re-inserts the project).
    const inFlightCreatePromises = new Map<string, Promise<void>>()

    const isCreateUnconfirmed = (projectId: string) =>
      pendingCreateTimers.has(projectId) || inFlightCreatePromises.has(projectId) || importCreatesInFlight.has(projectId)

    // Local deletes issued and not yet settled. A snapshot built before the
    // delete reached the SDK still holds the project; mergeCloudView must not
    // append it back. Cleared when the delete settles, so a REFUSED delete's
    // rollback brings the project back, honestly.
    const pendingDeletes = new Set<string>()

    // The ids of the latest cloud view applied here — the first load, then each
    // snapshot (Brief 39). docMetaRef never forgets a document that left the
    // view; this does. An import deletes, and takes owner/members from
    // docMetaRef for, only ids in this set: what this account's cloud holds as
    // far as this browser knows.
    let latestViewIds = new Set<string>()

    // The import's own saves still in flight, by project id (Brief 39). Merged
    // like any other outstanding save, so a raise built before the import
    // reached the SDK cannot show a project's pre-import version or drop a
    // project the import just added.
    const importSavesInFlight = new Map<string, number>()
    const importCreatesInFlight = new Set<string>()
    const isImportSaveOutstanding = (projectId: string) => importSavesInFlight.has(projectId)

    // ── First-load gate (Brief 40, R2) ──────────────────────────────────────
    // Until the first cloud load has SUCCEEDED, no project write leaves this
    // device. Before it, the store holds this device's last copy — possibly
    // stale — and docMetaRef is empty, so every save would take the create path:
    // a full setDoc that resets an existing project's members to {} and writes
    // the stale copy over newer work. Writes are recorded by project id here and
    // dispositioned once the load lands (releaseHeldWrites). The UI shows a
    // loading panel instead of the project tabs meanwhile (AppShell), so in
    // practice nothing is held; this is the guarantee, the panel is the UX.
    let baselineReady = false
    const heldProjectIds = new Set<string>()
    // The current first-load wait's wake-up. Null while an attempt is in flight.
    let wakeRetry: (() => void) | null = null
    let loadFailureReported = false
    let transientFailures = 0

    /**
     * Synchronously fire any pending create timers (used on tab close).
     * Cancels the timer and dispatches saveProjectImmediate without awaiting,
     * matching flushPendingSaves' fire-and-let-race behavior. Without this,
     * a user who adds a project and closes the tab within SAVE_DEBOUNCE_MS
     * loses the create silently.
     */
    function flushPendingCreates(): void {
      const liveUser = auth?.currentUser
      if (!liveUser || liveUser.uid !== uid) {
        for (const t of pendingCreateTimers.values()) clearTimeout(t)
        pendingCreateTimers.clear()
        return
      }
      for (const [projectId, timer] of pendingCreateTimers) {
        clearTimeout(timer)
        const s = useProjectStore.getState()
        const p = s.projects.find((proj) => proj.id === projectId)
        if (!p) continue
        // Brief 39 (V5): an edit never creates a project that no cloud view of
        // this account contains — at unload either, as in Branch A's timer.
        if (accessFromState(s, projectId) === 'not-in-cloud') continue   // nothing sent; no toast — the page is unloading
        const doc = projectToFirestoreDoc(
          p,
          s.sprints,
          liveUser.uid,
          undefined,
          s._originRef || getWorkspaceId(),
          s._changeLog
        )
        const rawPromise = saveProjectImmediate(projectId, doc)
        inFlightCreatePromises.set(projectId, rawPromise)
        rawPromise
          .then(() => {
            if (auth?.currentUser?.uid !== uid) return
            docMetaRef.current.set(projectId, doc)
          })
          .catch((err) => {
            console.error('Cloud project creation failed (flush):', err)
          })
          .finally(() => {
            inFlightCreatePromises.delete(projectId)
          })
      }
      pendingCreateTimers.clear()
    }

    // Profile writes are owned by AuthProvider (single source of truth, fires
    // on every auth resolution regardless of storage mode). Removed from this
    // hook in v0.26.0 to support cross-app email→uid resolution for the
    // bulk-invitation system.

    // Closure-local sentinel for the snapshot data-loss guard (I1).
    // Limits the guard to the first snapshot of each cloud session so
    // access-revocation events on subsequent snapshots propagate to the
    // local store. Reset implicitly on every effect re-run (sign-out →
    // re-sign-in creates a new closure with snapshotEverReceived = false).
    let snapshotEverReceived = false

    /**
     * The first load is the baseline every later create decision rests on. It
     * is merged into the store with the same rules as a snapshot, so the store's
     * project order survives a reload on the same device.
     */
    function applyBaseline(projectDocs: Map<string, FirestoreProjectDoc>) {
      const { projects, sprints, roles } = processProjectDocs(projectDocs, docMetaRef, uid)
      latestViewIds = new Set(projectDocs.keys())

      // Data-loss guard: if cloud is empty but local has projects, skip
      // replacement on initial load. This prevents wiping un-migrated local
      // data when cloud mode activates without a prior upload.
      const store = useProjectStore.getState()
      if (projects.length === 0 && store.projects.length > 0) {
        console.warn(
          `Cloud returned 0 projects but local has ${store.projects.length} — skipping initial replacement to protect local data`
        )
        // Kept, but in no view for this account: read only (V1). A project
        // created here while the load was outstanding is released as a create
        // below, and stays the user's own.
        //
        // ⚠️ heldProjectIds holds every project WRITTEN during the load, not only
        // the ones created then, so a pre-existing project written during the
        // load would be exempt too, and its released write would create it as
        // this user's own. Safe only because nothing can write one then: the
        // loading panel covers every edit control, and the crosslink receiver
        // only previews in cloud mode. If a write path ever reaches a stored
        // project during the load, exempt only the projects created then.
        store.setProjectRoles(notInCloudRoles(store.projects, (projectId) => heldProjectIds.has(projectId)))
      } else {
        // A project created on this device while the load was outstanding is the
        // only store project the cloud is allowed to lack.
        const heldNew = (projectId: string) => heldProjectIds.has(projectId) && !projectDocs.has(projectId)
        const merged = mergeCloudView(store, { projects, sprints }, {
          isProtected: heldNew,
          isCreateUnconfirmed: heldNew,
          isDeletePending: () => false,
        })
        applyCloudView(merged, roles)
      }

      baselineReady = true
      store.setCloudLoadRetrying(false)
      store.setCloudLoadError(null)
      store.setCloudAccountId(uid)
    }

    /**
     * A write held before the first load touched a copy that may be stale. For a
     * project the cloud has, the cloud version now in the store wins and the
     * write is discarded. A project the cloud has never seen is created.
     *
     * ⚠️ A held DELETE of a project the cloud still has is discarded too, and the
     * baseline merge has already put that project back. Unreachable today: the
     * loading panel hides every delete control until the first load succeeds. If
     * a delete control ever becomes reachable during the load, handle it here.
     */
    function releaseHeldWrites(cloudDocs: Map<string, FirestoreProjectDoc>) {
      const held = [...heldProjectIds]
      heldProjectIds.clear()
      const inStore = new Set(useProjectStore.getState().projects.map((p) => p.id))
      for (const projectId of held) {
        if (!cloudDocs.has(projectId) && inStore.has(projectId)) {
          handleSyncEvent({ type: 'project:save', projectId })
        }
      }
    }

    /**
     * Wait for the next first-load attempt. After a TRANSIENT failure: the
     * backoff delay, a browser 'online' event or Try again, whichever comes
     * first. After any other failure (`delayMs` null): Try again only — no timer
     * and no 'online' wake, because nothing automatic can cure it. Teardown wakes
     * either.
     */
    function waitForRetry(delayMs: number | null): Promise<void> {
      return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const done = () => {
          clearTimeout(timer)
          window.removeEventListener('online', done)
          wakeRetry = null
          resolve()
        }
        if (delayMs !== null) {
          timer = setTimeout(done, delayMs)
          window.addEventListener('online', done)
        }
        wakeRetry = done
      })
    }

    /** Report a failed first-load attempt, then wait for the next one (B2). */
    function afterFailedLoad(err: unknown, transient: boolean): Promise<void> {
      if (!loadFailureReported) {
        loadFailureReported = true
        console.error('Initial cloud load failed:', err)
        toast.error('Failed to load your projects from the cloud.')
      }
      const store = useProjectStore.getState()
      if (transient) {
        store.setCloudLoadError(null)
        store.setCloudLoadRetrying(true)
        const delayMs = FIRST_LOAD_RETRY_MS[Math.min(transientFailures, FIRST_LOAD_RETRY_MS.length - 1)]
        transientFailures++
        return waitForRetry(delayMs)
      }
      store.setCloudLoadRetrying(false)
      store.setCloudLoadError({ code: loadErrorCode(err) })
      return waitForRetry(null)
    }

    /**
     * Resolves with the baseline's documents once it is applied, or null if the
     * effect was torn down first. It never gives up before either.
     */
    async function loadBaselineWithRetry(): Promise<Map<string, FirestoreProjectDoc> | null> {
      while (!cancelled) {
        let projectDocs: Map<string, FirestoreProjectDoc>
        try {
          projectDocs = await loadProjects(uid)
        } catch (err) {
          if (cancelled) return null
          await afterFailedLoad(err, isTransientLoadError(err))
          continue
        }
        // `cancelled` handles teardown; `auth?.currentUser?.uid !== uid` adds
        // belt-and-suspenders defense for the user-switch edge case where a
        // different account signs in before the old effect tears down (H2).
        if (cancelled || auth?.currentUser?.uid !== uid) return null
        try {
          applyBaseline(projectDocs)
          return projectDocs
        } catch (err) {
          // A data error while applying the baseline would fail the same way
          // again: it waits for Try again, whatever its code.
          await afterFailedLoad(err, false)
        }
      }
      return null
    }

    // --- Async setup: the baseline first, then the listeners ---
    async function setup() {
      const baselineDocs = await loadBaselineWithRetry()
      if (baselineDocs === null) return

      // Outside the first load's classified tries above (Brief 40): an exception
      // here must never put the error panel over a baseline that has loaded.
      try {
        releaseHeldWrites(baselineDocs)
      } catch (err) {
        console.error('Releasing writes held during the first cloud load failed:', err)
      }

      try {
        const settingsDoc = await loadSettings(uid)
        if (cancelled || auth?.currentUser?.uid !== uid) return
        if (settingsDoc) {
          const settings = firestoreDocToSettings(settingsDoc)
          useSettingsStore.getState().replaceSettingsFromCloud(settings)
        }
      } catch (err) {
        console.error('Initial cloud settings load failed:', err)
      }

      // Pitfall #88: cloudDataLoaded means the project baseline SUCCEEDED
      // (Brief 40). !cancelled: if setup() is suspended at an await when the
      // cleanup runs, the next microtask resumes setup() — by then `cancelled`
      // is already true and the signal is suppressed, so cleanup's false wins.
      if (cancelled) return
      useProjectStore.getState().setCloudDataLoaded(true)

      // Subscribe to Firestore snapshots (incoming changes)
      unsubscribeSnapshot = subscribeToUserProjects(uid, (projectDocs) => {
        // User-guard (H-2). Reject snapshots for a different user (user-switch
        // race) or when no user is signed in (post-sign-out). `uid` is the
        // closure variable from subscription setup, NOT a live read.
        if (auth?.currentUser?.uid !== uid) return

        const { projects, sprints, roles } = processProjectDocs(projectDocs, docMetaRef, uid)
        latestViewIds = new Set(projectDocs.keys())

        // Data-loss guard (I1) — fires AT MOST ONCE per cloud session. After
        // the first snapshot, subsequent empty snapshots propagate so that
        // legitimate access-revocation reaches the local store.
        if (!snapshotEverReceived) {
          snapshotEverReceived = true
          const localProjects = useProjectStore.getState().projects
          if (projects.length === 0 && localProjects.length > 0) {
            console.warn(
              `Cloud snapshot returned 0 projects but local has ${localProjects.length} — ` +
              `skipping first snapshot to protect local data`
            )
            useProjectStore.getState().setProjectRoles(notInCloudRoles(localProjects, isCreateUnconfirmed))
            return
          }
        }

        // Merged, never swapped in (Brief 40): the store's order is kept, a
        // project with a local write not yet in this view keeps the store's
        // version, and a merge that changes nothing writes nothing.
        const store = useProjectStore.getState()
        const merged = mergeCloudView(store, { projects, sprints }, {
          isProtected: (projectId) =>
            isProjectSaveOutstanding(projectId) || isCreateUnconfirmed(projectId) || isImportSaveOutstanding(projectId),
          isCreateUnconfirmed,
          isDeletePending: (projectId) => pendingDeletes.has(projectId),
        })
        applyCloudView(merged, roles)
      })
    }

    // --- Sync bus (outgoing changes) ---
    function handleSyncEvent(event: SyncEvent) {
      const currentUser = userRef.current
      if (!currentUser) return

      switch (event.type) {
        case 'project:save': {
          const state = useProjectStore.getState()
          const project = state.projects.find((p) => p.id === event.projectId)
          if (!project) return

          const existingDoc = docMetaRef.current.get(event.projectId)

          // ── Branch A: new project, no create in flight ───────────────────
          // docMetaRef is intentionally NOT set here. Keeping it undefined
          // causes every event in a rapid-fire burst to re-enter this branch
          // and reset the timer, so the single write that fires reads the
          // fully-accumulated store state. saveProjectImmediate (full setDoc,
          // no mergeFields) is required because saveProject strips owner,
          // failing the create rule:
          //   allow create: if isAuth() && resource.data.owner == auth.uid
          if (existingDoc === undefined && !inFlightCreatePromises.has(event.projectId)) {
            const existingTimer = pendingCreateTimers.get(event.projectId)
            if (existingTimer) clearTimeout(existingTimer)

            const projectId = event.projectId
            pendingCreateTimers.set(
              projectId,
              setTimeout(() => {
                pendingCreateTimers.delete(projectId)

                // Re-read auth at fire time — closure currentUser is up to
                // SAVE_DEBOUNCE_MS stale. uid is the closure variable from
                // setup(); abort if the active user changed during the wait.
                const liveUser = auth?.currentUser
                if (!liveUser || liveUser.uid !== uid) return

                const s = useProjectStore.getState()
                const p = s.projects.find((proj) => proj.id === projectId)
                if (!p) return // deleted before timer fired

                // Brief 39: the refusal text follows the access the user had
                // when the write was issued, not when it settles.
                const access = accessFromState(s, projectId)
                if (access === 'not-in-cloud') {
                  // Brief 39 (V5): no cloud view of this account contains this
                  // project — it may be someone else's, deleted, or never
                  // written. An edit never creates it (flushPendingCreates
                  // skips it too). Nothing is sent; it leaves at the next
                  // applied view, like every not-in-cloud project.
                  toast.error(NOT_IN_CLOUD_SAVE_TEXT)
                  return
                }

                const doc = projectToFirestoreDoc(
                  p,
                  s.sprints,
                  liveUser.uid,
                  undefined, // existingDoc undefined → owner = liveUser.uid
                  s._originRef || getWorkspaceId(),
                  s._changeLog
                )

                const rawPromise = saveProjectImmediate(projectId, doc)
                inFlightCreatePromises.set(projectId, rawPromise)

                rawPromise
                  .then(() => {
                    if (auth?.currentUser?.uid !== uid) return
                    // Set docMetaRef only on confirmed success. Next project:save
                    // sees existingDoc !== undefined → Branch C (update path).
                    // On failure docMetaRef stays unset so next event retries
                    // via Branch A.
                    docMetaRef.current.set(projectId, doc)
                  })
                  .catch((err) => {
                    console.error('Cloud project creation failed:', err)
                    toast.error(createFailureText(err, access))
                  })
                  .finally(() => {
                    inFlightCreatePromises.delete(projectId)
                  })
              }, SAVE_DEBOUNCE_MS)
            )
            break
          }

          // ── Branch B: new project, create in flight ──────────────────────
          // Calling saveProject now would mergeFields-write against a still-
          // non-existent doc → PERMISSION_DENIED. Chain the update behind the
          // create promise. By the time this .then fires, Branch A's .then
          // (same source promise, registered earlier → guaranteed prior
          // microtask) has set docMetaRef.
          if (existingDoc === undefined && inFlightCreatePromises.has(event.projectId)) {
            const rawPromise = inFlightCreatePromises.get(event.projectId)!
            const chainedId = event.projectId
            rawPromise
              .then(() => {
                const liveUser = auth?.currentUser
                if (!liveUser || liveUser.uid !== uid) return
                const s = useProjectStore.getState()
                const p = s.projects.find((proj) => proj.id === chainedId)
                if (!p) return // deleted during the create round-trip
                const latestExistingDoc = docMetaRef.current.get(chainedId)
                const doc = projectToFirestoreDoc(
                  p, s.sprints, liveUser.uid, latestExistingDoc,
                  s._originRef || getWorkspaceId(), s._changeLog
                )
                // Belt-and-braces: only update docMetaRef if Branch A's .then
                // populated it. If undefined (which shouldn't happen given
                // FIFO microtask ordering), saveProject still runs — the doc
                // exists in Firestore at this point so the update rule
                // accepts the mergeFields write.
                if (latestExistingDoc !== undefined) docMetaRef.current.set(chainedId, doc)
                const access = accessFromState(s, chainedId)
                saveProject(chainedId, doc, (err) => toast.error(saveFailureText(err, access)))
              })
              .catch(() => {
                // Create failed — skip chained update. Next project:save
                // retries via Branch A.
              })
            break
          }

          // ── Branch C: existing project — normal debounced update ─────────
          const doc = projectToFirestoreDoc(
            project,
            state.sprints,
            currentUser.uid,
            existingDoc,
            state._originRef || getWorkspaceId(),
            state._changeLog
          )
          docMetaRef.current.set(event.projectId, doc)
          const access = accessFromState(state, event.projectId)
          saveProject(event.projectId, doc, (err) => toast.error(saveFailureText(err, access)))
          break
        }
        case 'project:delete': {
          // Brief 39: the access the user had when they deleted, for the text
          // of a refusal. The store has dropped the project already; its role
          // entry stays until the next cloud view.
          const deleteAccess = accessFromState(useProjectStore.getState(), event.projectId)

          // ── Case 1: create timer not yet fired ────────────────────────────
          // Doc was never written to Firestore. Skip cloud delete — deleteDoc
          // against a non-existent document evaluates the delete rule against
          // a null resource → resource.data.owner throws → PERMISSION_DENIED.
          const pendingTimer = pendingCreateTimers.get(event.projectId)
          if (pendingTimer) {
            clearTimeout(pendingTimer)
            pendingCreateTimers.delete(event.projectId)
            break
          }

          // ── Case 2: create in flight — chain delete behind it ────────────
          // Without chaining: (a) deleteDoc may race ahead of the create →
          // PERMISSION_DENIED; (b) create lands after delete, snapshot
          // listener re-inserts the project the user just deleted ("zombie
          // reappear"). docMetaRef cleanup deliberately happens inside the
          // .then so Branch A's .then (which runs first) doesn't leave a
          // stale entry behind.
          const rawPromise = inFlightCreatePromises.get(event.projectId)
          if (rawPromise) {
            const deleteId = event.projectId
            // Tombstoned until the chained delete settles, or the create fails:
            // a snapshot raised in between must not append the project back.
            pendingDeletes.add(deleteId)
            rawPromise
              .then(() => {
                docMetaRef.current.delete(deleteId)
                return deleteProject(deleteId).catch((err) => {
                  console.error('Cloud delete failed (chained after create):', err)
                  toast.error(deleteFailureText(err, deleteAccess))
                })
              })
              .catch(() => {
                // Create failed — doc never written, no delete needed.
                // docMetaRef was never set by Branch A's .then on failure,
                // so no cleanup is required here either.
              })
              .finally(() => pendingDeletes.delete(deleteId))
            break
          }

          // ── Case 3: normal delete (doc confirmed in Firestore) ───────────
          const deletedId = event.projectId
          docMetaRef.current.delete(deletedId)
          pendingDeletes.add(deletedId)
          deleteProject(deletedId)
            .catch((err) => {
              console.error('Cloud delete failed:', err)
              toast.error(deleteFailureText(err, deleteAccess))
            })
            .finally(() => pendingDeletes.delete(deletedId))
          break
        }
        case 'project:import': {
          handleImportEvent(event, currentUser.uid)
          break
        }
        case 'settings:save': {
          const settingsState = useSettingsStore.getState()
          const doc = settingsToFirestoreDoc(settingsState)
          saveSettings(currentUser.uid, doc)
          break
        }
      }
    }


    // ── Imports (Brief 39: write hygiene) ──────────────────────────────────
    // An import writes exactly its own footprint — the projects it saved and the
    // projects it removed (the event carries both) — and nothing else. Until
    // Brief 39 it re-saved EVERY project with a full setDoc (each one the user
    // could only view was refused, with a toast), deleted every cloud project
    // the store lacked (including ones unshared or deleted elsewhere, still in
    // docMetaRef), and cancelled every pending save and create — which only the
    // save-all made harmless.

    /**
     * Brief 40's first constraint: cancel only what the import itself rewrites
     * or deletes. A pre-import save of such a project would land after the
     * import's write and undo it; any other project's pending save or create
     * keeps its own timer.
     */
    function cancelSupersededWrites(projectIds: string[]): void {
      cancelPendingProjectSaves(projectIds)
      for (const projectId of projectIds) {
        const timer = pendingCreateTimers.get(projectId)
        if (timer) clearTimeout(timer)
        pendingCreateTimers.delete(projectId)
      }
    }

    /**
     * Pre-seed docMetaRef for name-conflict winner IDs so projectToFirestoreDoc
     * receives the old doc's owner/members instead of defaulting to the current
     * user with empty members (pitfall #7). Only an owner may write a doc whose
     * owner is not themselves — and since Brief 39 only an owner is offered a
     * name-conflict replace. Runs BEFORE the deletes, which drop the old entry.
     */
    function preseedReplacedOwnership(replacedIdMap: Map<string, string>, uid: string): Map<string, FirestoreProjectDoc> {
      const preseeded = new Map<string, FirestoreProjectDoc>()
      for (const [existingId, winnerId] of replacedIdMap) {
        const oldDoc = docMetaRef.current.get(existingId)
        if (oldDoc && oldDoc.owner === uid && latestViewIds.has(existingId) && !latestViewIds.has(winnerId)) {
          docMetaRef.current.set(winnerId, oldDoc)
          preseeded.set(winnerId, oldDoc)
        }
      }
      return preseeded
    }

    /**
     * Save one imported project (immediate, full document).
     *
     * ⚠️ owner/members come from docMetaRef ONLY for a project in the latest
     * view, or from the pre-seed for an owner's name-conflict winner (Brief 39).
     * docMetaRef never forgets a document that left the view: re-importing a
     * project deleted elsewhere used to re-create it with its old members.
     *
     * ⚠️ "Is this a create?" is decided by the VIEW, not by docMetaRef: the
     * pre-seed has put the winner into docMetaRef already, and a winner that
     * is not create-unconfirmed is dropped by any raise built before the import
     * (snapshot-merge.ts, Rule 3) and re-appended last when its own raise arrives.
     */
    function saveImportedProject(
      project: Project,
      uid: string,
      preseeded: Map<string, FirestoreProjectDoc>
    ): void {
      const state = useProjectStore.getState()
      const isCreate = !latestViewIds.has(project.id)
      const ownership = isCreate ? preseeded.get(project.id) : docMetaRef.current.get(project.id)
      const access = accessFromState(state, project.id)
      const doc = projectToFirestoreDoc(
        project,
        state.sprints,
        uid,
        ownership,
        state._originRef || getWorkspaceId(),
        state._changeLog
      )
      docMetaRef.current.set(project.id, doc)
      if (isCreate) importCreatesInFlight.add(project.id)
      importSavesInFlight.set(project.id, (importSavesInFlight.get(project.id) ?? 0) + 1)
      saveProjectImmediate(project.id, doc)
        .catch((err) => {
          console.error(`Cloud import save failed for ${project.id}:`, err)
          toast.error(importSaveFailureText(err, project.name, access, isCreate))
        })
        .finally(() => {
          const left = (importSavesInFlight.get(project.id) ?? 1) - 1
          if (left > 0) importSavesInFlight.set(project.id, left)
          else importSavesInFlight.delete(project.id)
          if (left <= 0) importCreatesInFlight.delete(project.id)
        })
    }

    function handleImportEvent(event: Extract<SyncEvent, { type: 'project:import' }>, uid: string): void {
      cancelSupersededWrites([...event.savedIds, ...event.deletedIds])
      const preseeded = preseedReplacedOwnership(event.replacedIdMap, uid)
      // Brief 40's third constraint: delete only what the import removed, and
      // only if this account's cloud holds it (the latest view) or this browser
      // is creating it — through the ordinary delete path, with its tombstone.
      // An id never written, or held without any cloud view (V1), is skipped.
      for (const projectId of event.deletedIds) {
        if (latestViewIds.has(projectId) || inFlightCreatePromises.has(projectId)) {
          handleSyncEvent({ type: 'project:delete', projectId })
        }
      }
      const saved = new Set(event.savedIds)
      for (const project of useProjectStore.getState().projects) {
        if (saved.has(project.id)) saveImportedProject(project, uid, preseeded)
      }
    }

    /** R2: before the first load has succeeded, project writes are held, not sent. */
    function holdBeforeBaseline(event: SyncEvent): boolean {
      if (baselineReady || !isProjectEvent(event)) return false
      if (event.type === 'project:import') {
        console.warn('Import arrived before the first cloud load; discarded (Import is disabled until then).')
      } else {
        heldProjectIds.add(event.projectId)
      }
      return true
    }

    unsubscribeSyncBus = syncBus.subscribe((event) => {
      if (!holdBeforeBaseline(event)) handleSyncEvent(event)
    })

    // Try again (Brief 40): wakes whichever first-load wait is current. While an
    // attempt is in flight there is no wait to wake, and the press does nothing.
    const unsubscribeRetryRequests = useProjectStore.subscribe((state, prev) => {
      if (state.cloudLoadRetryRequests !== prev.cloudLoadRetryRequests) wakeRetry?.()
    })

    setup()

    // --- Flush on beforeunload ---
    // v0.28.3 L3 (UX): if the user signs out and immediately closes the tab,
    // the listener can fire AFTER `firebaseSignOut()` has revoked the token
    // but BEFORE React commits `setUser(null)` and tears down this effect.
    // Flushing in that window dispatches Firestore writes against a stale
    // auth context — Firestore rejects them, but the user sees toast errors
    // on the way out. Gate on `auth.currentUser` so the post-sign-out window
    // routes to cancel instead.
    function handleBeforeUnload() {
      if (auth?.currentUser) {
        flushPendingCreates()
        flushPendingSaves()
      } else {
        for (const t of pendingCreateTimers.values()) clearTimeout(t)
        pendingCreateTimers.clear()
        cancelPendingSaves()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    // D2 — pagehide covers bfcache navigations and iOS Safari, where
    // beforeunload is not reliably delivered. Both listeners route through
    // the same handler; flushPendingSaves is idempotent (the second call
    // finds no pending timers).
    window.addEventListener('pagehide', handleBeforeUnload)

    return () => {
      // Set cancelled = true FIRST. If setup() is suspended at an await, the
      // next microtask resumes and hits its `cancelled` checks — so
      // setCloudDataLoaded(true) is suppressed and cleanup's false wins
      // (pitfall #88).
      cancelled = true
      // Wake any first-load wait: its loop sees `cancelled` and exits, setting
      // no state.
      wakeRetry?.()
      unsubscribeRetryRequests()
      const store = useProjectStore.getState()
      store.setCloudDataLoaded(false)
      store.setCloudLoadRetrying(false)
      store.setCloudLoadError(null)
      store.setProjectRoles({})
      unsubscribeSnapshot?.()
      unsubscribeSyncBus?.()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
      // Teardown fires on sign-out (credentials revoked) and mode switch.
      // Flushing would send writes against stale auth; cancel instead. The
      // beforeunload handler above remains the only flush path. In-flight
      // creates (saveProjectImmediate already dispatched) cannot be recalled;
      // their .then user-guards (auth?.currentUser?.uid !== uid) suppress
      // docMetaRef writes for the user-switch case.
      for (const t of pendingCreateTimers.values()) clearTimeout(t)
      pendingCreateTimers.clear()
      cancelPendingSaves()
    }
  }, [isActive, user])
}
